"""Scrubber — waveform overview bar with click/drag seeking.

Interface (stable):
    build(width, height)            — create DearPyGui drawlist + time readout
    load_file(filepath)             — start async waveform decode (non-blocking)
    reset()                         — clear waveform, return to empty state
    draw(position, duration)        — redraw each frame, handle mouse interaction
    on_seek: callable(float) | None — user callback, receives seek fraction 0.0–1.0
"""

import threading

import numpy as np
import dearpygui.dearpygui as dpg
from audio_decode import try_decode_audio

PEAK_BUCKETS = 512
SCRUBBER_HEIGHT = 36

# Colors (matched to dark background — will become theme-driven in v0.3.x)
COLOR_BG = (30, 30, 30, 240)
COLOR_WF_UNPLAYED = (100, 100, 100, 170)
COLOR_WF_PLAYED = (200, 200, 200, 230)
COLOR_PLAYHEAD = (255, 255, 255, 250)
COLOR_CENTER_LINE = (80, 80, 80, 120)
COLOR_STATUS_TEXT = (160, 160, 160, 180)


class Scrubber:

    def __init__(self):
        self._peaks = None              # float32 array of normalized peak values
        self._status = "empty"          # "empty" | "decoding" | "ready" | "unsupported" | "corrupted" | "partial"
        self._decode_failure = None
        self._decode_token = 0
        self._width = 0
        self._height = 0
        self._dragging = False

        self._drawlist_tag = None
        self._time_tag = None

        # User callback: called with a float 0.0–1.0 when the user seeks
        self.on_seek = None

    # ── Interface ──────────────────────────────────────────────

    def build(self, width, height=SCRUBBER_HEIGHT):
        """Create the DearPyGui drawlist and time readout. Call once during UI setup."""
        self._width = width
        self._height = height

        with dpg.group(horizontal=True):
            self._drawlist_tag = dpg.add_drawlist(
                width=width, height=height, tag="scrubber_dl",
            )
            self._time_tag = dpg.add_text(
                "--:-- / --:--", tag="scrubber_time",
            )

    def load_file(self, filepath):
        """Start asynchronous waveform decode. Non-blocking — playback starts immediately."""
        token = self._next_token()
        self._peaks = None
        self._decode_failure = None
        self._status = "decoding"

        thread = threading.Thread(
            target=self._decode_worker,
            args=(filepath, token),
            daemon=True,
        )
        thread.start()

    def reset(self):
        """Clear waveform data. Called on queue clear or app teardown."""
        self._next_token()  # invalidate any in-flight decode
        self._peaks = None
        self._decode_failure = None
        self._status = "empty"

    def draw(self, position, duration):
        """Redraw the scrubber and handle mouse interaction. Call each frame."""
        self._handle_mouse(duration)
        self._redraw(position, duration)
        self._update_time(position, duration)

    # ── Async decode ──────────────────────────────────────────

    def _next_token(self):
        self._decode_token += 1
        return self._decode_token

    def _decode_worker(self, filepath, token):
        """Background thread: read audio file and compute peak buckets."""
        decoded, failure = try_decode_audio(filepath)
        if decoded is None:
            if self._decode_token == token:
                self._peaks = None
                self._decode_failure = failure.error if failure is not None else None
                kind = self._decode_failure.kind if self._decode_failure is not None else "corrupted"
                if kind not in {"unsupported", "corrupted"}:
                    kind = "corrupted"
                self._status = kind
            return

        if self._decode_token != token:
            return
        data = decoded.samples

        # Mix to mono and compute peaks
        if data.shape[1] > 1:
            mono = data.mean(axis=1)
        else:
            mono = data[:, 0]

        total_samples = len(mono)
        bucket_size = max(1, total_samples // PEAK_BUCKETS)
        num_buckets = min(PEAK_BUCKETS, total_samples)

        peaks = np.zeros(num_buckets, dtype=np.float32)
        for b in range(num_buckets):
            start = b * bucket_size
            end = min(start + bucket_size, total_samples)
            peaks[b] = float(np.max(np.abs(mono[start:end])))

        if self._decode_token != token:
            return

        self._peaks = peaks
        self._decode_failure = decoded.warning
        self._status = "partial" if decoded.warning is not None and decoded.warning.kind == "partial" else "ready"

    # ── Mouse interaction ─────────────────────────────────────

    def _handle_mouse(self, duration):
        """Check mouse state for click/drag seeking on the drawlist."""
        if self._drawlist_tag is None or duration <= 0:
            self._dragging = False
            return

        hovered = dpg.is_item_hovered(self._drawlist_tag)
        mouse_down = dpg.is_mouse_button_down(dpg.mvMouseButton_Left)

        if hovered and mouse_down and not self._dragging:
            self._dragging = True

        if self._dragging:
            if mouse_down:
                self._seek_from_mouse(duration)
            else:
                self._dragging = False

    def _seek_from_mouse(self, duration):
        """Compute seek fraction from mouse position relative to the drawlist."""
        if self._drawlist_tag is None or duration <= 0:
            return

        mouse_x = dpg.get_mouse_pos()[0]
        item_pos = dpg.get_item_pos(self._drawlist_tag)
        local_x = mouse_x - item_pos[0]
        fraction = max(0.0, min(local_x / self._width, 1.0))

        if callable(self.on_seek):
            self.on_seek(fraction)

    # ── Drawing ───────────────────────────────────────────────

    def _redraw(self, position, duration):
        """Clear and redraw the scrubber drawlist."""
        if self._drawlist_tag is None:
            return

        dpg.delete_item(self._drawlist_tag, children_only=True)

        w = self._width
        h = self._height
        mid_y = h / 2.0

        # Background
        dpg.draw_rectangle(
            (0, 0), (w, h), fill=COLOR_BG,
            color=(0, 0, 0, 0), parent=self._drawlist_tag,
        )

        playback_frac = (position / duration) if duration > 0 else 0.0
        playback_frac = max(0.0, min(playback_frac, 1.0))
        played_px = playback_frac * w

        if self._peaks is not None and len(self._peaks) > 0:
            self._draw_waveform(w, h, mid_y, played_px)
        else:
            self._draw_center_line(w, mid_y)

        # Playhead
        if duration > 0:
            dpg.draw_line(
                (played_px, 0), (played_px, h),
                color=COLOR_PLAYHEAD, thickness=2,
                parent=self._drawlist_tag,
            )

    def _draw_waveform(self, w, h, mid_y, played_px):
        """Draw waveform bars with played/unplayed distinction."""
        peaks = self._peaks
        num_bars = len(peaks)
        bar_width = max(1.0, w / num_bars)

        for i in range(num_bars):
            x = (i / num_bars) * w
            amp = peaks[i] * mid_y * 0.92

            if amp < 0.5:
                amp = 0.5

            top = mid_y - amp
            bottom = mid_y + amp
            bar_right = x + bar_width - 0.5

            # Choose color based on played/unplayed
            bar_mid = x + bar_width / 2.0
            color = COLOR_WF_PLAYED if bar_mid <= played_px else COLOR_WF_UNPLAYED

            dpg.draw_rectangle(
                (x, top), (bar_right, bottom),
                fill=color, color=(0, 0, 0, 0),
                parent=self._drawlist_tag,
            )

    def _draw_center_line(self, w, mid_y):
        """Draw a flat center line for empty/decoding/error states."""
        color = COLOR_CENTER_LINE
        if self._status in {"unsupported", "corrupted"}:
            color = (180, 80, 80, 150)
        elif self._status == "partial":
            color = (170, 130, 70, 150)
        elif self._status == "decoding":
            color = (120, 120, 120, 150)

        dpg.draw_line(
            (0, mid_y), (w, mid_y),
            color=color, thickness=1.5,
            parent=self._drawlist_tag,
        )

    def _update_time(self, position, duration):
        """Update the time readout text."""
        if self._time_tag is None:
            return

        pos_str = _format_time(position) if duration > 0 else "--:--"
        dur_str = _format_time(duration) if duration > 0 else "--:--"

        suffix = ""
        if self._status == "decoding":
            suffix = " \u2022 decoding waveform"
        elif self._status == "unsupported":
            suffix = " \u2022 waveform unsupported"
            if self._decode_failure is not None:
                suffix = f" \u2022 unsupported ({self._decode_failure.backend}: {self._decode_failure.code})"
        elif self._status == "corrupted":
            suffix = " \u2022 waveform decode failed"
            if self._decode_failure is not None:
                suffix = f" \u2022 decode failed ({self._decode_failure.backend}: {self._decode_failure.code})"
        elif self._status == "partial":
            suffix = " \u2022 partial waveform"
            if self._decode_failure is not None:
                suffix = f" \u2022 partial waveform ({self._decode_failure.backend})"
        elif self._status == "empty" and duration <= 0:
            suffix = " \u2022 no track loaded"

        dpg.set_value(self._time_tag, f"{pos_str} / {dur_str}{suffix}")

    @property
    def decode_failure(self):
        return self._decode_failure


def _format_time(seconds):
    """Format seconds as M:SS."""
    if seconds <= 0:
        return "0:00"
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"
