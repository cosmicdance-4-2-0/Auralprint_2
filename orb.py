"""Orb — a spectral analysis point that orbits, pulsates, and emits particles.

Interface (stable):
    step(dt, now_sec, energy, color_fn, waveform=None)  — advance simulation
    snapshot(now_sec, bg_color, line_color) -> OrbFrame  — build render-ready data
    reset()                                              — clear trail, reset to start angle
    last_particle_color                                  — (r,g,b) of newest particle, or None
    channel: str                                         — 'L', 'R', or 'C' (read-only)
    angle: float                                         — current orbital angle (read-only)
"""

import math
import numpy as np

TAU = math.pi * 2

# Simulation defaults (fallbacks when explicit settings are not provided)
DEFAULT_ORB_SETTINGS = {
    "motion": {
        "angular_speed": math.pi * 0.75,       # rad/s
        "wf_disp_frac": 0.18,                  # waveform displacement as fraction of base radius
    },
    "audio": {
        "min_radius_frac": 0.01,
        "max_radius_frac": 0.80,
        "rms_gain": 2.0,
    },
    "particles": {
        "emit_per_second": 180,
        "size_max_px": 8.0,
        "size_min_px": 1.0,
        "size_decay_sec": 3.0,
        "ttl_sec": 6.0,
        "overlap_radius_px": 6.0,
    },
    "trace": {
        "num_lines": 10,
        "line_alpha": 0.35,
    },
    "timing": {
        "max_dt": 1.0 / 30,                    # cap to prevent huge jumps
    },
}

RMS_GAIN = DEFAULT_ORB_SETTINGS["audio"]["rms_gain"]


# ── Render snapshot ────────────────────────────────────────────


class OrbFrame:
    """Pre-computed render data for one frame. All coordinates are screen-space."""

    __slots__ = (
        "particle_x", "particle_y",
        "particle_r", "particle_g", "particle_b",
        "particle_sizes", "particle_count",
        "trail_x", "trail_y",
        "trail_r", "trail_g", "trail_b",
        "trail_count",
    )

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def empty_frame():
    z = np.zeros(0, dtype=np.float32)
    return OrbFrame(
        particle_x=z, particle_y=z,
        particle_r=z, particle_g=z, particle_b=z,
        particle_sizes=z, particle_count=0,
        trail_x=z, trail_y=z,
        trail_r=0.0, trail_g=0.0, trail_b=0.0,
        trail_count=0,
    )


# ── Particle ───────────────────────────────────────────────────


class _Particle:
    __slots__ = ("x", "y", "born_sec", "r", "g", "b")

    def __init__(self, x, y, born_sec, r, g, b):
        self.x = x
        self.y = y
        self.born_sec = born_sec
        self.r = r
        self.g = g
        self.b = b


# ── Waveform sampling ─────────────────────────────────────────


def _sample_waveform(waveform, angle_rad):
    """Sample the time-domain waveform at the given orbital angle.

    Maps the angle (0–TAU) to a waveform index. Returns the sample value.
    """
    phase01 = ((angle_rad % TAU) + TAU) % TAU / TAU
    idx = int(phase01 * (len(waveform) - 1))
    return float(waveform[min(idx, len(waveform) - 1)])


# ── Orb ────────────────────────────────────────────────────────


class Orb:

    def __init__(self, canvas_width, canvas_height,
                 channel="C", chirality=-1, start_angle=0.0, settings=None):
        """Create an orb.

        Args:
            canvas_width, canvas_height: pixel dimensions for sim→screen mapping.
            channel:     'L', 'R', or 'C' — which audio channel drives this orb.
            chirality:   -1 (clockwise) or +1 (counter-clockwise).
            start_angle: initial orbital phase in radians.
        """
        self.channel = channel
        self._chirality = -1 if chirality < 0 else 1
        self._start_angle = start_angle

        self._center_x = canvas_width / 2.0
        self._center_y = canvas_height / 2.0
        self._min_dim = min(canvas_width, canvas_height)
        self._settings = {}
        self._apply_settings(settings)

        self._angle = start_angle
        self._radius = self._min_radius
        self._x = self._radius * math.cos(self._angle)
        self._y = self._radius * math.sin(self._angle)

        self._particles = []
        self._emit_accum = 0.0

    def _apply_settings(self, settings):
        merged = DEFAULT_ORB_SETTINGS
        s = settings or {}
        self._settings = {
            "angular_speed": s.get("motion", {}).get("angular_speed", merged["motion"]["angular_speed"]),
            "wf_disp_frac": s.get("motion", {}).get("wf_disp_frac", merged["motion"]["wf_disp_frac"]),
            "min_radius_frac": s.get("audio", {}).get("min_radius_frac", merged["audio"]["min_radius_frac"]),
            "max_radius_frac": s.get("audio", {}).get("max_radius_frac", merged["audio"]["max_radius_frac"]),
            "emit_per_second": s.get("particles", {}).get("emit_per_second", merged["particles"]["emit_per_second"]),
            "size_max_px": s.get("particles", {}).get("size_max_px", merged["particles"]["size_max_px"]),
            "size_min_px": s.get("particles", {}).get("size_min_px", merged["particles"]["size_min_px"]),
            "size_decay_sec": s.get("particles", {}).get("size_decay_sec", merged["particles"]["size_decay_sec"]),
            "ttl_sec": s.get("particles", {}).get("ttl_sec", merged["particles"]["ttl_sec"]),
            "overlap_radius_px": s.get("particles", {}).get("overlap_radius_px", merged["particles"]["overlap_radius_px"]),
            "trail_line_count": s.get("trace", {}).get("num_lines", merged["trace"]["num_lines"]),
            "trail_alpha": s.get("trace", {}).get("line_alpha", merged["trace"]["line_alpha"]),
            "max_dt": s.get("timing", {}).get("max_dt", merged["timing"]["max_dt"]),
        }

        min_r = self._min_dim * self._settings["min_radius_frac"]
        max_r = self._min_dim * self._settings["max_radius_frac"]
        self._min_radius = min(min_r, max_r)
        self._max_radius = max(min_r, max_r)

    def update_settings(self, settings):
        self._apply_settings(settings)

    # ── Interface ──────────────────────────────────────────────

    @property
    def angle(self):
        return self._angle

    @property
    def last_particle_color(self):
        """(r, g, b) of the newest particle, or None if trail is empty."""
        if not self._particles:
            return None
        p = self._particles[-1]
        return (p.r, p.g, p.b)

    def step(self, dt, now_sec, energy, color_fn, waveform=None):
        """Advance the orb simulation by dt seconds.

        Args:
            dt:        frame delta in seconds.
            now_sec:   monotonic clock for particle birth timestamps.
            energy:    0.0–1.0 analysis energy (drives base radius).
            color_fn:  callable(angle_rad) -> (r, g, b), determines particle color.
            waveform:  float32 1-D array of time-domain samples for radial
                       displacement, or None. Should be the orb's own channel.
        """
        max_dt = self._settings["max_dt"]
        dt = min(dt, max_dt)

        # Advance orbit
        self._angle = (self._angle + self._chirality * self._settings["angular_speed"] * dt) % TAU

        # Base radius from energy
        e = max(0.0, min(energy, 1.0))
        base_radius = self._min_radius + (self._max_radius - self._min_radius) * e

        # Waveform displacement: sample the time-domain signal at the current
        # orbital angle. The displacement is a signed fraction of the base radius,
        # so the orb breathes outward on positive samples and inward on negative.
        if waveform is not None and len(waveform) > 0:
            sample = _sample_waveform(waveform, self._angle)
            displacement = base_radius * self._settings["wf_disp_frac"] * sample
        else:
            displacement = 0.0

        self._radius = base_radius + displacement

        # Position in sim space
        self._x = self._radius * math.cos(self._angle)
        self._y = self._radius * math.sin(self._angle)

        # Cull expired particles
        cutoff = now_sec - self._settings["ttl_sec"]
        self._particles = [p for p in self._particles if p.born_sec > cutoff]

        # Emit new particles (color determined by angle at birth)
        emit_rate = self._settings["emit_per_second"]
        self._emit_accum += emit_rate * dt
        max_emit = int(emit_rate * max_dt) + 2
        emitted = 0
        while self._emit_accum >= 1.0 and emitted < max_emit:
            cr, cg, cb = color_fn(self._angle)
            self._emit_at(self._x, self._y, now_sec, cr, cg, cb)
            self._emit_accum -= 1.0
            emitted += 1

    def snapshot(self, now_sec, bg_color, line_color):
        """Build an OrbFrame with screen-space positions, computed sizes, and faded colors.

        Args:
            now_sec:    monotonic clock for age computation.
            bg_color:   (r, g, b) background for fade blending.
            line_color: (r, g, b) for trail lines (pre-alpha-blended with bg).
        """
        count = len(self._particles)
        if count == 0:
            return empty_frame()

        px = np.empty(count, dtype=np.float32)
        py = np.empty(count, dtype=np.float32)
        pr = np.empty(count, dtype=np.float32)
        pg = np.empty(count, dtype=np.float32)
        pb = np.empty(count, dtype=np.float32)
        ps = np.empty(count, dtype=np.float32)

        bg_r, bg_g, bg_b = bg_color
        size_decay_sec = self._settings["size_decay_sec"]
        size_max_px = self._settings["size_max_px"]
        size_min_px = self._settings["size_min_px"]
        fade_dur = max(self._settings["ttl_sec"] - size_decay_sec, 0.001)

        for idx, p in enumerate(self._particles):
            age = now_sec - p.born_sec

            # Size: shrink from max to min over the decay period
            if age < size_decay_sec:
                t = age / size_decay_sec
                size = size_max_px + (size_min_px - size_max_px) * t
            else:
                size = size_min_px

            # Color: birth color during decay, then fade toward background
            if age < size_decay_sec:
                cr, cg, cb = p.r, p.g, p.b
            else:
                t = min((age - size_decay_sec) / fade_dur, 1.0)
                cr = p.r + (bg_r - p.r) * t
                cg = p.g + (bg_g - p.g) * t
                cb = p.b + (bg_b - p.b) * t

            # Sim → screen
            px[idx] = self._center_x + p.x
            py[idx] = self._center_y - p.y
            pr[idx] = cr
            pg[idx] = cg
            pb[idx] = cb
            ps[idx] = size

        # Trail: last N+1 particle positions
        trail_n = min(count, int(self._settings["trail_line_count"]) + 1)
        trail_start = count - trail_n
        tx = px[trail_start:].copy()
        ty = py[trail_start:].copy()

        # Trail color: pre-blend with background at trail alpha
        lr, lg, lb = line_color
        a = self._settings["trail_alpha"]
        tr = bg_r * (1.0 - a) + lr * a
        tg = bg_g * (1.0 - a) + lg * a
        tb = bg_b * (1.0 - a) + lb * a

        return OrbFrame(
            particle_x=px, particle_y=py,
            particle_r=pr, particle_g=pg, particle_b=pb,
            particle_sizes=ps, particle_count=count,
            trail_x=tx, trail_y=ty,
            trail_r=tr, trail_g=tg, trail_b=tb,
            trail_count=trail_n,
        )

    def reset(self):
        """Clear trail and reset orbital phase to start angle."""
        self._particles.clear()
        self._emit_accum = 0.0
        self._angle = self._start_angle

    # ── Internal ──────────────────────────────────────────────

    def _emit_at(self, x, y, now_sec, cr, cg, cb):
        """Spawn a particle, removing any within the overlap radius."""
        overlap_radius_px = self._settings["overlap_radius_px"]
        r2 = overlap_radius_px * overlap_radius_px
        self._particles = [
            p for p in self._particles
            if (p.x - x) ** 2 + (p.y - y) ** 2 > r2
        ]
        self._particles.append(_Particle(x, y, now_sec, cr, cg, cb))
