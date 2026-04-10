"""Preset import/export helpers.

This module intentionally has no DearPyGui dependency so it can be reused
from tests, CLI tools, and non-UI workflows.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Callable

from config import Preferences
from version import APP_VERSION

CURRENT_SCHEMA_VERSION = 1
PRESET_FILE_EXTENSION = ".json"

MigrationFn = Callable[[dict], dict]


def _resolve_app_version() -> str:
    """Return the user-visible application version."""
    return APP_VERSION


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
        "schema_version": CURRENT_SCHEMA_VERSION,
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


def _migrate_v1_to_v2(doc: dict) -> dict:
    raise ValueError(
        "Preset schema migration from version 1 to 2 is not implemented yet. "
        "Please upgrade Auralprint_2 to a version that supports this migration."
    )


MIGRATIONS: dict[int, MigrationFn] = {
    # 1: _migrate_v1_to_v2,  # Example registration when schema v2 exists.
}


def validate_preset_document(doc: dict) -> None:
    """Validate preset envelope shape and required fields."""
    if not isinstance(doc, dict):
        raise ValueError("Preset payload must be a JSON object.")

    required_fields = ("schema_version", "app_version", "created_at", "preferences")
    missing_fields = [field for field in required_fields if field not in doc]
    if missing_fields:
        raise ValueError(f"Preset is missing required fields: {', '.join(missing_fields)}")

    schema_version = doc["schema_version"]
    if not isinstance(schema_version, int):
        raise ValueError("Preset 'schema_version' must be an integer.")
    if schema_version < 1:
        raise ValueError("Preset 'schema_version' must be >= 1.")

    if not isinstance(doc["app_version"], str) or not doc["app_version"].strip():
        raise ValueError("Preset 'app_version' must be a non-empty string.")
    if not isinstance(doc["created_at"], str) or not doc["created_at"].strip():
        raise ValueError("Preset 'created_at' must be a non-empty string.")
    if not isinstance(doc["preferences"], dict):
        raise ValueError("Preset 'preferences' must be a JSON object.")


def migrate_preset(doc: dict) -> dict:
    """Migrate a preset document to CURRENT_SCHEMA_VERSION."""
    validate_preset_document(doc)

    working_doc = dict(doc)
    version = working_doc["schema_version"]
    if version > CURRENT_SCHEMA_VERSION:
        raise ValueError(
            "Unsupported preset schema_version "
            f"{version}; this app supports up to {CURRENT_SCHEMA_VERSION}."
        )

    while version < CURRENT_SCHEMA_VERSION:
        migration = MIGRATIONS.get(version)
        if migration is None:
            raise ValueError(
                f"No migration registered for preset schema_version {version} -> {version + 1}."
            )
        migrated = migration(working_doc)
        if not isinstance(migrated, dict):
            raise ValueError(
                f"Migration for schema_version {version} must return a JSON object envelope."
            )
        validate_preset_document(migrated)
        working_doc = migrated
        version = working_doc["schema_version"]

    return working_doc


def _apply_tree_with_constraints(prefs: Preferences, tree: dict, prefix: str = "") -> None:
    """Apply a nested preference tree using Preferences.set for clamping/constraints."""
    for key, value in tree.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            _apply_tree_with_constraints(prefs, value, path)
        else:
            try:
                prefs.set(path, value)
            except KeyError:
                # Ignore unknown keys for forward compatibility with future exports.
                continue



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

    migrated_envelope = migrate_preset(envelope)

    normalized_prefs = Preferences()
    _apply_tree_with_constraints(normalized_prefs, migrated_envelope["preferences"])
    return normalized_prefs.snapshot()
