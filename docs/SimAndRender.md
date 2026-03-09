# Sim + Render Invariants (Build 113 Canonical)

## App-level action contracts

The app runtime defines explicit action entry points for high-level events:

- `onAudioLoaded`
- `onPrefsApplied`
- `onHashApplied`
- `onStop`

These actions are the canonical place to apply sim-reset policy.

## Sim reset policy by action

- `onAudioLoaded`
  - Applies runtime preferences.
  - Resets trails only (`trailSystem.reset()`).
  - Preserves orb phase continuity (`orbSystem.reset()` is **not** called).

- `onPrefsApplied`
  - Applies runtime preferences.
  - Accepts explicit reset options:
    - `resetOrbs`
    - `resetTrails`
  - Applies only the requested reset scope.

- `onHashApplied`
  - Treated as a fresh sim baseline.
  - Rebuilds affected band-bank definition state.
  - Resets both orbs and trails (`orbSystem.reset()` + `trailSystem.reset()`).

- `onStop`
  - Stops/rewinds transport playback only.
  - Does **not** reset orb phase or trails.

## Band-bank rebuild invariants

Band-bank rebuild must run when analysis/band definition changes alter band mapping assumptions:

- FFT size changes (`audio.fftSize`).
- Band-definition changes, when definition-change rebuilding is enabled:
  - `bands.count`
  - `bands.floorHz`
  - `bands.ceilingHz`
  - `bands.logSpacing`

This guarantees band edges and bin mapping remain synchronized with runtime analysis settings.
