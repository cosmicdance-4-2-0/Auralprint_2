"""GPU-rendered pixel buffer via Taichi.

Interface (stable):
    render(orb_frames=None, overlay=None)  — background + overlay + trails + particles
    frame_data() -> np.array               — flat float32 RGBA for DearPyGui raw texture
    background_color                       — (r, g, b) tuple, 0.0–1.0 range
    width, height                          — pixel dimensions (read-only after init)
"""

import taichi as ti
import numpy as np

from bands import BAND_COUNT

BACKGROUND_COLOR_DEFAULT = (0.0, 0.0, 0.0)

MAX_PARTICLES = 4096
MAX_TRAIL_POINTS = 256
MAX_PARTICLE_RADIUS_I = 10   # compile-time bound for particle circle loop
MAX_OVERLAY_POINT_I = 5      # compile-time bound for overlay point circle loop


@ti.data_oriented
class Canvas:

    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.pixels = ti.Vector.field(3, dtype=ti.f32, shape=(width, height))
        self.background_color = BACKGROUND_COLOR_DEFAULT

        # Particle fields
        self._p_x = ti.field(dtype=ti.f32, shape=(MAX_PARTICLES,))
        self._p_y = ti.field(dtype=ti.f32, shape=(MAX_PARTICLES,))
        self._p_r = ti.field(dtype=ti.f32, shape=(MAX_PARTICLES,))
        self._p_g = ti.field(dtype=ti.f32, shape=(MAX_PARTICLES,))
        self._p_b = ti.field(dtype=ti.f32, shape=(MAX_PARTICLES,))
        self._p_sz = ti.field(dtype=ti.f32, shape=(MAX_PARTICLES,))

        # Trail line point fields (reused per-orb)
        self._t_x = ti.field(dtype=ti.f32, shape=(MAX_TRAIL_POINTS,))
        self._t_y = ti.field(dtype=ti.f32, shape=(MAX_TRAIL_POINTS,))

        # Overlay ring fields (always exactly BAND_COUNT — no padding needed)
        self._o_x = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_y = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_pt_r = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_pt_g = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_pt_b = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_ln_r = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_ln_g = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))
        self._o_ln_b = ti.field(dtype=ti.f32, shape=(BAND_COUNT,))

        # Pre-allocated numpy upload buffers (particles + trails need padding)
        self._buf_p_x = np.zeros(MAX_PARTICLES, dtype=np.float32)
        self._buf_p_y = np.zeros(MAX_PARTICLES, dtype=np.float32)
        self._buf_p_r = np.zeros(MAX_PARTICLES, dtype=np.float32)
        self._buf_p_g = np.zeros(MAX_PARTICLES, dtype=np.float32)
        self._buf_p_b = np.zeros(MAX_PARTICLES, dtype=np.float32)
        self._buf_p_sz = np.zeros(MAX_PARTICLES, dtype=np.float32)
        self._buf_t_x = np.zeros(MAX_TRAIL_POINTS, dtype=np.float32)
        self._buf_t_y = np.zeros(MAX_TRAIL_POINTS, dtype=np.float32)

    # ── Interface ──────────────────────────────────────────────

    def render(self, orb_frames=None, overlay=None):
        """Draw: background → overlay ring → orb trails → orb particles."""
        bg_r, bg_g, bg_b = self.background_color
        self._fill(bg_r, bg_g, bg_b)

        # Layer 1: overlay ring (behind orb visuals)
        if overlay is not None and overlay.count > 0:
            self._upload_overlay(overlay)
            if overlay.connect:
                self._render_overlay_lines(overlay.count)
            self._render_overlay_points(overlay.count, overlay.point_size)

        if not orb_frames:
            return

        # Layer 2: trails (per-orb to avoid cross-orb segment connections)
        for frame in orb_frames:
            tc = min(frame.trail_count, MAX_TRAIL_POINTS)
            if tc < 2:
                continue
            self._buf_t_x[:tc] = frame.trail_x[:tc]
            self._buf_t_y[:tc] = frame.trail_y[:tc]
            self._t_x.from_numpy(self._buf_t_x)
            self._t_y.from_numpy(self._buf_t_y)
            self._render_trails(tc, frame.trail_r, frame.trail_g, frame.trail_b)

        # Layer 3: particles (merged from all orbs, single kernel call)
        offset = 0
        for frame in orb_frames:
            count = min(frame.particle_count, MAX_PARTICLES - offset)
            if count <= 0:
                break
            end = offset + count
            self._buf_p_x[offset:end] = frame.particle_x[:count]
            self._buf_p_y[offset:end] = frame.particle_y[:count]
            self._buf_p_r[offset:end] = frame.particle_r[:count]
            self._buf_p_g[offset:end] = frame.particle_g[:count]
            self._buf_p_b[offset:end] = frame.particle_b[:count]
            self._buf_p_sz[offset:end] = frame.particle_sizes[:count]
            offset += count

        if offset > 0:
            self._p_x.from_numpy(self._buf_p_x)
            self._p_y.from_numpy(self._buf_p_y)
            self._p_r.from_numpy(self._buf_p_r)
            self._p_g.from_numpy(self._buf_p_g)
            self._p_b.from_numpy(self._buf_p_b)
            self._p_sz.from_numpy(self._buf_p_sz)
            self._render_particles(offset)

    def frame_data(self):
        """Return pixels as a flat float32 RGBA array (row-major, top-to-bottom)."""
        rgb = self.pixels.to_numpy()                                    # (W, H, 3)
        rgb = np.transpose(rgb, (1, 0, 2))                             # (H, W, 3)
        rgba = np.ones((self.height, self.width, 4), dtype=np.float32)
        rgba[:, :, :3] = rgb
        return rgba.ravel()

    # ── Overlay upload ─────────────────────────────────────────

    def _upload_overlay(self, overlay):
        """Copy overlay arrays into Taichi fields (always exactly BAND_COUNT)."""
        self._o_x.from_numpy(overlay.x)
        self._o_y.from_numpy(overlay.y)
        self._o_pt_r.from_numpy(overlay.pt_r)
        self._o_pt_g.from_numpy(overlay.pt_g)
        self._o_pt_b.from_numpy(overlay.pt_b)
        self._o_ln_r.from_numpy(overlay.ln_r)
        self._o_ln_g.from_numpy(overlay.ln_g)
        self._o_ln_b.from_numpy(overlay.ln_b)

    # ── Kernels: background ────────────────────────────────────

    @ti.kernel
    def _fill(self, r: ti.f32, g: ti.f32, b: ti.f32):
        for i, j in self.pixels:
            self.pixels[i, j] = ti.Vector([r, g, b])

    # ── Kernels: overlay ring ──────────────────────────────────

    @ti.kernel
    def _render_overlay_lines(self, count: ti.i32):
        for i in range(count):
            j = (i + 1) % count
            self._paint_line(
                self._o_x[i], self._o_y[i],
                self._o_x[j], self._o_y[j],
                self._o_ln_r[i], self._o_ln_g[i], self._o_ln_b[i],
            )

    @ti.kernel
    def _render_overlay_points(self, count: ti.i32, point_size: ti.f32):
        r2 = point_size * point_size
        for i in range(count):
            cx = self._o_x[i]
            cy = self._o_y[i]
            cr = self._o_pt_r[i]
            cg = self._o_pt_g[i]
            cb = self._o_pt_b[i]

            for di in range(-MAX_OVERLAY_POINT_I, MAX_OVERLAY_POINT_I + 1):
                for dj in range(-MAX_OVERLAY_POINT_I, MAX_OVERLAY_POINT_I + 1):
                    if ti.f32(di * di + dj * dj) <= r2:
                        px = ti.cast(cx, ti.i32) + di
                        py = ti.cast(cy, ti.i32) + dj
                        if 0 <= px < self.width and 0 <= py < self.height:
                            self.pixels[px, py] = ti.Vector([cr, cg, cb])

    # ── Kernels: orb particles ─────────────────────────────────

    @ti.kernel
    def _render_particles(self, count: ti.i32):
        for idx in range(count):
            cx = self._p_x[idx]
            cy = self._p_y[idx]
            radius = self._p_sz[idx]
            cr = self._p_r[idx]
            cg = self._p_g[idx]
            cb = self._p_b[idx]

            r2 = radius * radius
            for di in range(-MAX_PARTICLE_RADIUS_I, MAX_PARTICLE_RADIUS_I + 1):
                for dj in range(-MAX_PARTICLE_RADIUS_I, MAX_PARTICLE_RADIUS_I + 1):
                    if ti.f32(di * di + dj * dj) <= r2:
                        px = ti.cast(cx, ti.i32) + di
                        py = ti.cast(cy, ti.i32) + dj
                        if 0 <= px < self.width and 0 <= py < self.height:
                            self.pixels[px, py] = ti.Vector([cr, cg, cb])

    # ── Kernels: orb trails ────────────────────────────────────

    @ti.kernel
    def _render_trails(self, count: ti.i32, r: ti.f32, g: ti.f32, b: ti.f32):
        for seg in range(count - 1):
            self._paint_line(
                self._t_x[seg], self._t_y[seg],
                self._t_x[seg + 1], self._t_y[seg + 1],
                r, g, b,
            )

    # ── Shared: DDA line rasterizer ────────────────────────────

    @ti.func
    def _paint_line(self, x0: ti.f32, y0: ti.f32, x1: ti.f32, y1: ti.f32,
                    cr: ti.f32, cg: ti.f32, cb: ti.f32):
        dx = x1 - x0
        dy = y1 - y0
        steps = ti.max(ti.abs(dx), ti.abs(dy))
        if steps >= 0.5:
            n = ti.cast(steps, ti.i32) + 1
            for s in range(n):
                t = ti.f32(s) / steps
                px = ti.cast(x0 + dx * t, ti.i32)
                py = ti.cast(y0 + dy * t, ti.i32)
                if 0 <= px < self.width and 0 <= py < self.height:
                    self.pixels[px, py] = ti.Vector([cr, cg, cb])
