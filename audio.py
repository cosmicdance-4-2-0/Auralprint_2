"""Audio engine — file loading, playback, L/R/C channel buffers, mono detection.

Interface (stable):
    load(filepath) -> bool
    play() / pause() / stop() / shutdown()
    seek(seconds)
    get_samples(n) -> np.ndarray | None
    get_channel_samples(n) -> ChannelSamples | None
    is_loaded, is_playing, position, duration, filename, samplerate
    volume, muted
    on_track_ended: callable or None
"""

import os
import threading

import numpy as np
import soundfile as sf
import sounddevice as sd

RING_BUFFER_SIZE = 8192

VOLUME_DEFAULT = 1.0
VOLUME_MIN = 0.0
VOLUME_MAX = 1.0

# Mono detection thresholds
MONO_SILENCE_RMS = 0.002
MONO_CORRELATION_THRESHOLD = 0.995
MONO_CORRELATION_STRIDE = 8


# ── Channel samples result ─────────────────────────────────────


class ChannelSamples:
    """Snapshot of L/R/C sample buffers with mono detection result."""

    __slots__ = ("left", "right", "center", "is_stereo")

    def __init__(self, left, right, center, is_stereo):
        self.left = left
        self.right = right
        self.center = center
        self.is_stereo = is_stereo


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
        self._data = None
        self._samplerate = 0
        self._channels = 0
        self._position = 0
        self._playing = False
        self._stream = None
        self._lock = threading.Lock()
        self._filename = ""

        self._volume = VOLUME_DEFAULT
        self._muted = False
        self._ended_flag = False     # set by callback, consumed by main thread

        self._ring_l = _RingBuffer(RING_BUFFER_SIZE)
        self._ring_r = _RingBuffer(RING_BUFFER_SIZE)
        self._ring_c = _RingBuffer(RING_BUFFER_SIZE)

        # User-assignable callback, called from poll_events() on main thread
        self.on_track_ended = None

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
        self._ended_flag = False

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

    def seek(self, seconds):
        """Seek to a position in seconds. Clamps to valid range."""
        if self._data is None or self._samplerate == 0:
            return
        with self._lock:
            sample = int(seconds * self._samplerate)
            self._position = max(0, min(sample, len(self._data)))

    def shutdown(self):
        """Release all resources. Call on application exit."""
        self.stop()
        self._close_stream()

    def poll_events(self):
        """Check for async events (track ended). Call once per frame from main thread."""
        with self._lock:
            ended = self._ended_flag
            self._ended_flag = False
        if ended and callable(self.on_track_ended):
            self.on_track_ended()

    def get_samples(self, n):
        """Return the most recent n center-channel samples, or None."""
        with self._lock:
            return self._ring_c.read(n)

    def get_channel_samples(self, n):
        """Return L/R/C channel samples with mono detection, or None."""
        with self._lock:
            left = self._ring_l.read(n)
            right = self._ring_r.read(n)
            center_raw = self._ring_c.read(n)

        if left is None or right is None or center_raw is None:
            return None

        is_stereo = _detect_stereo(left, right)
        center = center_raw if is_stereo else left.copy()

        return ChannelSamples(left, right, center, is_stereo)

    @property
    def is_loaded(self):
        return self._data is not None

    @property
    def is_playing(self):
        return self._playing

    @property
    def position(self):
        if self._data is None or self._samplerate == 0:
            return 0.0
        return self._position / self._samplerate

    @property
    def duration(self):
        if self._data is None or self._samplerate == 0:
            return 0.0
        return len(self._data) / self._samplerate

    @property
    def filename(self):
        return self._filename

    @property
    def samplerate(self):
        return self._samplerate

    @property
    def volume(self):
        return self._volume

    @volume.setter
    def volume(self, val):
        self._volume = max(VOLUME_MIN, min(VOLUME_MAX, float(val)))

    @property
    def muted(self):
        return self._muted

    @muted.setter
    def muted(self, val):
        self._muted = bool(val)

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
                self._ended_flag = True
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
                self._ended_flag = True

            # Analysis always sees the full signal (pre-gain, pre-mute)
            self._push_to_rings(outdata)

            # Apply volume and mute to the output only
            if self._muted:
                outdata[:] = 0.0
            else:
                outdata *= self._volume

    def _push_to_rings(self, outdata):
        """Split output into L/R/C and push to ring buffers."""
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
