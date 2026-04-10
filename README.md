
## Auralprint2 Roadmap: v0.0.1 → v1.0.0

With the move to Python (Taichi for GPU rendering, DearPyGui for UI, sounddevice/soundfile for audio I/O, scipy/pyfftw for FFT), we shed all browser constraints and gain: GPU shaders, real threading, direct hardware audio access, arbitrary FFT implementations, and a proper application lifecycle.

### Phase 1: Foundation (v0.0.x — Proof of Life)

**v0.0.1 — Window + Canvas + Audio Playback**
Taichi canvas in a DearPyGui window. Load and play an audio file via sounddevice. Confirm audio output works. No analysis, no visuals beyond a background color.

**v0.0.2 — FFT Pipeline**
Real-time FFT analysis on the playing audio stream using pyfftw or scipy. Compute RMS energy. Display raw FFT magnitude as a simple bar graph or line plot on the Taichi canvas to prove the pipeline works end-to-end.

**v0.0.3 — BandBank Port**
Port the 256-band logarithmic decomposition. Compute per-band energies from FFT data. Display a simple band energy visualization (colored bars or dots). Confirm dominant-band tracking works.

### Phase 2: Core Visuals (v0.1.x — The Orb Returns)

**v0.1.0 — Single Orb**
One orb orbiting the center, radius driven by RMS energy, emitting particles with TTL and size decay. Trail lines. Background color. This is the minimal "it looks like Auralprint" milestone.

**v0.1.1 — Stereo Orbs + Mono Detection**
L/R/C analysis channels. Two orbs with independent channel targeting. Mono-ish detection with adaptive center mixing. Cross-correlation on time-domain data.

**v0.1.2 — Band Overlay Ring**
256-point spectral ring. Rainbow palette with HSV controls. Phase modes (orb-locked, free rotation). Waveform displacement on the ring.

**v0.1.3 — Color System**
Particle color sources (fixed, dominant, angle/glitch). Line color modes. Full ColorPolicy port.

**v0.1.4 — Waveform Displacement**
Time-domain waveform samples modulating orb radial position. Overlay ring displacement. The organic breathing quality.

### Phase 3: Player Features (v0.2.x — Full Jukebox)

**v0.2.0 — Transport Controls**
Play, pause, stop, seek. Volume and mute. DearPyGui control panel.

**v0.2.1 — Scrubber**
Waveform overview with playhead. Click/drag seeking. Async waveform decode (can use scipy directly instead of OfflineAudioContext).

**v0.2.2 — Queue / Playlist**
Multi-file load, next/prev, click-to-jump, remove, clear, shuffle. Drag-and-drop file loading. Auto-advance with repeat modes (none/one/all).

**v0.2.3 — Keyboard Shortcuts**
Space (pause sim), H (toggle panels), R (reset visuals), N/P (tracks), arrows (seek).

### Phase 4: Configuration & Sharing (v0.3.x — Make It Yours)

**v0.3.0 — Preferences System**
Immutable defaults + mutable preferences + resolved settings. All parameters bounded by limits. Deep clone, deep freeze.

**v0.3.1 — Preset Serialization** ✅ CURRENT
Export/import JSON preset files. Schema versioning with migration support.

**v0.3.2 — Full Config UI**
DearPyGui panels for trace, particles, motion, audio analysis, colors, band overlay, rainbow palette. Every parameter from the original exposed and controllable.

**v0.3.3 — Band HUD**
256-row energy display with names, frequency ranges, dominant highlighting. Throttled refresh. Hideable.

### Phase 5: Beyond the Original (v0.4.x–v0.9.x)

**v0.4.x — Recording / Export**
Capture Taichi canvas to video (imageio/moviepy). WebM/MP4. Configurable FPS. Optional audio mux. This was Build 113's unfinished goal.

**v0.5.x — Live Input Sources**
Microphone input via sounddevice. System audio capture where supported. Source switching UI. Permission/error handling.

**v0.6.x — Per-Orb Band Picker**
UI for assigning specific bands or band ranges to each orb. Named band sets. Visual confirmation. This was Build 115/118's combined goal.

**v0.7.x — Camera System**
Separate simulation space from view transform. Pan, zoom, rotate. Camera state in presets. This was Build 116's goal.

**v0.8.x — 3D Mode**
Taichi's native 3D support: orb rotation axes, perspective projection, depth. 2D mode as stable fallback. This was Build 120's aspirational goal, now achievable with GPU shaders.

**v0.9.x — GPU Particle System**
Migrate the particle system to Taichi fields for massively parallel update and rendering. Thousands to millions of particles at interactive framerates. This was never on the original roadmap — it's what Python + Taichi makes possible that the browser never could.
