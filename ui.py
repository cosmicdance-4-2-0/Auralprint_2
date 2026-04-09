"""DearPyGui application shell — window, controls, render loop.

Interface (stable):
    run()  — blocking; returns when the window closes
"""

import time

import numpy as np
import dearpygui.dearpygui as dpg

from orb import RMS_GAIN
from overlay import compute_overlay, advance_phase, OVERLAY_PHASE_MODE
from colors import (
    make_particle_color_fn, pick_line_color, dominant_color_from,
    PARTICLE_COLOR_MODE, LINE_COLOR_MODE, FIXED_PARTICLE_COLOR,
)
from scrubber import Scrubber
from playlist import Queue
from config import Preferences, CONFIG, resolve

VIEWPORT_TITLE = "Auralprint2"
VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 760

AUDIO_EXTENSIONS = "Audio (*.wav *.flac *.ogg *.mp3){.wav,.flac,.ogg,.mp3}"
ALL_EXTENSIONS = "All (*.*){.*}"

FILE_DIALOG_WIDTH = 700
FILE_DIALOG_HEIGHT = 400

SEEK_STEP_SEC = 5
SEEK_STEP_LARGE_SEC = 30
VOLUME_STEP = 0.05

SCRUBBER_WIDTH = 1100
QUEUE_PANEL_HEIGHT = 200

# Toast duration in seconds
TOAST_DURATION_SEC = 2.5

# Grave/backtick key constant — varies across DearPyGui versions
_KEY_GRAVE = getattr(dpg, "mvKey_Grave", getattr(dpg, "mvKey_GraveAccent", None))


def _rms(samples):
    """RMS of a float32 sample array."""
    return float(np.sqrt(np.mean(samples * samples)))


class App:

    def __init__(self, audio, analyzer, bandbank, canvas, orbs):
        self._audio = audio
        self._analyzer = analyzer
        self._bandbank = bandbank
        self._canvas = canvas
        self._orbs = orbs
        self._texture_tag = None
        self._scrubber = Scrubber()
        self._queue = Queue()

        self._last_rms = 0.0
        self._last_dominant = ""
        self._last_stereo = False
        self._last_time = time.perf_counter()
        self._ring_phase = 0.0
        self._sim_paused = False
        self._queue_visible = False

        # Configuration system
        self._prefs = Preferences()
        self._repeat_mode = self._prefs.get("audio.repeat_mode")

        # Toast message: (text, expire_time)
        self._toast_text = ""
        self._toast_expire = 0.0

        # Wire end-of-track callback
        self._audio.on_track_ended = self._on_track_ended

    def run(self):
        """Build the UI and enter the main loop. Blocks until window closes."""
        dpg.create_context()
        self._build_ui()

        dpg.create_viewport(
            title=VIEWPORT_TITLE,
            width=VIEWPORT_WIDTH,
            height=VIEWPORT_HEIGHT,
        )
        dpg.setup_dearpygui()
        dpg.show_viewport()
        dpg.set_primary_window("primary_window", True)

        self._last_time = time.perf_counter()

        while dpg.is_dearpygui_running():
            self._tick()
            dpg.render_dearpygui_frame()

        self._audio.shutdown()
        dpg.destroy_context()

    # ── UI construction ───────────────────────────────────────

    def _build_ui(self):
        initial_frame = self._canvas.frame_data()

        with dpg.texture_registry():
            self._texture_tag = dpg.add_raw_texture(
                self._canvas.width,
                self._canvas.height,
                initial_frame,
                format=dpg.mvFormat_Float_rgba,
            )

        with dpg.window(tag="primary_window"):
            dpg.add_image(self._texture_tag)

            # Scrubber bar
            self._scrubber.build(SCRUBBER_WIDTH)
            self._scrubber.on_seek = self._on_scrubber_seek

            # Transport row
            with dpg.group(horizontal=True):
                dpg.add_button(label="Load", callback=self._on_load)
                dpg.add_button(label="\u23ee Prev", tag="btn_prev",
                               callback=self._on_prev)
                dpg.add_button(label="Play", tag="btn_play",
                               callback=self._on_play_pause)
                dpg.add_button(label="Stop", callback=self._on_stop)
                dpg.add_button(label="Next \u23ed", tag="btn_next",
                               callback=self._on_next)
                dpg.add_button(label="Repeat: Off", tag="btn_repeat",
                               callback=self._on_repeat)
                dpg.add_button(label="Shuffle", tag="btn_shuffle",
                               callback=self._on_shuffle)
                dpg.add_button(label="\u2630 Queue", tag="btn_queue_toggle",
                               callback=self._on_toggle_queue)

            # Volume row
            with dpg.group(horizontal=True):
                dpg.add_checkbox(label="Mute", tag="chk_mute",
                                 callback=self._on_mute_changed)
                dpg.add_text("Vol:")
                dpg.add_slider_float(
                    tag="sld_volume",
                    default_value=self._audio.volume,
                    min_value=0.0, max_value=1.0,
                    width=200,
                    callback=self._on_volume_changed,
                    format="%.2f",
                )
                dpg.add_text("", tag="txt_volume")

            # Status line
            dpg.add_text("No audio loaded.", tag="txt_status")

            # Queue panel (hidden by default)
            with dpg.child_window(
                tag="queue_panel", height=QUEUE_PANEL_HEIGHT,
                show=False, border=True,
            ):
                with dpg.group(horizontal=True):
                    dpg.add_text("Queue", color=(200, 200, 200))
                    dpg.add_button(label="Clear", callback=self._on_clear_queue)
                dpg.add_group(tag="queue_list")

            # Keyboard shortcut reference
            dpg.add_text(
                "Space=play/pause  N/P=next/prev  \u2190\u2192=seek  "
                "\u2191\u2193=volume  M=mute  R=reset  H=queue  `=sim pause",
                color=(255, 255, 255, 80),
            )

        with dpg.file_dialog(
            directory_selector=False,
            show=False,
            callback=self._on_file_selected,
            tag="file_dialog",
            width=FILE_DIALOG_WIDTH,
            height=FILE_DIALOG_HEIGHT,
        ):
            dpg.add_file_extension(AUDIO_EXTENSIONS)
            dpg.add_file_extension(ALL_EXTENSIONS)

        # Keyboard handler
        with dpg.handler_registry():
            dpg.add_key_press_handler(callback=self._on_key_press)

    # ── Toast ─────────────────────────────────────────────────

    def _toast(self, msg):
        """Show a brief message in the status line."""
        self._toast_text = msg
        self._toast_expire = time.perf_counter() + TOAST_DURATION_SEC

    def _active_toast(self):
        """Return the current toast text if still active, else empty string."""
        if self._toast_text and time.perf_counter() < self._toast_expire:
            return self._toast_text
        return ""

    # ── Track loading ─────────────────────────────────────────

    def _load_and_play(self, filepath):
        """Load a file into the audio engine, start playback, update scrubber and visuals."""
        for orb in self._orbs:
            orb.reset()
        self._ring_phase = 0.0
        self._scrubber.load_file(filepath)
        if self._audio.load(filepath):
            self._audio.play()

    # ── Per-frame update ──────────────────────────────────────

    def _tick(self):
        now = time.perf_counter()
        dt = now - self._last_time
        self._last_time = now
        now_sec = now

        # Poll async audio events (track ended → auto-advance)
        self._audio.poll_events()

        # Channel-aware analysis pipeline
        channels = self._audio.get_channel_samples(self._analyzer.fft_size)

        if channels is not None:
            self._last_stereo = channels.is_stereo
            analysis_c = self._analyzer.process(channels.center)
            channel_rms = {
                "L": _rms(channels.left),
                "R": _rms(channels.right),
                "C": _rms(channels.center),
            }
            channel_waveforms = {
                "L": channels.left,
                "R": channels.right,
                "C": channels.center,
            }
        else:
            analysis_c = None
            channel_rms = {"L": 0.0, "R": 0.0, "C": 0.0}
            channel_waveforms = {"L": None, "R": None, "C": None}

        band_result = self._bandbank.compute(analysis_c, self._audio.samplerate)

        if analysis_c is not None:
            self._last_rms = analysis_c.rms
        if band_result is not None:
            self._last_dominant = band_result.dominant_name

        # Color policy
        color_fn = make_particle_color_fn(
            PARTICLE_COLOR_MODE, band_result, FIXED_PARTICLE_COLOR
        )
        dom_color = dominant_color_from(band_result)

        # Overlay ring phase
        orb_angle = self._orbs[0].angle if self._orbs else 0.0
        self._ring_phase = advance_phase(
            self._ring_phase, dt, OVERLAY_PHASE_MODE, orb_angle
        )

        # Compute overlay ring
        overlay_frame = compute_overlay(
            band_result, self._ring_phase, channel_waveforms["C"],
            self._canvas.width, self._canvas.height,
            self._canvas.background_color,
        )

        # Step each orb (unless sim is paused)
        bg = self._canvas.background_color
        orb_frames = []
        for orb in self._orbs:
            if not self._sim_paused:
                energy = min(channel_rms[orb.channel] * RMS_GAIN, 1.0)
                waveform = channel_waveforms[orb.channel]
                orb.step(dt, now_sec, energy, color_fn, waveform)

            line_color = pick_line_color(
                LINE_COLOR_MODE,
                orb.last_particle_color,
                dom_color,
                FIXED_PARTICLE_COLOR,
            )
            orb_frames.append(orb.snapshot(now_sec, bg, line_color))

        self._canvas.render(orb_frames, overlay_frame)
        dpg.set_value(self._texture_tag, self._canvas.frame_data())

        # Scrubber update
        self._scrubber.draw(self._audio.position, self._audio.duration)

        self._refresh_status()

    # ── Status display ────────────────────────────────────────

    def _refresh_status(self):
        a = self._audio
        toast = self._active_toast()

        if not a.is_loaded:
            text = toast if toast else "No audio loaded."
            dpg.set_value("txt_status", text)
            dpg.configure_item("btn_play", label="Play")
            dpg.set_value("txt_volume", f"{a.volume:.2f}")
            self._refresh_nav_buttons()
            return

        state = "playing" if a.is_playing else "paused"
        stereo = "stereo" if self._last_stereo else "mono-ish"
        mute_str = " [MUTED]" if a.muted else ""
        dominant = f"  \u2666 {self._last_dominant}" if self._last_dominant else ""
        sim = "  [SIM PAUSED]" if self._sim_paused else ""

        q = self._queue
        q_pos = f"[{q.current_index + 1}/{q.length}] " if q.length > 0 else ""

        if toast:
            status = f"{q_pos}{a.filename}  ({state}){mute_str} \u2014 {toast}"
        else:
            status = (
                f"{q_pos}{a.filename}  ({state}){mute_str}"
                f"  {stereo}{dominant}{sim}"
            )

        dpg.set_value("txt_status", status)
        dpg.configure_item("btn_play", label="Pause" if a.is_playing else "Play")
        dpg.set_value("txt_volume", f"{a.volume:.2f}")
        self._refresh_nav_buttons()

    def _refresh_nav_buttons(self):
        """Enable/disable Prev/Next/Shuffle based on queue state and repeat mode."""
        q = self._queue
        wrap = self._repeat_mode == "all" and q.length > 1
        dpg.configure_item("btn_prev", enabled=q.can_prev or wrap)
        dpg.configure_item("btn_next", enabled=q.can_next or wrap)
        dpg.configure_item("btn_shuffle", enabled=q.length >= 3)

        labels = {"none": "Repeat: Off", "one": "Repeat: One", "all": "Repeat: All"}
        dpg.configure_item("btn_repeat", label=labels[self._repeat_mode])

    def _sync_volume_ui(self):
        """Sync the volume slider and readout to the current audio engine value."""
        dpg.set_value("sld_volume", self._audio.volume)
        dpg.set_value("txt_volume", f"{self._audio.volume:.2f}")

    def _sync_mute_ui(self):
        """Sync the mute checkbox to the current audio engine value."""
        dpg.set_value("chk_mute", self._audio.muted)

    # ── Queue panel ───────────────────────────────────────────

    def _refresh_queue_panel(self):
        """Rebuild the queue list UI from the queue snapshot."""
        dpg.delete_item("queue_list", children_only=True)

        snap = self._queue.snapshot()

        for item in snap.items:
            idx = item["index"]
            name = item["name"]
            active = item["active"]

            with dpg.group(horizontal=True, parent="queue_list"):
                label = f"{'> ' if active else '  '}{idx + 1}. {name}"
                dpg.add_button(
                    label=label,
                    width=900,
                    callback=lambda s, a, i=idx: self._on_queue_jump(i),
                )
                dpg.add_button(
                    label="x",
                    callback=lambda s, a, i=idx: self._on_queue_remove(i),
                )

    # ── Callbacks: transport ──────────────────────────────────

    def _on_load(self, sender=None, app_data=None):
        dpg.show_item("file_dialog")

    def _on_file_selected(self, sender, app_data):
        if not app_data:
            return

        selections = app_data.get("selections", {})
        if selections:
            filepaths = list(selections.values())
        else:
            single = app_data.get("file_path_name", "")
            filepaths = [single] if single else []

        if not filepaths:
            return

        for filepath in filepaths:
            was_empty = self._queue.length == 0
            idx = self._queue.add(filepath)
            if was_empty:
                self._queue.set_cursor(idx)
                self._load_and_play(filepath)

        self._refresh_queue_panel()

    def _on_play_pause(self, sender=None, app_data=None):
        if not self._audio.is_loaded:
            return
        if self._audio.is_playing:
            self._audio.pause()
        else:
            self._audio.play()

    def _on_stop(self, sender=None, app_data=None):
        self._audio.stop()

    def _on_prev(self, sender=None, app_data=None):
        filepath = self._queue.pick_manual_prev(self._repeat_mode)
        if filepath:
            self._load_and_play(filepath)
            self._refresh_queue_panel()

    def _on_next(self, sender=None, app_data=None):
        filepath = self._queue.pick_manual_next(self._repeat_mode)
        if filepath:
            self._load_and_play(filepath)
            self._refresh_queue_panel()

    def _on_repeat(self, sender=None, app_data=None):
        cycle = {"none": "one", "one": "all", "all": "none"}
        self._repeat_mode = cycle[self._repeat_mode]
        labels = {"none": "Off", "one": "One", "all": "All"}
        self._toast(f"Repeat: {labels[self._repeat_mode]}")

    def _on_shuffle(self, sender=None, app_data=None):
        if self._queue.shuffle():
            self._refresh_queue_panel()
            self._toast("Queue shuffled")

    def _on_track_ended(self):
        """Called by AudioEngine.poll_events() when a track finishes."""
        filepath = self._queue.pick_auto_advance(self._repeat_mode)
        if filepath:
            self._load_and_play(filepath)
            self._refresh_queue_panel()

    def _on_scrubber_seek(self, fraction):
        """Called by the scrubber when the user clicks or drags to a position."""
        if self._audio.is_loaded and self._audio.duration > 0:
            self._audio.seek(fraction * self._audio.duration)

    # ── Callbacks: queue panel ────────────────────────────────

    def _on_toggle_queue(self, sender=None, app_data=None):
        self._queue_visible = not self._queue_visible
        dpg.configure_item("queue_panel", show=self._queue_visible)
        if self._queue_visible:
            self._refresh_queue_panel()

    def _on_queue_jump(self, index):
        filepath = self._queue.go_to(index)
        if filepath:
            self._load_and_play(filepath)
            self._refresh_queue_panel()

    def _on_queue_remove(self, index):
        removing_current = index == self._queue.current_index
        new_current = self._queue.remove(index)

        if self._queue.length == 0:
            self._audio.stop()
            self._scrubber.reset()
        elif removing_current and new_current:
            self._load_and_play(new_current)

        self._refresh_queue_panel()

    def _on_clear_queue(self, sender=None, app_data=None):
        self._queue.clear()
        self._audio.stop()
        self._scrubber.reset()
        self._refresh_queue_panel()

    # ── Callbacks: volume ─────────────────────────────────────

    def _on_volume_changed(self, sender, app_data):
        self._audio.volume = app_data

    def _on_mute_changed(self, sender, app_data):
        self._audio.muted = app_data

    # ── Callbacks: keyboard ───────────────────────────────────

    # Widget tags where global shortcuts should be suppressed.
    _INTERACTIVE_TAGS = ("sld_volume", "chk_mute")

    def _widget_is_active(self):
        """Return True if any interactive widget has focus/is being adjusted."""
        for tag in self._INTERACTIVE_TAGS:
            try:
                if dpg.is_item_active(tag) or dpg.is_item_focused(tag):
                    return True
            except Exception:
                pass
        # Also suppress while file dialog is visible
        try:
            if dpg.is_item_shown("file_dialog"):
                return True
        except Exception:
            pass
        return False

    def _on_key_press(self, sender, app_data):
        key = app_data

        if self._widget_is_active():
            return

        shift = dpg.is_key_down(dpg.mvKey_LShift) or dpg.is_key_down(dpg.mvKey_RShift)

        # ── Playback ──────────────────────────────────────────

        # Space: play/pause audio
        if key == dpg.mvKey_Spacebar:
            self._on_play_pause()
            return

        # N: next track
        if key == dpg.mvKey_N:
            self._on_next()
            return

        # P: previous track
        if key == dpg.mvKey_P:
            self._on_prev()
            return

        # Home: restart current track from beginning
        if key == dpg.mvKey_Home and self._audio.is_loaded:
            self._audio.seek(0)
            self._toast("Restart track")
            return

        # End: skip to end of current track (triggers auto-advance)
        if key == dpg.mvKey_End and self._audio.is_loaded:
            self._audio.seek(self._audio.duration)
            return

        # ── Seek ──────────────────────────────────────────────

        # Right arrow: seek forward
        if key == dpg.mvKey_Right and self._audio.is_loaded:
            step = SEEK_STEP_LARGE_SEC if shift else SEEK_STEP_SEC
            self._audio.seek(self._audio.position + step)
            return

        # Left arrow: seek backward
        if key == dpg.mvKey_Left and self._audio.is_loaded:
            step = SEEK_STEP_LARGE_SEC if shift else SEEK_STEP_SEC
            self._audio.seek(self._audio.position - step)
            return

        # ── Volume ────────────────────────────────────────────

        # Up arrow: volume up
        if key == dpg.mvKey_Up:
            self._audio.volume = min(1.0, self._audio.volume + VOLUME_STEP)
            self._sync_volume_ui()
            return

        # Down arrow: volume down
        if key == dpg.mvKey_Down:
            self._audio.volume = max(0.0, self._audio.volume - VOLUME_STEP)
            self._sync_volume_ui()
            return

        # M: mute toggle
        if key == dpg.mvKey_M:
            self._audio.muted = not self._audio.muted
            self._sync_mute_ui()
            self._toast("Muted" if self._audio.muted else "Unmuted")
            return

        # ── Visuals ───────────────────────────────────────────

        # R: reset visuals (orb phases + trails + overlay ring phase)
        if key == dpg.mvKey_R:
            for orb in self._orbs:
                orb.reset()
            self._ring_phase = 0.0
            self._toast("Visuals reset")
            return

        # ` (grave/backtick): toggle sim pause
        if _KEY_GRAVE is not None and key == _KEY_GRAVE:
            self._sim_paused = not self._sim_paused
            self._toast("Sim paused" if self._sim_paused else "Sim resumed")
            return

        # ── UI ────────────────────────────────────────────────

        # H: toggle queue panel
        if key == dpg.mvKey_H:
            self._on_toggle_queue()
            return

        # Escape: close queue panel if open, otherwise stop playback
        if key == dpg.mvKey_Escape:
            if self._queue_visible:
                self._queue_visible = False
                dpg.configure_item("queue_panel", show=False)
            else:
                self._on_stop()
            return


def _format_time(seconds):
    """Format seconds as M:SS."""
    if seconds <= 0:
        return "0:00"
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"
