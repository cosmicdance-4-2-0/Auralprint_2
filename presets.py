"""Preset import/export helpers.

This module intentionally has no DearPyGui dependency so it can be reused
from tests, CLI tools, and non-UI workflows.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from importlib import metadata
from pathlib import Path

from config import Preferences

PRESET_SCHEMA_VERSION = 1
PRESET_FILE_EXTENSION = ".json"
_DEFAULT_APP_VERSION = "0.0.0"


def _resolve_app_version() -> str:
    """Best-effort app version resolver with a stable fallback."""
    try:
        return metadata.version("Auralprint_2")
    except metadata.PackageNotFoundError:
        return _DEFAULT_APP_VERSION


def _validate_preset_path(path: str) -> Path:
    """Validate preset file extension and return a pathlib Path."""
    preset_path = Path(path)
    if preset_path.suffix.lower() != PRESET_FILE_EXTENSION:
        raise ValueError(
            f"Invalid preset extension for '{path}'. "
            f"Expected '{PRESET_FILE_EXTENSION}'."
        )
    return preset_path


def _utc_iso8601_now() -> str:
    """Return an ISO-8601 UTC timestamp with Z suffix."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def export_preset(prefs: Preferences, path: str) -> None:
    """Export preferences as a deterministic UTF-8 JSON preset envelope."""
    preset_path = _validate_preset_path(path)

    envelope = {
        "schema_version": PRESET_SCHEMA_VERSION,
        "app_version": _resolve_app_version(),
        "created_at": _utc_iso8601_now(),
        "preferences": prefs.snapshot(),
    }

    try:
        with preset_path.open("w", encoding="utf-8") as handle:
            json.dump(envelope, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
    except OSError as exc:
        raise OSError(f"Failed to write preset file '{path}': {exc}") from exc


def import_preset(path: str) -> dict:
    """Import a preset file and return a normalized preferences payload."""
    preset_path = _validate_preset_path(path)

    try:
        with preset_path.open("r", encoding="utf-8") as handle:
            envelope = json.load(handle)
    except OSError as exc:
        raise OSError(f"Failed to read preset file '{path}': {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse preset JSON from '{path}': {exc.msg}") from exc

    if not isinstance(envelope, dict):
        raise ValueError("Preset payload must be a JSON object.")

    required_fields = ("schema_version", "app_version", "created_at", "preferences")
    missing_fields = [field for field in required_fields if field not in envelope]
    if missing_fields:
        raise ValueError(f"Preset is missing required fields: {', '.join(missing_fields)}")

    preferences_payload = envelope["preferences"]
    if not isinstance(preferences_payload, dict):
        raise ValueError("Preset 'preferences' must be a JSON object.")

    normalized = Preferences(initial=preferences_payload).snapshot()
    return normalized
