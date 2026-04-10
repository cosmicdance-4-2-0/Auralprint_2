"""Domain-level audio error taxonomy and conversion helpers."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AudioErrorInfo:
    """Structured payload for decode/probe failures and warnings."""

    kind: str
    message: str
    backend: str = ""
    code: str = ""
    original_message: str = ""
    cause: str = ""


class AudioDomainError(Exception):
    """Base class for domain-level audio errors."""

    kind = "unknown"
    code = "audio_error"

    def __init__(self, message: str, *, backend: str = "", cause: Exception | None = None):
        super().__init__(message)
        self.backend = backend
        self.message = message
        self.cause = cause
        self.original_message = str(cause) if cause is not None else ""

    def to_info(self) -> AudioErrorInfo:
        return AudioErrorInfo(
            kind=self.kind,
            code=self.code,
            backend=self.backend,
            message=self.message,
            original_message=self.original_message,
            cause=repr(self.cause) if self.cause is not None else "",
        )


class UnsupportedFormatError(AudioDomainError):
    kind = "unsupported"
    code = "unsupported_format"


class CorruptedFileError(AudioDomainError):
    kind = "corrupted"
    code = "corrupted_file"


class PartialDecodeWarning(AudioDomainError):
    kind = "partial"
    code = "partial_decode"
