"""Auralprint2 v0.2.2 — Queue / Playlist

Multi-file load, queue panel, track navigation.
Click-to-jump, remove, clear, shuffle (Fisher-Yates).
Auto-advance on track end with repeat modes (none/one/all).
N/P keyboard shortcuts for next/prev track.

v0.2.0a keyboard fix included: scrubber_dl removed from
_INTERACTIVE_TAGS — drawlists hold focus permanently, which
was suppressing all shortcuts after first scrubber click.
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
