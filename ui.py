"""DearPyGui application shell — window, controls, render loop.

Interface (stable):
    run()  — blocking; returns when the window closes
"""

import dearpygui.dearpygui as dpg

VIEWPORT_TITLE = "Auralprint2"
VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 760

AUDIO_EXTENSIONS = "Audio (*.wav *.flac *.ogg *.mp3){.wav,.flac,.ogg,.mp3}"
ALL_EXTENSIONS = "All (*.*){.*}"

FILE_DIALOG_WIDTH = 700
FILE_DIALOG_HEIGHT = 400


class App:

    def __init__(self, audio, analyzer, canvas):
        self._audio = audio
        self._analyzer = analyzer
        self._canvas = canvas
        self._texture_tag = None
        self._last_rms = 0.0

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

            with dpg.group(horizontal=True):
                dpg.add_button(label="Load", callback=self._on_load)
                dpg.add_button(
                    label="Play", tag="btn_play", callback=self._on_play_pause
                )
                dpg.add_button(label="Stop", callback=self._on_stop)
                dpg.add_text("No audio loaded.", tag="txt_status")

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

    # ── Per-frame update ──────────────────────────────────────

    def _tick(self):
        samples = self._audio.get_samples(self._analyzer.fft_size)
        result = self._analyzer.process(samples)

        if result is not None:
            self._last_rms = result.rms

        self._canvas.render(result)
        dpg.set_value(self._texture_tag, self._canvas.frame_data())
        self._refresh_status()

    def _refresh_status(self):
        a = self._audio

        if not a.is_loaded:
            dpg.set_value("txt_status", "No audio loaded.")
            dpg.configure_item("btn_play", label="Play")
            return

        state = "playing" if a.is_playing else "paused"
        pos = _format_time(a.position)
        dur = _format_time(a.duration)
        rms = f"  RMS: {self._last_rms:.4f}"
        dpg.set_value("txt_status", f"{a.filename}  [{pos} / {dur}]  ({state}){rms}")
        dpg.configure_item("btn_play", label="Pause" if a.is_playing else "Play")

    # ── Callbacks ─────────────────────────────────────────────

    def _on_load(self, sender=None, app_data=None):
        dpg.show_item("file_dialog")

    def _on_file_selected(self, sender, app_data):
        filepath = app_data.get("file_path_name", "") if app_data else ""
        if not filepath:
            return
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


def _format_time(seconds):
    """Format seconds as M:SS."""
    if seconds <= 0:
        return "0:00"
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"
