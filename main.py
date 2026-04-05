"""Auralprint2 v0.2.1 — Scrubber

Waveform overview bar with click/drag seeking.
Async waveform decode runs in a background thread —
playback starts immediately, waveform appears when ready.
Explicit visual states: empty, decoding, ready, unavailable.

The scrubber is a self-contained module that owns its own
DearPyGui drawlist and mouse interaction. Relocatable when
the panel system arrives.
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
