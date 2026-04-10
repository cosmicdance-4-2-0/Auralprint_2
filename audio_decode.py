"""Shared audio decode pipeline with backend fallbacks.

Primary backend order:
    1) PyAV (FFmpeg)
    2) audioread
    3) soundfile (fast-path fallback)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from audio_errors import (
    AudioDomainError,
    AudioErrorInfo,
    CorruptedFileError,
    PartialDecodeWarning,
    UnsupportedFormatError,
)


@dataclass(frozen=True)
class DecodedAudio:
    """Normalized decode output for all backends."""

    samples: np.ndarray  # float32, shape (n, channels)
    samplerate: int
    channels: int
    backend: str
    warning: AudioErrorInfo | None = None


@dataclass(frozen=True)
class DecodeFailure:
    """Structured decode failure payload for UI/error reporting."""

    filepath: str
    error: AudioErrorInfo


def decode_audio(filepath: str) -> DecodedAudio:
    """Decode audio to float32 samples with backend fallback."""
    backend_errors = []

    for decoder in (_decode_with_pyav, _decode_with_audioread, _decode_with_soundfile):
        try:
            return decoder(filepath)
        except AudioDomainError as exc:
            backend_errors.append(exc)
            continue

    last = backend_errors[-1] if backend_errors else CorruptedFileError(
        "No decoder backend available",
        backend="decoder",
    )
    raise CorruptedFileError(
        f"Audio decode failed after fallback chain: {last.message}",
        backend=last.backend,
        cause=last,
    )


def try_decode_audio(filepath: str) -> tuple[Optional[DecodedAudio], Optional[DecodeFailure]]:
    """Safe decode helper returning a structured failure for UI workflows."""
    try:
        return decode_audio(filepath), None
    except AudioDomainError as exc:
        return None, DecodeFailure(
            filepath=filepath,
            error=exc.to_info(),
        )


def _decode_with_pyav(filepath: str) -> DecodedAudio:
    try:
        import av
    except Exception as exc:
        raise CorruptedFileError("PyAV is not available", backend="pyav", cause=exc) from exc

    try:
        with av.open(filepath) as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise UnsupportedFormatError(
                    "No audio stream found",
                    backend="pyav",
                )

            chunks = []
            sample_rate = int(stream.rate or 0)
            channels = int(getattr(stream.codec_context, "channels", 0) or 0)

            for frame in container.decode(stream):
                frame_rate = int(frame.sample_rate or sample_rate)
                if sample_rate and frame_rate and frame_rate != sample_rate:
                    raise CorruptedFileError(
                        f"Variable samplerate stream is unsupported ({sample_rate} -> {frame_rate})",
                        backend="pyav",
                    )
                sample_rate = frame_rate or sample_rate

                # fltp -> (channels, samples)
                frame_arr = frame.to_ndarray(format="fltp")
                if frame_arr.ndim != 2:
                    raise CorruptedFileError(
                        "Unexpected decoded frame shape",
                        backend="pyav",
                    )
                chunks.append(frame_arr.T.astype(np.float32, copy=False))

            if not chunks:
                raise CorruptedFileError("No decodable audio frames produced", backend="pyav")

            samples = np.concatenate(chunks, axis=0)
            channels = channels or int(samples.shape[1])
            if sample_rate <= 0 or channels <= 0:
                raise CorruptedFileError(
                    "Decoded stream metadata is invalid",
                    backend="pyav",
                )
            return DecodedAudio(samples=samples, samplerate=sample_rate, channels=channels, backend="pyav")
    except AudioDomainError:
        raise
    except (OSError, EOFError, ValueError) as exc:
        raise CorruptedFileError(
            f"Stream appears truncated or unreadable: {exc}",
            backend="pyav",
            cause=exc,
        ) from exc
    except av.error.FFmpegError as exc:  # type: ignore[attr-defined]
        msg = str(exc)
        if "invalid data" in msg.lower():
            raise CorruptedFileError(f"FFmpeg decode failed: {msg}", backend="pyav", cause=exc) from exc
        raise UnsupportedFormatError(f"FFmpeg could not decode this codec: {msg}", backend="pyav", cause=exc) from exc
    except Exception as exc:
        raise CorruptedFileError(f"PyAV decode failed: {exc}", backend="pyav", cause=exc) from exc


def _decode_with_audioread(filepath: str) -> DecodedAudio:
    try:
        import audioread
    except Exception as exc:
        raise CorruptedFileError("audioread is not available", backend="audioread", cause=exc) from exc

    chunks = []
    sample_rate = 0
    channels = 0
    try:
        with audioread.audio_open(filepath) as src:
            sample_rate = int(src.samplerate)
            channels = int(src.channels)

            for chunk in src:
                if not chunk:
                    continue
                pcm = np.frombuffer(chunk, dtype=np.int16)
                if channels > 0 and pcm.size % channels:
                    raise CorruptedFileError("PCM chunk size is not channel-aligned", backend="audioread")
                chunks.append((pcm.reshape(-1, channels).astype(np.float32)) / 32768.0)

            if not chunks:
                raise CorruptedFileError("No PCM frames produced", backend="audioread")

            samples = np.concatenate(chunks, axis=0)
            return DecodedAudio(samples=samples, samplerate=sample_rate, channels=channels, backend="audioread")
    except AudioDomainError:
        raise
    except (EOFError, OSError, ValueError) as exc:
        if chunks:
            samples = np.concatenate(chunks, axis=0)
            warning = PartialDecodeWarning(
                f"audioread stream ended early; decoded {len(samples)} samples before failure: {exc}",
                backend="audioread",
                cause=exc,
            ).to_info()
            return DecodedAudio(
                samples=samples,
                samplerate=sample_rate,
                channels=max(1, channels),
                backend="audioread",
                warning=warning,
            )
        raise CorruptedFileError(f"audioread stream ended unexpectedly: {exc}", backend="audioread", cause=exc) from exc
    except Exception as exc:
        raise CorruptedFileError(f"audioread decode failed: {exc}", backend="audioread", cause=exc) from exc


def _decode_with_soundfile(filepath: str) -> DecodedAudio:
    try:
        import soundfile as sf
    except Exception as exc:
        raise CorruptedFileError("soundfile is not available", backend="soundfile", cause=exc) from exc

    try:
        data, sr = sf.read(filepath, dtype="float32", always_2d=True)
        if data.size == 0:
            raise CorruptedFileError("soundfile returned empty stream", backend="soundfile")
        return DecodedAudio(
            samples=np.asarray(data, dtype=np.float32),
            samplerate=int(sr),
            channels=int(data.shape[1]),
            backend="soundfile",
        )
    except RuntimeError as exc:
        msg = str(exc)
        lower = msg.lower()
        if "format not recognised" in lower or "unknown format" in lower:
            raise UnsupportedFormatError(f"soundfile cannot decode this format: {msg}", backend="soundfile", cause=exc) from exc
        raise CorruptedFileError(f"soundfile decode failed: {msg}", backend="soundfile", cause=exc) from exc
    except Exception as exc:
        raise CorruptedFileError(f"soundfile decode failed: {exc}", backend="soundfile", cause=exc) from exc
