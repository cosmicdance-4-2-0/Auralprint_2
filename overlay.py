"""Band overlay ring — 256-point spectral contour visualization.

Interface (stable):
    compute_overlay(band_result, phase_rad, waveform,
                    canvas_width, canvas_height, bg_color, settings=None) -> OverlayFrame | None
    advance_phase(phase_rad, dt, orb_angle=0.0, settings=None) -> float
"""

import math
import numpy as np

TAU = math.pi * 2

DEFAULT_OVERLAY_SETTINGS = {
    "connect": True,
    "alpha": 0.65,
    "line_alpha": 0.35,
    "point_size_px": 3.0,
    "min_radius_frac": 0.01,
    "max_radius_frac": 0.80,
    "wf_disp_frac": 0.18,
    "phase_mode": "free",          # "orb" | "free"
    "ring_speed": 0.35,            # rad/s (free mode only)
}


# ── Overlay frame ──────────────────────────────────────────────


class OverlayFrame:
    """Pre-computed overlay ring data. All positions are screen-space."""

    __slots__ = (
        "x", "y",
        "pt_r", "pt_g", "pt_b",
        "ln_r", "ln_g", "ln_b",
        "count", "connect", "point_size",
    )

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


# ── Interface ──────────────────────────────────────────────────


def compute_overlay(band_result, phase_rad, waveform,
                    canvas_width, canvas_height, bg_color, settings=None):
    """Build an OverlayFrame from band energies, phase, and waveform.

    Args:
        band_result:  BandResult from BandBank, or None.
        phase_rad:    current ring rotation angle in radians.
        waveform:     center-channel time-domain samples for displacement, or None.
        canvas_width, canvas_height: pixel dimensions.
        bg_color:     (r, g, b) tuple for alpha pre-blending.

    Returns:
        OverlayFrame if band data is available, else None.
    """
    if band_result is None:
        return None

    count = len(band_result.energies)
    center_x = canvas_width / 2.0
    center_y = canvas_height / 2.0
    min_dim = min(canvas_width, canvas_height)

    s = settings or DEFAULT_OVERLAY_SETTINGS
    min_r = min_dim * s["min_radius_frac"]
    max_r = min_dim * s["max_radius_frac"]
    safe_min = min(min_r, max_r)
    safe_max = max(min_r, max_r)

    # Angles for each band point
    angles = phase_rad + np.arange(count, dtype=np.float64) / count * TAU

    # Base radii from energy
    energies = np.clip(band_result.energies.astype(np.float64), 0.0, 1.0)
    base_radii = safe_min + (safe_max - safe_min) * energies

    # Waveform displacement
    if waveform is not None and len(waveform) > 0:
        phase01 = ((angles % TAU) + TAU) % TAU / TAU
        wf_indices = (phase01 * (len(waveform) - 1)).astype(np.intp)
        np.clip(wf_indices, 0, len(waveform) - 1, out=wf_indices)
        samples = waveform[wf_indices].astype(np.float64)
        displacements = base_radii * s["wf_disp_frac"] * samples
    else:
        displacements = 0.0

    radii = base_radii + displacements

    # Sim → screen
    x = (center_x + radii * np.cos(angles)).astype(np.float32)
    y = (center_y - radii * np.sin(angles)).astype(np.float32)

    # Pre-blend colors with background
    colors = band_result.colors.astype(np.float64)   # (count, 3)
    bg = np.array(bg_color, dtype=np.float64)

    pt_colors = (bg * (1.0 - s["alpha"]) + colors * s["alpha"]).astype(np.float32)
    ln_colors = (bg * (1.0 - s["line_alpha"]) + colors * s["line_alpha"]).astype(np.float32)

    return OverlayFrame(
        x=x, y=y,
        pt_r=np.ascontiguousarray(pt_colors[:, 0]),
        pt_g=np.ascontiguousarray(pt_colors[:, 1]),
        pt_b=np.ascontiguousarray(pt_colors[:, 2]),
        ln_r=np.ascontiguousarray(ln_colors[:, 0]),
        ln_g=np.ascontiguousarray(ln_colors[:, 1]),
        ln_b=np.ascontiguousarray(ln_colors[:, 2]),
        count=count,
        connect=s["connect"],
        point_size=s["point_size_px"],
    )


def advance_phase(phase_rad, dt, orb_angle=0.0, settings=None):
    """Advance the ring phase for the next frame.

    Args:
        phase_rad:  current phase in radians.
        dt:         frame delta in seconds.
        settings:   overlay settings dict with "phase_mode" and "ring_speed".
        orb_angle:  first orb's current angle (used when mode="orb").

    Returns:
        Updated phase in radians.
    """
    s = settings or DEFAULT_OVERLAY_SETTINGS
    mode = s["phase_mode"]
    if mode == "orb":
        return orb_angle
    return (phase_rad + s["ring_speed"] * dt) % TAU
