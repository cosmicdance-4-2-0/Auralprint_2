"""Auralprint2 v0.1.3 — Color System

Particle color sources: fixed, dominant band, angle (glitch mode).
Line color modes: fixed, last particle, dominant band.
All color derivation via ColorPolicy module.

Change PARTICLE_COLOR_MODE in colors.py to switch:
  "fixed"    — white particles (or whatever FIXED_PARTICLE_COLOR is set to).
  "dominant" — particles take the color of the loudest band.
  "angle"    — particles take the color of the band at their birth angle.
               Each particle is colored independently. Rainbow trails.

Change LINE_COLOR_MODE in colors.py to switch:
  "fixed"         — trail lines match the fixed particle color.
  "lastParticle"  — trail lines match the newest particle's color.
  "dominantBand"  — trail lines match the dominant band's color.

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
