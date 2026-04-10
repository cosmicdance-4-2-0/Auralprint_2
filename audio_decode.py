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


@dataclass(frozen=True)
class DecodedAudio:
    """Normalized decode output for all backends."""

    samples: np.ndarray  # float32, shape (n, channels)
    samplerate: int
    channels: int
    backend: str


@dataclass(frozen=True)
class DecodeFailure:
    """Structured decode failure payload for UI/error reporting."""

    filepath: str
    backend: str
    code: str
    message: str
    cause: str = ""


class BackendDecodeError(Exception):
    """Base exception carrying backend-level decode context."""

    def __init__(self, *, backend: str, code: str, message: str, cause: Exception | None = None):
        super().__init__(message)
        self.backend = backend
        self.code = code
        self.message = message
        self.cause = cause


class UnsupportedCodecError(BackendDecodeError):
    pass


class DecodeReadError(BackendDecodeError):
    pass


class TruncatedStreamError(BackendDecodeError):
    pass


def decode_audio(filepath: str) -> DecodedAudio:
    """Decode audio to float32 samples with backend fallback."""
    backend_errors = []

    for decoder in (_decode_with_pyav, _decode_with_audioread, _decode_with_soundfile):
        try:
            return decoder(filepath)
        except BackendDecodeError as exc:
            backend_errors.append(exc)
            continue

    last = backend_errors[-1] if backend_errors else DecodeReadError(
        backend="decoder", code="decode_error", message="No decoder backend available"
    )
    raise DecodeReadError(
        backend=last.backend,
        code=last.code,
        message=f"Audio decode failed after fallback chain: {last.message}",
        cause=last,
    )


def try_decode_audio(filepath: str) -> tuple[Optional[DecodedAudio], Optional[DecodeFailure]]:
    """Safe decode helper returning a structured failure for UI workflows."""
    try:
        return decode_audio(filepath), None
    except BackendDecodeError as exc:
        cause_text = repr(exc.cause) if exc.cause is not None else ""
        return None, DecodeFailure(
            filepath=filepath,
            backend=exc.backend,
            code=exc.code,
            message=exc.message,
            cause=cause_text,
        )


def _decode_with_pyav(filepath: str) -> DecodedAudio:
    try:
        import av
    except Exception as exc:
        raise DecodeReadError(
            backend="pyav", code="backend_unavailable", message="PyAV is not available", cause=exc
        ) from exc

    try:
        with av.open(filepath) as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise UnsupportedCodecError(
                    backend="pyav", code="unsupported_codec", message="No audio stream found"
                )

            chunks = []
            sample_rate = int(stream.rate or 0)
            channels = int(getattr(stream.codec_context, "channels", 0) or 0)

            for frame in container.decode(stream):
                frame_rate = int(frame.sample_rate or sample_rate)
                if sample_rate and frame_rate and frame_rate != sample_rate:
                    raise DecodeReadError(
                        backend="pyav",
                        code="decode_error",
                        message=f"Variable samplerate stream is unsupported ({sample_rate} -> {frame_rate})",
                    )
                sample_rate = frame_rate or sample_rate

                # fltp -> (channels, samples)
                frame_arr = frame.to_ndarray(format="fltp")
                if frame_arr.ndim != 2:
                    raise DecodeReadError(
                        backend="pyav", code="decode_error", message="Unexpected decoded frame shape"
                    )
                chunks.append(frame_arr.T.astype(np.float32, copy=False))

            if not chunks:
                raise DecodeReadError(
                    backend="pyav", code="decode_error", message="No decodable audio frames produced"
                )

            samples = np.concatenate(chunks, axis=0)
            channels = channels or int(samples.shape[1])
            if sample_rate <= 0 or channels <= 0:
                raise DecodeReadError(
                    backend="pyav", code="decode_error", message="Decoded stream metadata is invalid"
                )
            return DecodedAudio(samples=samples, samplerate=sample_rate, channels=channels, backend="pyav")
    except BackendDecodeError:
        raise
    except (OSError, EOFError) as exc:
        raise TruncatedStreamError(
            backend="pyav", code="truncated_stream", message="Stream appears truncated or unreadable", cause=exc
        ) from exc
    except av.error.FFmpegError as exc:  # type: ignore[attr-defined]
        raise UnsupportedCodecError(
            backend="pyav", code="unsupported_codec", message="FFmpeg could not decode this codec", cause=exc
        ) from exc
    except Exception as exc:
        raise DecodeReadError(backend="pyav", code="decode_error", message="PyAV decode failed", cause=exc) from exc


def _decode_with_audioread(filepath: str) -> DecodedAudio:
    try:
        import audioread
    except Exception as exc:
        raise DecodeReadError(
            backend="audioread", code="backend_unavailable", message="audioread is not available", cause=exc
        ) from exc

    try:
        with audioread.audio_open(filepath) as src:
            sample_rate = int(src.samplerate)
            channels = int(src.channels)
            chunks = []

            for chunk in src:
                if not chunk:
                    continue
                pcm = np.frombuffer(chunk, dtype=np.int16)
                if channels > 0 and pcm.size % channels:
                    raise TruncatedStreamError(
                        backend="audioread",
                        code="truncated_stream",
                        message="PCM chunk size is not channel-aligned",
                    )
                chunks.append((pcm.reshape(-1, channels).astype(np.float32)) / 32768.0)

            if not chunks:
                raise DecodeReadError(
                    backend="audioread", code="decode_error", message="No PCM frames produced"
                )

            samples = np.concatenate(chunks, axis=0)
            return DecodedAudio(samples=samples, samplerate=sample_rate, channels=channels, backend="audioread")
    except BackendDecodeError:
        raise
    except (EOFError, OSError, ValueError) as exc:
        raise TruncatedStreamError(
            backend="audioread", code="truncated_stream", message="audioread stream ended unexpectedly", cause=exc
        ) from exc
    except Exception as exc:
        raise DecodeReadError(
            backend="audioread", code="decode_error", message="audioread decode failed", cause=exc
        ) from exc


def _decode_with_soundfile(filepath: str) -> DecodedAudio:
    try:
        import soundfile as sf
    except Exception as exc:
        raise DecodeReadError(
            backend="soundfile", code="backend_unavailable", message="soundfile is not available", cause=exc
        ) from exc

    try:
        data, sr = sf.read(filepath, dtype="float32", always_2d=True)
        if data.size == 0:
            raise DecodeReadError(
                backend="soundfile", code="decode_error", message="soundfile returned empty stream"
            )
        return DecodedAudio(
            samples=np.asarray(data, dtype=np.float32),
            samplerate=int(sr),
            channels=int(data.shape[1]),
            backend="soundfile",
        )
    except RuntimeError as exc:
        raise UnsupportedCodecError(
            backend="soundfile", code="unsupported_codec", message="soundfile cannot decode this format", cause=exc
        ) from exc
    except Exception as exc:
        raise DecodeReadError(
            backend="soundfile", code="decode_error", message="soundfile decode failed", cause=exc
        ) from exc
