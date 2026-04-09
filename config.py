"""Configuration system — immutable defaults, mutable preferences, bounded limits.

Interface (stable):
    CONFIG:       frozen dict — canonical defaults and limits, never mutated
    Preferences:  class — mutable runtime state, cloned from CONFIG.defaults
    resolve(prefs) -> dict — flattened settings dict for module consumption

All configurable parameters across the entire application are defined here.
Module-level constants in other files are legacy defaults that will be
superseded as modules are wired to read from resolved settings.

Design (from original Auralprint):
    CONFIG never mutates.
    Preferences clone from CONFIG.defaults.
    Every user-facing knob is bounded by CONFIG.limits.
    resolve() produces the merged settings dict that modules consume.
"""

import math

TAU = math.pi * 2


# ── Utilities ──────────────────────────────────────────────────


def deep_freeze(obj):
    """Recursively convert dicts to frozen MappingProxy-like objects.

    We use a simple approach: convert all dicts to _FrozenDict (a dict
    subclass that raises on mutation). Lists become tuples. Primitives
    pass through.
    """
    if isinstance(obj, dict):
        return _FrozenDict({k: deep_freeze(v) for k, v in obj.items()})
    if isinstance(obj, (list, tuple)):
        return tuple(deep_freeze(item) for item in obj)
    return obj


def deep_clone(obj):
    """Deep copy a config/preferences tree. Thaws any _FrozenDict back to regular dict."""
    if isinstance(obj, dict):
        return {k: deep_clone(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [deep_clone(item) for item in obj]
    return obj


class _FrozenDict(dict):
    """A dict that raises TypeError on mutation attempts."""

    def __setitem__(self, key, value):
        raise TypeError(f"CONFIG is immutable: cannot set '{key}'")

    def __delitem__(self, key):
        raise TypeError(f"CONFIG is immutable: cannot delete '{key}'")

    def update(self, *args, **kwargs):
        raise TypeError("CONFIG is immutable: cannot update")

    def pop(self, *args):
        raise TypeError("CONFIG is immutable: cannot pop")

    def clear(self):
        raise TypeError("CONFIG is immutable: cannot clear")


# ── CONFIG ─────────────────────────────────────────────────────


_CONFIG_RAW = {
    "defaults": {

        "visuals": {
            "background_color": (0.0, 0.0, 0.0),
            "particle_color": (1.0, 1.0, 1.0),
        },

        "trace": {
            "lines": True,
            "num_lines": 10,
            "line_alpha": 0.35,
            "line_width_px": 2.0,
            "line_color_mode": "dominantBand",   # "fixed" | "lastParticle" | "dominantBand"
        },

        "particles": {
            "emit_per_second": 180,
            "size_max_px": 8.0,
            "size_min_px": 1.0,
            "size_decay_sec": 3.0,
            "ttl_sec": 6.0,
            "overlap_radius_px": 6.0,
        },

        "motion": {
            "angular_speed": math.pi * 0.75,     # rad/s
            "wf_disp_frac": 0.18,
        },

        "audio": {
            "fft_size": 2048,
            "rms_gain": 2.0,
            "min_radius_frac": 0.01,
            "max_radius_frac": 0.80,
            "volume": 1.0,
            "muted": False,
            "repeat_mode": "none",               # "none" | "one" | "all"
            "ring_buffer_size": 8192,
            "mono_silence_rms": 0.002,
            "mono_correlation_threshold": 0.995,
            "mono_correlation_stride": 8,
        },

        "bands": {
            "spacing": "hybrid",                  # "log" | "mel" | "bark" | "hybrid"
            "floor_hz": 20.0,
            "ceiling_hz": 20000.0,
            "db_floor": -80.0,
            "db_ceil": 0.0,
            "overlay": {
                "enabled": True,
                "connect": True,
                "alpha": 0.65,
                "line_alpha": 0.35,
                "line_width_px": 1.0,
                "point_size_px": 3.0,
                "min_radius_frac": 0.01,
                "max_radius_frac": 0.80,
                "wf_disp_frac": 0.18,
                "phase_mode": "free",             # "orb" | "free"
                "ring_speed": 0.35,               # rad/s (free mode)
            },
            "rainbow": {
                "hue_offset_deg": 0,
                "saturation": 0.85,
                "value": 0.90,
            },
            "particle_color_source": "dominant",  # "fixed" | "dominant" | "angle"
        },

        "orbs": [
            {"id": "ORB0", "channel": "R", "chirality": -1, "start_angle": 0.0},
            {"id": "ORB1", "channel": "L", "chirality": -1, "start_angle": math.pi},
        ],

        "timing": {
            "max_dt": 1.0 / 30,
        },

        "ui": {
            "seek_step_sec": 5,
            "seek_step_large_sec": 30,
            "volume_step": 0.05,
            "toast_duration_sec": 2.5,
        },

        "scrubber": {
            "peak_buckets": 512,
            "height_px": 36,
            "color_bg": (30, 30, 30, 240),
            "color_wf_unplayed": (100, 100, 100, 170),
            "color_wf_played": (200, 200, 200, 230),
            "color_playhead": (255, 255, 255, 250),
            "color_center_line": (80, 80, 80, 120),
        },
    },

    "limits": {

        "trace": {
            "num_lines":    {"min": 10,   "max": 1000,  "step": 10},
            "line_alpha":   {"min": 0.0,  "max": 1.0,   "step": 0.01},
            "line_width_px": {"min": 1.0, "max": 6.0,   "step": 0.5},
        },

        "particles": {
            "emit_per_second":   {"min": 10,   "max": 1000,  "step": 10},
            "size_max_px":       {"min": 1.0,  "max": 9.0,   "step": 0.1},
            "size_min_px":       {"min": 0.5,  "max": 6.0,   "step": 0.1},
            "size_decay_sec":    {"min": 0.1,  "max": 120.0, "step": 0.1},
            "ttl_sec":           {"min": 0.1,  "max": 600.0, "step": 0.1},
            "overlap_radius_px": {"min": 0.5,  "max": 10.0,  "step": 0.1},
        },

        "motion": {
            "angular_speed": {"min": 0.01, "max": 3.0,  "step": 0.01},
            "wf_disp_frac":  {"min": 0.01, "max": 1.0,  "step": 0.01},
        },

        "audio": {
            "rms_gain":                    {"min": 0.05,  "max": 10.0,   "step": 0.01},
            "min_radius_frac":             {"min": 0.01,  "max": 0.4,    "step": 0.01},
            "max_radius_frac":             {"min": 0.3,   "max": 1.0,    "step": 0.01},
            "fft_sizes":                   (256, 512, 1024, 2048, 4096, 8192, 16384),
            "volume":                      {"min": 0.0,   "max": 1.0,    "step": 0.01},
            "ring_buffer_size":            {"min": 2048,  "max": 32768,  "step": 1024},
            "mono_silence_rms":            {"min": 0.0001, "max": 0.05,  "step": 0.0001},
            "mono_correlation_threshold":  {"min": 0.9,   "max": 1.0,    "step": 0.001},
            "mono_correlation_stride":     {"min": 1,     "max": 32,     "step": 1},
        },

        "bands": {
            "floor_hz":                   {"min": 1.0,    "max": 100.0,  "step": 1.0},
            "ceiling_hz":                 {"min": 5000.0, "max": 24000.0, "step": 100.0},
            "db_floor":                   {"min": -120.0, "max": -20.0,  "step": 1.0},
            "db_ceil":                    {"min": -20.0,  "max": 20.0,   "step": 1.0},
            "overlay_alpha":              {"min": 0.0,    "max": 1.0,    "step": 0.01},
            "overlay_line_alpha":         {"min": 0.0,    "max": 1.0,    "step": 0.01},
            "overlay_line_width_px":      {"min": 0.5,    "max": 4.0,    "step": 0.5},
            "overlay_point_size_px":      {"min": 1.0,    "max": 10.0,   "step": 1.0},
            "overlay_min_radius_frac":    {"min": 0.01,   "max": 0.4,    "step": 0.01},
            "overlay_max_radius_frac":    {"min": 0.3,    "max": 1.0,    "step": 0.01},
            "overlay_wf_disp_frac":       {"min": 0.01,   "max": 1.0,    "step": 0.01},
            "overlay_ring_speed":         {"min": 0.0,    "max": TAU,    "step": 0.01},
            "hue_offset_deg":             {"min": 0,      "max": 360,    "step": 1},
            "saturation":                 {"min": 0.0,    "max": 1.0,    "step": 0.01},
            "value":                      {"min": 0.0,    "max": 1.0,    "step": 0.01},
        },

        "timing": {
            "max_dt": {"min": 1.0 / 120, "max": 1.0 / 10, "step": 0.001},
        },

        "ui": {
            "seek_step_sec":       {"min": 1,    "max": 30,   "step": 1},
            "seek_step_large_sec": {"min": 5,    "max": 120,  "step": 5},
            "volume_step":         {"min": 0.01, "max": 0.2,  "step": 0.01},
            "toast_duration_sec":  {"min": 0.5,  "max": 10.0, "step": 0.5},
        },

        "scrubber": {
            "peak_buckets": {"min": 128, "max": 2048, "step": 64},
            "height_px":    {"min": 20,  "max": 80,   "step": 2},
        },
    },
}

CONFIG = deep_freeze(_CONFIG_RAW)


# ── Preferences ────────────────────────────────────────────────


class Preferences:
    """Mutable runtime preferences, cloned from CONFIG.defaults.

    Usage:
        prefs = Preferences()          # fresh from defaults
        prefs.set("particles.ttl_sec", 10.0)  # bounded by limits
        s = prefs.get("particles.ttl_sec")    # -> 10.0
        d = prefs.snapshot()                   # -> deep-cloned dict
    """

    def __init__(self, initial=None):
        """Create preferences from CONFIG.defaults, optionally overridden by initial."""
        self._data = deep_clone(dict(CONFIG["defaults"]))
        if initial is not None:
            self._apply_overrides(initial)
        self._enforce_constraints()

    def get(self, path):
        """Get a preference value by dotted path. e.g. 'particles.ttl_sec'"""
        keys = path.split(".")
        node = self._data
        for k in keys:
            if isinstance(node, dict) and k in node:
                node = node[k]
            else:
                raise KeyError(f"preference path not found: {path!r}")
        return node

    def set(self, path, value):
        """Set a preference value by dotted path. Clamps to limits if applicable."""
        keys = path.split(".")
        node = self._data
        for k in keys[:-1]:
            if isinstance(node, dict) and k in node:
                node = node[k]
            else:
                raise KeyError(f"preference path not found: {path!r}")

        final_key = keys[-1]
        if final_key not in node:
            raise KeyError(f"preference path not found: {path!r}")

        # Clamp numeric values to limits
        value = self._clamp_to_limits(path, value)
        node[final_key] = value
        self._enforce_constraints()

    def snapshot(self):
        """Return a deep-cloned dict of all current preferences."""
        return deep_clone(self._data)

    def reset(self):
        """Reset all preferences to CONFIG defaults."""
        self._data = deep_clone(dict(CONFIG["defaults"]))

    def reset_path(self, path):
        """Reset a single preference to its CONFIG default value."""
        keys = path.split(".")
        default_node = dict(CONFIG["defaults"])
        for k in keys:
            default_node = default_node[k]
        self.set(path, deep_clone(default_node))

    # ── Internal ──────────────────────────────────────────────

    def _clamp_to_limits(self, path, value):
        """If a limit exists for this path, clamp the value."""
        if not isinstance(value, (int, float)):
            return value

        # Map preference paths to limit paths
        limit = self._find_limit(path)
        if limit is not None and isinstance(limit, dict):
            lo = limit.get("min", value)
            hi = limit.get("max", value)
            return max(lo, min(hi, value))

        return value

    def _find_limit(self, path):
        """Look up the limit entry for a preference path."""
        keys = path.split(".")
        node = CONFIG["limits"]
        for k in keys:
            if isinstance(node, dict) and k in node:
                node = node[k]
            else:
                return None
        return node

    def _apply_overrides(self, overrides):
        """Apply an overrides dict (partial) onto current preferences."""
        self._merge(self._data, overrides)

    def _merge(self, target, source):
        """Recursively merge source into target."""
        for k, v in source.items():
            if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                self._merge(target[k], v)
            elif k in target:
                target[k] = v

    def _enforce_constraints(self):
        """Cross-field constraints (e.g. sizeMin <= sizeMax, TTL >= decay)."""
        p = self._data.get("particles", {})
        if "size_min_px" in p and "size_max_px" in p:
            p["size_min_px"] = min(p["size_min_px"], p["size_max_px"])
        if "ttl_sec" in p and "size_decay_sec" in p:
            p["ttl_sec"] = max(p["ttl_sec"], p["size_decay_sec"])


# ── Resolve ────────────────────────────────────────────────────


def resolve(prefs):
    """Produce a flat settings dict from a Preferences instance.

    This is the single point where preferences become the values
    that modules consume. Currently returns a deep clone of the
    preferences snapshot. Future versions may merge with runtime
    state or apply transformations.
    """
    return prefs.snapshot()
