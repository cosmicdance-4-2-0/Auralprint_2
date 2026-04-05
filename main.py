"""Auralprint2 v0.0.2 — FFT Pipeline

Real-time FFT analysis on the playing audio stream.
RMS energy computed. Raw magnitude bars rendered on the
Taichi canvas to prove the pipeline end-to-end.
"""

import taichi as ti

ti.init()  # must precede any Taichi field creation

from analysis import Analyzer
from audio import AudioEngine
from canvas import Canvas
from ui import App

CANVAS_WIDTH = 1280
CANVAS_HEIGHT = 680


def main():
    audio = AudioEngine()
    analyzer = Analyzer()
    canvas = Canvas(CANVAS_WIDTH, CANVAS_HEIGHT)
    app = App(audio, analyzer, canvas)
    app.run()


if __name__ == "__main__":
    main()
