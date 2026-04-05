"""Auralprint2 v0.1.2 — Band Overlay Ring

256-point spectral contour ring. Rainbow-colored, energy-driven
radii, waveform displacement, independent phase rotation.
Layered behind the stereo orb pair.

Band spacing: hybrid (ERB).
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
