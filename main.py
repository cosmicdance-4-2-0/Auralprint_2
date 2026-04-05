"""Auralprint2 v0.1.4 — Waveform Displacement

Each orb's radial position is displaced by the time-domain
waveform at its current orbital angle — sampled from the orb's
own channel (L or R). The displacement is a signed fraction of
the base radius (WF_DISP_FRAC = 0.18), so the orb breathes
outward on positive samples and inward on negative.

Combined with the overlay ring's waveform displacement (added
in v0.1.2), every visual element now responds to the raw audio
signal as well as the spectral analysis. The organic breathing
quality is complete.

Phase 2 complete: it looks and feels like Auralprint.
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
