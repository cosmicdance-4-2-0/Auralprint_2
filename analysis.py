"""FFT analysis pipeline.

Interface (stable):
    process(samples) -> AnalysisResult | None
    fft_size: int (read-only after init)
"""

import numpy as np

FFT_SIZE_DEFAULT = 2048


class AnalysisResult:
    """Output of a single analysis frame."""

    __slots__ = ("magnitudes_db", "rms", "num_bins")

    def __init__(self, magnitudes_db, rms, num_bins):
        self.magnitudes_db = magnitudes_db  # float32 array, length num_bins
        self.rms = rms                      # float, 0.0+ (unscaled)
        self.num_bins = num_bins             # int, == fft_size // 2 + 1


class Analyzer:

    def __init__(self, fft_size=FFT_SIZE_DEFAULT):
        self.fft_size = fft_size
        self._window = np.hanning(fft_size).astype(np.float32)

    def process(self, samples):
        """Run FFT on the most recent fft_size mono samples.

        Args:
            samples: float32 1-D array of mono audio samples, or None.

        Returns:
            AnalysisResult if enough samples are available, else None.
        """
        if samples is None or len(samples) < self.fft_size:
            return None

        chunk = samples[-self.fft_size :]

        rms = float(np.sqrt(np.mean(chunk * chunk)))

        windowed = chunk * self._window
        spectrum = np.fft.rfft(windowed)
        magnitudes = np.abs(spectrum) / self.fft_size
        magnitudes_db = 20.0 * np.log10(np.maximum(magnitudes, 1e-10))

        return AnalysisResult(
            magnitudes_db=magnitudes_db.astype(np.float32),
            rms=rms,
            num_bins=len(magnitudes_db),
        )
