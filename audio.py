"""Audio engine — file loading, playback, L/R/C channel buffers, mono detection.

Interface (stable):
    load(filepath) -> bool
    play() / pause() / stop() / shutdown()
    get_samples(n) -> np.ndarray | None
    get_channel_samples(n) -> ChannelSamples | None
    is_loaded, is_playing, position, duration, filename, samplerate
"""

import os
import threading

import numpy as np
import soundfile as sf
import sounddevice as sd

RING_BUFFER_SIZE = 8192

# Mono detection thresholds (from original Auralprint)
MONO_SILENCE_RMS = 0.002
MONO_CORRELATION_THRESHOLD = 0.995
MONO_CORRELATION_STRIDE = 8


# ── Channel samples result ─────────────────────────────────────


class ChannelSamples:
    """Snapshot of L/R/C sample buffers with mono detection result."""

    __slots__ = ("left", "right", "center", "is_stereo")

    def __init__(self, left, right, center, is_stereo):
        self.left = left          # float32 array
        self.right = right        # float32 array
        self.center = center      # float32 array (adaptive: L-only when mono)
        self.is_stereo = is_stereo  # bool


# ── Ring buffer ────────────────────────────────────────────────


class _RingBuffer:

    def __init__(self, size):
        self.data = np.zeros(size, dtype=np.float32)
        self.pos = 0
        self.valid = 0
        self.size = size

    def push(self, samples):
        n = len(samples)
        if n >= self.size:
            self.data[:] = samples[-self.size:]
            self.pos = 0
            self.valid = self.size
            return

        end = self.pos + n
        if end <= self.size:
            self.data[self.pos:end] = samples
        else:
            first = self.size - self.pos
            self.data[self.pos:] = samples[:first]
            self.data[:n - first] = samples[first:]

        self.pos = end % self.size
        self.valid = min(self.valid + n, self.size)

    def read(self, n):
        if self.valid == 0:
            return None
        take = min(n, self.valid)
        end = self.pos
        start = (end - take) % self.size

        if start < end:
            return self.data[start:end].copy()
        else:
            return np.concatenate([self.data[start:], self.data[:end]]).copy()

    def reset(self):
        self.data[:] = 0.0
        self.pos = 0
        self.valid = 0


# ── Mono detection ─────────────────────────────────────────────


def _detect_stereo(left, right):
    """Return True if the signal is stereo, False if mono-ish or silent."""
    rms_r = float(np.sqrt(np.mean(right * right)))
    if rms_r < MONO_SILENCE_RMS:
        return False

    stride = MONO_CORRELATION_STRIDE
    l = left[::stride]
    r = right[::stride]

    dot_lr = np.dot(l, r)
    dot_ll = np.dot(l, l)
    dot_rr = np.dot(r, r)

    denom = np.sqrt(max(float(dot_ll * dot_rr), 1e-12))
    correlation = float(dot_lr) / denom

    return correlation < MONO_CORRELATION_THRESHOLD


# ── Audio engine ───────────────────────────────────────────────


class AudioEngine:

    def __init__(self):
        self._data = None           # (samples, channels) float32
        self._samplerate = 0
        self._channels = 0
        self._position = 0          # sample index into _data
        self._playing = False
        self._stream = None
        self._lock = threading.Lock()
        self._filename = ""

        self._ring_l = _RingBuffer(RING_BUFFER_SIZE)
        self._ring_r = _RingBuffer(RING_BUFFER_SIZE)
        self._ring_c = _RingBuffer(RING_BUFFER_SIZE)

    # ── Interface ──────────────────────────────────────────────

    def load(self, filepath):
        """Load an audio file. Stops current playback first. Returns True on success."""
        self.stop()
        self._close_stream()

        try:
            data, sr = sf.read(filepath, dtype="float32", always_2d=True)
        except Exception:
            return False

        self._data = data
        self._samplerate = sr
        self._channels = data.shape[1]
        self._position = 0
        self._playing = False
        self._filename = os.path.basename(filepath)

        self._ring_l.reset()
        self._ring_r.reset()
        self._ring_c.reset()

        self._stream = sd.OutputStream(
            samplerate=sr,
            channels=self._channels,
            dtype="float32",
            callback=self._audio_callback,
        )
        self._stream.start()
        return True

    def play(self):
        """Start or resume playback. Restarts from beginning if at end of file."""
        if self._data is None:
            return
        with self._lock:
            if self._position >= len(self._data):
                self._position = 0
            self._playing = True

    def pause(self):
        """Pause playback at current position."""
        with self._lock:
            self._playing = False

    def stop(self):
        """Stop playback and reset position to start."""
        with self._lock:
            self._playing = False
            self._position = 0

    def shutdown(self):
        """Release all resources. Call on application exit."""
        self.stop()
        self._close_stream()

    def get_samples(self, n):
        """Return the most recent n center-channel samples (50/50 L+R), or None."""
        with self._lock:
            return self._ring_c.read(n)

    def get_channel_samples(self, n):
        """Return L/R/C channel samples with mono detection, or None.

        Center channel adapts: 50/50 L+R when stereo, L-only when mono-ish.
        """
        with self._lock:
            left = self._ring_l.read(n)
            right = self._ring_r.read(n)
            center_raw = self._ring_c.read(n)

        if left is None or right is None or center_raw is None:
            return None

        is_stereo = _detect_stereo(left, right)

        if is_stereo:
            center = center_raw
        else:
            center = left.copy()

        return ChannelSamples(left, right, center, is_stereo)

    @property
    def is_loaded(self):
        return self._data is not None

    @property
    def is_playing(self):
        return self._playing

    @property
    def position(self):
        """Current playback position in seconds."""
        if self._data is None or self._samplerate == 0:
            return 0.0
        return self._position / self._samplerate

    @property
    def duration(self):
        """Total duration in seconds."""
        if self._data is None or self._samplerate == 0:
            return 0.0
        return len(self._data) / self._samplerate

    @property
    def filename(self):
        return self._filename

    @property
    def samplerate(self):
        return self._samplerate

    # ── Internal ──────────────────────────────────────────────

    def _audio_callback(self, outdata, frames, time_info, status):
        """sounddevice output callback. Runs on the audio thread."""
        with self._lock:
            if not self._playing or self._data is None:
                outdata[:] = 0.0
                self._push_to_rings(outdata)
                return

            start = self._position
            end = start + frames
            total = len(self._data)

            if start >= total:
                outdata[:] = 0.0
                self._playing = False
                self._push_to_rings(outdata)
                return

            if end <= total:
                outdata[:] = self._data[start:end]
                self._position = end
            else:
                valid = total - start
                outdata[:valid] = self._data[start:total]
                outdata[valid:] = 0.0
                self._position = total
                self._playing = False

            self._push_to_rings(outdata)

    def _push_to_rings(self, outdata):
        """Split output into L/R/C and push to ring buffers.

        Called inside the audio callback, under self._lock.
        """
        if self._channels >= 2:
            left = outdata[:, 0]
            right = outdata[:, 1]
        else:
            left = outdata.ravel() if outdata.ndim == 1 else outdata[:, 0]
            right = left

        center = (left + right) * 0.5

        self._ring_l.push(left)
        self._ring_r.push(right)
        self._ring_c.push(center)

    def _close_stream(self):
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None
