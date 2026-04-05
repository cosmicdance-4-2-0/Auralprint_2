"""Audio engine — file loading and playback via sounddevice.

Interface (stable):
    load(filepath) -> bool
    play() / pause() / stop() / shutdown()
    get_samples(n) -> np.ndarray | None
    is_loaded, is_playing, position, duration, filename, samplerate
"""

import os
import threading

import numpy as np
import soundfile as sf
import sounddevice as sd

SAMPLE_BUFFER_SIZE = 8192  # mono samples; covers any reasonable FFT size


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

        # Ring buffer for analysis — always mono, always allocated
        self._ring = np.zeros(SAMPLE_BUFFER_SIZE, dtype=np.float32)
        self._ring_pos = 0          # next write position
        self._ring_valid = 0        # number of valid samples currently in buffer

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

        # Reset analysis buffer for the new track
        self._ring[:] = 0.0
        self._ring_pos = 0
        self._ring_valid = 0

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
        """Return the most recent n mono samples, or None if insufficient data."""
        with self._lock:
            if self._ring_valid == 0:
                return None

            take = min(n, self._ring_valid)
            buf_len = len(self._ring)
            end = self._ring_pos
            start = (end - take) % buf_len

            if start < end:
                return self._ring[start:end].copy()
            else:
                return np.concatenate([
                    self._ring[start:],
                    self._ring[:end],
                ]).copy()

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
                self._push_to_ring(outdata)
                return

            start = self._position
            end = start + frames
            total = len(self._data)

            if start >= total:
                outdata[:] = 0.0
                self._playing = False
                self._push_to_ring(outdata)
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

            self._push_to_ring(outdata)

    def _push_to_ring(self, outdata):
        """Write mono-mixed output samples to the analysis ring buffer.

        Called inside the audio callback, under self._lock.
        """
        if outdata.ndim == 1 or outdata.shape[1] == 1:
            mono = outdata.ravel()
        else:
            mono = outdata.mean(axis=1)

        n = len(mono)
        buf_len = len(self._ring)
        pos = self._ring_pos

        if n >= buf_len:
            self._ring[:] = mono[-buf_len:]
            self._ring_pos = 0
            self._ring_valid = buf_len
            return

        end = pos + n
        if end <= buf_len:
            self._ring[pos:end] = mono
        else:
            first = buf_len - pos
            self._ring[pos:] = mono[:first]
            self._ring[:n - first] = mono[first:]

        self._ring_pos = end % buf_len
        self._ring_valid = min(self._ring_valid + n, buf_len)

    def _close_stream(self):
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None
