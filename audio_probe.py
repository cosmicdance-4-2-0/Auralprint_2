"""Audio metadata probing via PyAV container/stream introspection."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from audio_errors import AudioErrorInfo, CorruptedFileError, UnsupportedFormatError

@dataclass(frozen=True)
class AudioMetadata:
    """Typed metadata discovered from container/stream headers."""

    filepath: str
    container_format: Optional[str] = None
    audio_codec: Optional[str] = None

    container_duration_sec: Optional[float] = None
    stream_duration_sec: Optional[float] = None

    sample_rate_hz: Optional[int] = None
    channels: Optional[int] = None
    bit_rate_bps: Optional[int] = None

    probe_warnings: list[str] = field(default_factory=list)
    probe_error: AudioErrorInfo | None = None



def _safe_int(value) -> Optional[int]:
    try:
        iv = int(value)
        return iv if iv > 0 else None
    except Exception:
        return None



def probe_audio(filepath: str) -> AudioMetadata:
    """Probe audio metadata without fully decoding samples."""
    warnings: list[str] = []
    probe_error: AudioErrorInfo | None = None

    try:
        import av
    except Exception as exc:
        err = CorruptedFileError(f"pyav_unavailable: {exc}", backend="pyav", cause=exc)
        return AudioMetadata(filepath=filepath, probe_warnings=warnings, probe_error=err.to_info())

    container_format: Optional[str] = None
    codec: Optional[str] = None
    container_duration: Optional[float] = None
    stream_duration: Optional[float] = None
    sample_rate: Optional[int] = None
    channels: Optional[int] = None
    bit_rate: Optional[int] = None

    try:
        with av.open(filepath) as container:
            if container.format is not None:
                container_format = container.format.name or container.format.long_name

            c_duration_us = _safe_int(getattr(container, "duration", None))
            if c_duration_us is not None:
                container_duration = c_duration_us / 1_000_000.0

            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                warnings.append("no_audio_stream")
            else:
                codec_ctx = getattr(stream, "codec_context", None)
                codec_name = getattr(codec_ctx, "name", None)
                codec = codec_name or getattr(stream, "name", None)

                rate = getattr(stream, "rate", None)
                sample_rate = _safe_int(rate)

                channels = _safe_int(getattr(codec_ctx, "channels", None))
                bit_rate = _safe_int(getattr(codec_ctx, "bit_rate", None))
                if bit_rate is None:
                    bit_rate = _safe_int(getattr(stream, "bit_rate", None))

                # Prefer explicit stream.duration*time_base when available.
                s_duration = _safe_int(getattr(stream, "duration", None))
                time_base = getattr(stream, "time_base", None)
                if s_duration is not None and time_base is not None:
                    try:
                        stream_duration = float(s_duration * time_base)
                    except Exception:
                        warnings.append("stream_duration_parse_failed")
                elif container_duration is None:
                    warnings.append("duration_unavailable")

    except av.error.FFmpegError as exc:  # type: ignore[attr-defined]
        msg = str(exc)
        low = msg.lower()
        if "invalid data" in low:
            probe_error = CorruptedFileError(f"probe_failed: {msg}", backend="pyav", cause=exc).to_info()
        else:
            probe_error = UnsupportedFormatError(f"probe_failed: {msg}", backend="pyav", cause=exc).to_info()
    except Exception as exc:
        probe_error = CorruptedFileError(f"probe_failed: {exc}", backend="pyav", cause=exc).to_info()

    return AudioMetadata(
        filepath=filepath,
        container_format=container_format,
        audio_codec=codec,
        container_duration_sec=container_duration,
        stream_duration_sec=stream_duration,
        sample_rate_hz=sample_rate,
        channels=channels,
        bit_rate_bps=bit_rate,
        probe_warnings=warnings,
        probe_error=probe_error,
    )
