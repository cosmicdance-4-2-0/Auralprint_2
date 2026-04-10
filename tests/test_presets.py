from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json

import pytest

import presets
from config import CONFIG, Preferences


@pytest.fixture
def defaults_tree():
    """Mutable defaults tree derived from CONFIG['defaults']."""
    return Preferences(initial=CONFIG["defaults"]).snapshot()


@pytest.fixture
def modified_preferences(defaults_tree):
    """Defaults with a few non-default values for round-trip checks."""
    defaults_tree["particles"]["size_max_px"] = 7.3
    defaults_tree["particles"]["size_min_px"] = 1.7
    defaults_tree["particles"]["size_decay_sec"] = 2.4
    defaults_tree["particles"]["ttl_sec"] = 5.8
    defaults_tree["trace"]["num_lines"] = 220
    defaults_tree["audio"]["volume"] = 0.42
    return defaults_tree


def _write_json(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_export_then_import_round_trip_preserves_values(tmp_path, modified_preferences):
    prefs = Preferences(initial=modified_preferences)
    file_path = tmp_path / "roundtrip.json"

    presets.export_preset(prefs, str(file_path))
    imported = presets.import_preset(str(file_path))

    assert imported == prefs.snapshot()


def test_import_of_older_schema_migrates_to_current(monkeypatch, tmp_path, defaults_tree):
    # Simulate app at schema v2, importing a v1 preset.
    monkeypatch.setattr(presets, "CURRENT_SCHEMA_VERSION", 2)

    def migrate_v1_to_v2(doc):
        migrated = dict(doc)
        migrated["schema_version"] = 2
        prefs = dict(migrated["preferences"])
        prefs["trace"] = dict(prefs["trace"])
        prefs["trace"]["num_lines"] = 777
        migrated["preferences"] = prefs
        return migrated

    monkeypatch.setattr(presets, "MIGRATIONS", {1: migrate_v1_to_v2})

    old_payload = {
        "schema_version": 1,
        "app_version": "0.1.0",
        "created_at": "2026-01-01T00:00:00Z",
        "preferences": defaults_tree,
    }
    file_path = tmp_path / "older_schema.json"
    _write_json(file_path, old_payload)

    imported = presets.import_preset(str(file_path))

    assert imported["trace"]["num_lines"] == 777


def test_unknown_future_schema_version_fails_with_clear_error(tmp_path, defaults_tree):
    payload = {
        "schema_version": presets.CURRENT_SCHEMA_VERSION + 1,
        "app_version": "9.9.9",
        "created_at": "2026-01-01T00:00:00Z",
        "preferences": defaults_tree,
    }
    file_path = tmp_path / "future_schema.json"
    _write_json(file_path, payload)

    with pytest.raises(ValueError, match=r"Unsupported preset schema_version"):
        presets.import_preset(str(file_path))


def test_malformed_json_and_missing_required_fields_fail_predictably(tmp_path, defaults_tree):
    malformed_file = tmp_path / "malformed.json"
    malformed_file.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(ValueError, match=r"Failed to parse preset JSON"):
        presets.import_preset(str(malformed_file))

    missing_fields_file = tmp_path / "missing_fields.json"
    missing_fields_payload = {
        "schema_version": presets.CURRENT_SCHEMA_VERSION,
        "app_version": "1.0.0",
        # created_at intentionally missing
        "preferences": defaults_tree,
    }
    _write_json(missing_fields_file, missing_fields_payload)

    with pytest.raises(ValueError, match=r"missing required fields: created_at"):
        presets.import_preset(str(missing_fields_file))


def test_imported_numeric_values_honor_limits_and_constraints(tmp_path, defaults_tree):
    payload = {
        "schema_version": presets.CURRENT_SCHEMA_VERSION,
        "app_version": "1.0.0",
        "created_at": "2026-01-01T00:00:00Z",
        "preferences": defaults_tree,
    }

    # Outside configured min/max limits.
    payload["preferences"]["particles"]["size_min_px"] = -100.0
    payload["preferences"]["particles"]["size_max_px"] = 999.0
    payload["preferences"]["particles"]["size_decay_sec"] = 250.0
    payload["preferences"]["particles"]["ttl_sec"] = -1.0

    file_path = tmp_path / "constraints.json"
    _write_json(file_path, payload)

    imported = presets.import_preset(str(file_path))

    p = imported["particles"]
    limits = CONFIG["limits"]["particles"]

    assert limits["size_min_px"]["min"] <= p["size_min_px"] <= limits["size_min_px"]["max"]
    assert limits["size_max_px"]["min"] <= p["size_max_px"] <= limits["size_max_px"]["max"]
    assert limits["size_decay_sec"]["min"] <= p["size_decay_sec"] <= limits["size_decay_sec"]["max"]
    assert limits["ttl_sec"]["min"] <= p["ttl_sec"] <= limits["ttl_sec"]["max"]

    # Cross-field constraints.
    assert p["size_min_px"] <= p["size_max_px"]
    assert p["ttl_sec"] >= p["size_decay_sec"]
