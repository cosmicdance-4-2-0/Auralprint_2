"""Auralprint2 v0.3.0 — Preferences System

Immutable CONFIG with all defaults and limits across the entire
application. Mutable Preferences class cloned from CONFIG.defaults.
All parameters bounded by CONFIG.limits. Cross-field constraints
enforced (sizeMin <= sizeMax, TTL >= decay).

CONFIG structure:
    defaults.visuals      — background_color, particle_color
    defaults.trace        — lines, num_lines, line_alpha, line_color_mode
    defaults.particles    — emit rate, sizes, TTL, overlap
    defaults.motion       — angular speed, waveform displacement
    defaults.audio        — FFT size, RMS gain, radius fracs, volume, mute, repeat
    defaults.bands        — spacing, overlay (11 params), rainbow (3 params), color source
    defaults.orbs         — per-orb channel, chirality, start angle
    defaults.timing       — max dt cap

    limits.*              — min/max/step for every numeric parameter

Preferences.set(path, value) clamps to limits automatically.
Preferences.snapshot() returns a deep-cloned dict.
resolve(prefs) produces the settings dict for module consumption.

Phase 4 begins: the knobs have a home.
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
