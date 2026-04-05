"""Color policy — particle and line color derivation.

Interface (stable):
    make_particle_color_fn(mode, band_result, fixed_color) -> Callable[[float], tuple]
    pick_line_color(mode, last_particle_color, dominant_color, fixed_color) -> tuple

Particle color modes:
    "fixed"     — user-chosen color, ignores analysis.
    "dominant"  — color of the dominant (loudest) band.
    "angle"     — band color at the particle's birth angle (glitch mode).

Line color modes:
    "fixed"         — uses the fixed particle color.
    "lastParticle"  — color of the most recent particle.
    "dominantBand"  — color of the dominant band.
"""

import math

from bands import BAND_COUNT

TAU = math.pi * 2

# Defaults (become configurable in v0.3.x)
PARTICLE_COLOR_MODE = "dominant"       # "fixed" | "dominant" | "angle"
LINE_COLOR_MODE = "dominantBand"       # "fixed" | "lastParticle" | "dominantBand"
FIXED_PARTICLE_COLOR = (1.0, 1.0, 1.0)


# ── Particle color ─────────────────────────────────────────────


def make_particle_color_fn(mode, band_result, fixed_color=FIXED_PARTICLE_COLOR):
    """Return a function f(angle_rad) -> (r, g, b) for coloring particles at birth.

    Args:
        mode:        "fixed", "dominant", or "angle".
        band_result: BandResult from BandBank (may be None if no analysis).
        fixed_color: (r, g, b) tuple used by "fixed" mode.

    Returns:
        A callable that accepts an angle in radians and returns an (r, g, b) tuple.
    """
    if mode == "fixed" or band_result is None:
        c = fixed_color
        return lambda angle: c

    if mode == "dominant":
        dom = band_result.dominant_index
        c = (
            float(band_result.colors[dom, 0]),
            float(band_result.colors[dom, 1]),
            float(band_result.colors[dom, 2]),
        )
        return lambda angle: c

    # "angle" — glitch mode: band color at the particle's birth angle
    colors = band_result.colors
    count = len(colors)

    def _angle_color(angle):
        a01 = ((angle % TAU) + TAU) % TAU / TAU
        idx = int(a01 * count)
        if idx >= count:
            idx = count - 1
        return (float(colors[idx, 0]), float(colors[idx, 1]), float(colors[idx, 2]))

    return _angle_color


# ── Line color ─────────────────────────────────────────────────


def pick_line_color(mode, last_particle_color, dominant_color, fixed_color=FIXED_PARTICLE_COLOR):
    """Choose the trail line color for this frame.

    Args:
        mode:                "fixed", "lastParticle", or "dominantBand".
        last_particle_color: (r, g, b) of the most recently emitted particle, or None.
        dominant_color:      (r, g, b) of the dominant band, or None.
        fixed_color:         (r, g, b) fallback.

    Returns:
        (r, g, b) tuple.
    """
    if mode == "lastParticle" and last_particle_color is not None:
        return last_particle_color

    if mode == "dominantBand" and dominant_color is not None:
        return dominant_color

    return fixed_color


# ── Dominant color helper ──────────────────────────────────────


def dominant_color_from(band_result):
    """Extract the dominant band's (r, g, b) from a BandResult, or None."""
    if band_result is None:
        return None
    dom = band_result.dominant_index
    return (
        float(band_result.colors[dom, 0]),
        float(band_result.colors[dom, 1]),
        float(band_result.colors[dom, 2]),
    )
