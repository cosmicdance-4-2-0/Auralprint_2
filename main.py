"""Auralprint2 v0.2.0 — Transport Controls

Full playback transport: play, pause, stop, seek.
Volume slider and mute toggle.
Analysis continues through mute (visuals stay alive).
End-of-track detection via main-thread polling.

Keyboard shortcuts:
    Space       — play/pause audio
    P           — pause/unpause simulation (audio continues)
    R           — reset visuals (orb phases + trails)
    Left/Right  — seek ±5s
    Shift+L/R   — seek ±30s

Phase 3 begins: building toward a daily-driver media player.
"""

import math

import taichi as ti

ti.init()  # must precede any Taichi field creation

from analysis import Analyzer
from audio import AudioEngine
from bands import BandBank
from canvas import Canvas
from orb import Orb
from ui import App

CANVAS_WIDTH = 1280
CANVAS_HEIGHT = 680

BAND_SPACING = "hybrid"  # "log" | "mel" | "bark" | "hybrid"


def main():
    audio = AudioEngine()
    analyzer = Analyzer()
    bandbank = BandBank(spacing=BAND_SPACING)
    canvas = Canvas(CANVAS_WIDTH, CANVAS_HEIGHT)

    orbs = [
        Orb(CANVAS_WIDTH, CANVAS_HEIGHT, channel="R", chirality=-1, start_angle=0.0),
        Orb(CANVAS_WIDTH, CANVAS_HEIGHT, channel="L", chirality=-1, start_angle=math.pi),
    ]

    app = App(audio, analyzer, bandbank, canvas, orbs)
    app.run()


if __name__ == "__main__":
    main()
