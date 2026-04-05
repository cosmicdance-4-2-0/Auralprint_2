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

VIEWPORT_TITLE = "Auralprint2"
VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 760

AUDIO_EXTENSIONS = "Audio (*.wav *.flac *.ogg *.mp3){.wav,.flac,.ogg,.mp3}"
ALL_EXTENSIONS = "All (*.*){.*}"

FILE_DIALOG_WIDTH = 700
FILE_DIALOG_HEIGHT = 400

SEEK_STEP_SEC = 5
SEEK_STEP_LARGE_SEC = 30


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

        self._last_rms = 0.0
        self._last_dominant = ""
        self._last_stereo = False
        self._last_time = time.perf_counter()
        self._ring_phase = 0.0
        self._sim_paused = False

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

            # Transport row
            with dpg.group(horizontal=True):
                dpg.add_button(label="Load", callback=self._on_load)
                dpg.add_button(label="Play", tag="btn_play",
                               callback=self._on_play_pause)
                dpg.add_button(label="Stop", callback=self._on_stop)
                dpg.add_button(label="<< 5s", callback=self._on_seek_back)
                dpg.add_button(label="5s >>", callback=self._on_seek_fwd)

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

            # Status
            dpg.add_text("No audio loaded.", tag="txt_status")

            # Keyboard hint
            dpg.add_text(
                "Keys: Space=play/pause  P=sim pause  R=reset visuals  "
                "\u2190/\u2192=seek \u00b15s  Shift=\u00b130s",
                color=(255, 255, 255, 100),
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

    # ── Per-frame update ──────────────────────────────────────

    def _tick(self):
        now = time.perf_counter()
        dt = now - self._last_time
        self._last_time = now
        now_sec = now

        # Poll async audio events (track ended)
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
        self._refresh_status()

    def _refresh_status(self):
        a = self._audio

        if not a.is_loaded:
            dpg.set_value("txt_status", "No audio loaded.")
            dpg.configure_item("btn_play", label="Play")
            dpg.set_value("txt_volume", f"{a.volume:.2f}")
            return

        state = "playing" if a.is_playing else "paused"
        pos = _format_time(a.position)
        dur = _format_time(a.duration)
        stereo = "stereo" if self._last_stereo else "mono-ish"
        mute_str = " [MUTED]" if a.muted else ""
        dominant = f"  \u2666 {self._last_dominant}" if self._last_dominant else ""
        sim = "  [SIM PAUSED]" if self._sim_paused else ""
        dpg.set_value(
            "txt_status",
            f"{a.filename}  [{pos} / {dur}]  ({state}){mute_str}"
            f"  {stereo}{dominant}{sim}",
        )
        dpg.configure_item("btn_play", label="Pause" if a.is_playing else "Play")
        dpg.set_value("txt_volume", f"{a.volume:.2f}")

    # ── Callbacks: transport ──────────────────────────────────

    def _on_load(self, sender=None, app_data=None):
        dpg.show_item("file_dialog")

    def _on_file_selected(self, sender, app_data):
        filepath = app_data.get("file_path_name", "") if app_data else ""
        if not filepath:
            return
        for orb in self._orbs:
            orb.reset()
        self._ring_phase = 0.0
        if self._audio.load(filepath):
            self._audio.play()

    def _on_play_pause(self, sender=None, app_data=None):
        if not self._audio.is_loaded:
            return
        if self._audio.is_playing:
            self._audio.pause()
        else:
            self._audio.play()

    def _on_stop(self, sender=None, app_data=None):
        self._audio.stop()

    def _on_seek_back(self, sender=None, app_data=None):
        if self._audio.is_loaded:
            self._audio.seek(self._audio.position - SEEK_STEP_SEC)

    def _on_seek_fwd(self, sender=None, app_data=None):
        if self._audio.is_loaded:
            self._audio.seek(self._audio.position + SEEK_STEP_SEC)

    # ── Callbacks: volume ─────────────────────────────────────

    def _on_volume_changed(self, sender, app_data):
        self._audio.volume = app_data

    def _on_mute_changed(self, sender, app_data):
        self._audio.muted = app_data

    # ── Callbacks: keyboard ───────────────────────────────────

    # Tags of interactive widgets that should suppress global shortcuts when active.
    _INTERACTIVE_TAGS = ("sld_volume", "chk_mute")

    def _widget_is_active(self):
        """Return True if any interactive widget has focus/is being adjusted."""
        for tag in self._INTERACTIVE_TAGS:
            try:
                if dpg.is_item_active(tag) or dpg.is_item_focused(tag):
                    return True
            except Exception:
                pass
        return False

    def _on_key_press(self, sender, app_data):
        key = app_data

        # Suppress global shortcuts when interactive widgets have focus
        if self._widget_is_active():
            return

        # Space: play/pause audio
        if key == dpg.mvKey_Spacebar:
            self._on_play_pause()
            return

        # R: reset visuals (orb phases + trails)
        if key == dpg.mvKey_R:
            for orb in self._orbs:
                orb.reset()
            self._ring_phase = 0.0
            return

        # P: pause/unpause simulation (not audio)
        if key == dpg.mvKey_P:
            self._sim_paused = not self._sim_paused
            return

        # Arrow keys: seek (Shift = large step)
        shift_held = dpg.is_key_down(dpg.mvKey_LShift) or dpg.is_key_down(dpg.mvKey_RShift)

        if key == dpg.mvKey_Right and self._audio.is_loaded:
            step = SEEK_STEP_LARGE_SEC if shift_held else SEEK_STEP_SEC
            self._audio.seek(self._audio.position + step)
            return

        if key == dpg.mvKey_Left and self._audio.is_loaded:
            step = SEEK_STEP_LARGE_SEC if shift_held else SEEK_STEP_SEC
            self._audio.seek(self._audio.position - step)
            return


def _format_time(seconds):
    """Format seconds as M:SS."""
    if seconds <= 0:
        return "0:00"
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"
