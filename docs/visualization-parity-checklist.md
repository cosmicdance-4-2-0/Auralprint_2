# Visualization parity checklist (0.1.11 → modular engine)

Source of truth legacy sections:
- `src/0.1.11/index.html` `drawTrailLines`
- `src/0.1.11/index.html` `drawParticles`
- `src/0.1.11/index.html` `drawBandOverlay`
- `src/0.1.11/index.html` `renderFrame`

## Option mapping

| Legacy option path | Legacy behavior | New module + field path |
|---|---|---|
| `runtime.settings.visuals.backgroundColor` | Frame clear color before all draws | Renderer: `clearFrame(..., settings.visuals.backgroundColor)` |
| `runtime.settings.trace.lines` | Enables/disables trail polyline draw | Renderer: `drawTrailLines` guard on `settings.trace.lines` |
| `runtime.settings.trace.numLines` | Number of connected trail segments | Renderer: `drawTrailLines` with `neededPts = numLines + 1` |
| `runtime.settings.trace.lineAlpha` | Trail line alpha | Renderer: `drawTrailLines` `strokeStyle` alpha |
| `runtime.settings.trace.lineWidthPx` | Trail line width in px (scaled by DPR) | Renderer: `drawTrailLines` line width scaling |
| `runtime.settings.trace.lineColorMode` | Fixed / last particle / dominant band line color | Renderer: `pickLineColorRgb01` |
| `runtime.settings.particles.emitPerSecond` | Emission cadence | Simulation: per-orb `emitCarry` accumulation |
| `runtime.settings.particles.ttlSec` | Particle lifetime | Simulation: trail retention cutoff |
| `runtime.settings.particles.sizeMaxPx` | Initial particle size | Renderer: `drawParticles` size interpolation start |
| `runtime.settings.particles.sizeMinPx` | Minimum particle size | Renderer: `drawParticles` size interpolation floor |
| `runtime.settings.particles.sizeToMinSec` | Time to shrink to min size | Renderer: `drawParticles` shrink timing |
| `runtime.settings.visuals.particleColor` | Fixed particle color fallback | Renderer: `pickParticleColorRgb01` fallback |
| `runtime.settings.bands.particleColorSource` | Dominant/angle/fixed particle color source | Renderer: `pickParticleColorRgb01` |
| `runtime.settings.motion.angularSpeedRadPerSec` | Orb angular velocity | Simulation: orb angle integration |
| `runtime.settings.motion.waveformRadialDisplaceFrac` | Waveform radial displacement intensity | Simulation + Renderer overlay waveform displacement |
| `runtime.settings.audio.minRadiusFrac` | Lower bound for orbit/overlay radius mapping | Simulation + Renderer overlay radius mapping |
| `runtime.settings.audio.maxRadiusFrac` | Upper bound for orbit/overlay radius mapping | Simulation + Renderer overlay radius mapping |
| `runtime.settings.bands.overlay.enabled` | Enables/disables band overlay draw | Renderer: `drawBandOverlay` guard |
| `runtime.settings.bands.overlay.connectAdjacent` | Draw line segments between adjacent overlay points | Renderer: `drawBandOverlay` adjacency path |
| `runtime.settings.bands.overlay.lineAlpha` | Overlay line alpha | Renderer: `drawBandOverlay` line color alpha |
| `runtime.settings.bands.overlay.lineWidthPx` | Overlay line width in px (scaled by DPR) | Renderer: `drawBandOverlay` line width |
| `runtime.settings.bands.overlay.alpha` | Overlay point alpha | Renderer: `drawBandOverlay` point fill alpha |
| `runtime.settings.bands.overlay.pointSizePx` | Overlay point size in px (scaled by DPR) | Renderer: `drawBandOverlay` point radius |
| `runtime.settings.bands.overlay.phaseMode` | `orb` follows orb angle, `free` integrates own phase | Simulation: ring phase mode selection |
| `runtime.settings.bands.overlay.ringSpeedRadPerSec` | Free mode ring angular speed | Simulation: ring phase integration |
| `runtime.settings.bands.rainbow.hueOffsetDeg` | Global rainbow hue offset | Renderer: `bandRgb01` and angle-color path |
| `runtime.settings.bands.rainbow.saturation` | Rainbow saturation | Renderer: `bandRgb01` |
| `runtime.settings.bands.rainbow.value` | Rainbow value/brightness | Renderer: `bandRgb01` |
| `runtime.settings.bands.count` | Overlay point count | Renderer: `drawBandOverlay` point loop length |
| `runtime.settings.timing.maxDeltaTimeSec` | dt cap for stability | Simulation: dt clamp |
| `runtime.settings.orbs[*]` (`chanId`, `chirality`, `startAngleRad`) | Orb channel ownership + spin direction + initial phase | Simulation: orb state configure/reset |

## Analyzer-first parity notes

- Orb radius uses analyzer-derived channel energy (`analysisFrame.channels[chanId].energy01` with center fallback).
- Orb radial displacement samples analyzer waveform (`analysisFrame.channels[chanId].waveform` / center fallback).
- Overlay geometry consumes analyzed band energies (`analysisFrame.bands.energies01`) and center waveform when available.
- Dominant-band color modes consume `analysisFrame.bands.dominant.index`.
