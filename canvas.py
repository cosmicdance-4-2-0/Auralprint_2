"""GPU-rendered pixel buffer via Taichi.

Interface (stable):
    render(analysis=None)     — update pixel field (background + optional FFT bars)
    frame_data() -> np.array  — flat float32 RGBA for DearPyGui raw texture
    background_color          — (r, g, b) tuple, 0.0–1.0 range
    width, height             — pixel dimensions (read-only after init)
"""

import taichi as ti
import numpy as np

BACKGROUND_COLOR_DEFAULT = (0.0, 0.0, 0.0)

# dB range for normalizing FFT magnitudes to 0.0–1.0 bar heights
DB_FLOOR = -80.0
DB_CEIL = 0.0


@ti.data_oriented
class Canvas:

    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.pixels = ti.Vector.field(3, dtype=ti.f32, shape=(width, height))
        self.background_color = BACKGROUND_COLOR_DEFAULT

        # One bar-height value per pixel column, normalized 0.0–1.0
        self._bar_heights = ti.field(dtype=ti.f32, shape=(width,))

    # ── Interface ──────────────────────────────────────────────

    def render(self, analysis=None):
        """Fill the pixel field. Draws FFT bars when analysis data is present."""
        r, g, b = self.background_color
        if analysis is not None:
            self._update_bar_heights(analysis)
            self._render_spectrum(r, g, b)
        else:
            self._fill(r, g, b)

    def frame_data(self):
        """Return pixels as a flat float32 RGBA array (row-major, top-to-bottom)."""
        rgb = self.pixels.to_numpy()                                    # (W, H, 3)
        rgb = np.transpose(rgb, (1, 0, 2))                             # (H, W, 3)
        rgba = np.ones((self.height, self.width, 4), dtype=np.float32)
        rgba[:, :, :3] = rgb
        return rgba.ravel()

    # ── Internal ──────────────────────────────────────────────

    def _update_bar_heights(self, analysis):
        """Map FFT magnitude bins to per-column bar heights."""
        db = analysis.magnitudes_db
        db_range = DB_CEIL - DB_FLOOR
        normalized = np.clip((db - DB_FLOOR) / db_range, 0.0, 1.0)

        # Linear mapping: each pixel column picks the nearest FFT bin
        indices = np.linspace(0, analysis.num_bins - 1, self.width).astype(np.intp)
        column_heights = normalized[indices].astype(np.float32)

        self._bar_heights.from_numpy(column_heights)

    @ti.kernel
    def _fill(self, r: ti.f32, g: ti.f32, b: ti.f32):
        for i, j in self.pixels:
            self.pixels[i, j] = ti.Vector([r, g, b])

    @ti.kernel
    def _render_spectrum(self, bg_r: ti.f32, bg_g: ti.f32, bg_b: ti.f32):
        for i, j in self.pixels:
            magnitude = self._bar_heights[i]
            bar_top = self.height - ti.cast(magnitude * self.height, ti.i32)
            if j >= bar_top:
                self.pixels[i, j] = ti.Vector([0.30, 0.80, 0.50])
            else:
                self.pixels[i, j] = ti.Vector([bg_r, bg_g, bg_b])
