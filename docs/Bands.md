# Bands (Build 113 scaffold + BandBank)

## Overview

`BandBank` converts analyser frequency bins into a fixed 256-band representation for HUD and downstream simulation/render systems.

Inputs:
- analysis frame channel frequency data (`spectrumDb`)
- sample rate
- fft size
- configured band settings (`floorHz`, `ceilingHz`, `logSpacing`)

Outputs:
- `energies01[256]`
- per-band low/high Hz edges
- dominant band summary (index, name, range text)
- metadata (sample rate, nyquist, configured/effective ceiling)

## Band edge math

- Nyquist is `sampleRate * 0.5`.
- Effective ceiling is `min(configuredCeilingHz, nyquistHz)`.
- Floor is clamped so floor < effective ceiling.
- Edge generation:
  - log spacing: geometric progression between floor and effective ceiling
  - linear spacing: equal-width segments

With 256 bands, this produces 257 edges and 256 intervals.

## FFT bin mapping

- Bin resolution is `binHz = sampleRate / fftSize`.
- For each band:
  - `binStart = floor(lowHz / binHz)`
  - `binEndExclusive = ceil(highHz / binHz)`
  - at least one bin is guaranteed per band (`end >= start + 1`)

## Energy mapping

Per bin dB is normalized to 0..1:

`normalized = clamp((db - dbMin) / (dbMax - dbMin), 0, 1)`

Band energy is the average normalized value over bins in that band.

This keeps the output explicit and stable:
- no hidden weighting
- no nonlinear post curve beyond analyzer dB normalization

## Dominant band

Dominant band is the highest `energy01` index.

BandBank exposes:
- dominant index
- dominant display name
- dominant Hz range text (`low–high Hz`)

## Name table

`src/bands/bandNames.ts` contains a complete 256-name table.
Names are fixed and indexed 0..255.

## Update cadence

HUD updates run on a fixed interval (`100ms`, ~10Hz) and only while the spectral HUD panel is visible.

Rationale:
- keep UI work bounded
- avoid unnecessary DOM/canvas churn when hidden
- preserve analyzer fidelity while keeping panel cost predictable
