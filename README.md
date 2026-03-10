# Auralprint (Build 113 / v0.1.13)

Auralprint is an **audio analyzer first** and an expressive visual system second. It turns physically grounded signal analysis into visual output without pretending visuals are the analysis itself.

## Executive Summary

Auralprint processes audio as a time-varying pressure signal represented digitally as PCM samples. Analysis views (waveform, level, spectrum, spectrogram, stereo correlation) each reveal different truths and have specific failure modes. Any future architecture must preserve this distinction:

1. **Physical reality**: sound pressure over time.
2. **Engineering representation**: sampled, quantized digital signals with finite precision.
3. **Implementation choice**: analyzer parameters, smoothing, window size, meter ballistics, rendering style.

The system should remain explicit about what is measured, how it is measured, and with what assumptions.

## Core Concepts (Briefing for Engineering Readiness)

### 1) What audio is in engineering terms

- **Physically grounded fact**: Audible sound is air pressure variation over time.
- Key dimensions:
  - **Time**: when pressure changes occur.
  - **Amplitude**: magnitude of pressure deviation.
  - **Frequency**: cycles per second for periodic components.
  - **Phase**: relative timing/alignment between components/signals.
- **Periodic vs non-periodic**:
  - Periodic signals repeat (e.g., near-sinusoidal tones).
  - Non-periodic signals do not (speech, percussion, noise-like content).
- **Harmonics / overtones**:
  - Harmonics are integer multiples of a fundamental frequency.
  - Overtones are frequencies above the fundamental (not always integer multiples).
- **Noise** is broadband/random-like energy.
- **Transients** are rapid, short-lived events (attacks, clicks), often wideband.

### 2) How digital audio represents sound

- **PCM**: sequence of sample values at regular intervals.
- **Sample rate** (Hz): samples per second (time precision and max analyzable band).
- **Bit depth**: quantization precision per sample (noise floor/dynamic range implications).
- **Channels**: independent streams (mono, stereo L/R, multichannel).
- **Quantization**: mapping continuous amplitude to discrete levels (introduces quantization error).
- **Clipping**: signal exceeds representable range (hard distortion, lost peaks).
- **Dynamic range**: span between noise floor and maximum level.
- **Stereo center** (engineering convention): often approximated by L+R summation (and side by L−R).

### 3) Time-domain vs frequency-domain thinking

- **Waveform view**: sample amplitude over time (good for transients, clipping, envelope shape).
- **Peaks vs RMS/energy**:
  - Peak captures instantaneous extremes.
  - RMS/energy better tracks sustained power.
- **FFT (simplified)**: estimates frequency content over a finite time window.
- **Spectral bins**: discrete frequency buckets determined by FFT size and sample rate.
- **Windowing**: tapers frame edges to reduce leakage (implementation choice with tradeoffs).
- **Smoothing**: stabilizes display but can hide dynamics.
- **Dominant regions**: useful shorthand, but context-dependent.
- Frequency analysis is always **approximate and parameter-dependent** (window size/type, hop size, smoothing, averaging).

### 4) Practical concepts for analysis tools

- **Nyquist**: highest representable frequency is sampleRate/2.
- **Aliasing**: higher-frequency content folding into lower bands when undersampled.
- **Latency vs buffer size**:
  - Smaller buffer: lower latency, higher CPU risk.
  - Larger buffer: more stability, higher latency.
- **Time vs frequency resolution** tradeoff:
  - Short windows resolve time better, frequency worse.
  - Long windows resolve frequency better, time worse.
- **Phase relationships** affect stereo image and mono compatibility.
- **Stereo correlation** indicates similarity/opposition between channels.
- **Silence detection** should account for noise floor and hysteresis, not strict zero.
- **Onset/transient behavior** needs fast attack and carefully chosen release constants.
- **dB / dBFS**:
  - dB is logarithmic ratio.
  - dBFS references full-scale digital max.
  - Linear amplitude is not perceptually linear.

### 5) Human hearing vs math

- **Psychoacoustics (practical)**: perceived loudness varies by frequency and context.
- Equal numeric energy does not imply equal perceived loudness.
- Log-spaced frequency groupings often map better to perception than linear bins.
- Raw FFT bins are rarely directly meaningful UX; aggregation/scaling/context are needed.

### 6) Common analysis views and limitations

- **Waveform**: timing/transients/clipping clues; poor for detailed spectral balance.
- **Level meter**: loudness trend and headroom; can hide crest factor/frequency shifts.
- **Spectrum / band energies**: tonal balance snapshot; time detail and phase mostly hidden.
- **Spectrogram**: time-frequency evolution; absolute phase and stereo geometry hidden.
- **Stereo image/correlation**: width/mono-compatibility hints; not a full mix diagnosis.
- **Oscilloscope-style L/R/Lissajous**: phase and symmetry cues; easy to misread without scaling context.

### 7) Audio pipeline thinking

Canonical conceptual flow:

`source -> decode/input -> playback -> analysis taps -> transforms -> render/export`

- **Offline playback** (file-driven) and **live input** (mic/stream) have different clocking/permission/lifecycle constraints.
- **Analysis path vs playback path** should be conceptually separate:
  - playback must remain stable/low-latency;
  - analysis may run multiple views, smoothing, and feature extraction.
- Cleanup concerns: detach handlers, stop tracks/streams, release URLs/resources, avoid stale analyzers.

### 8) Recording / capture concepts

- Recording rendered output means encoding the visual session (and optionally audio) into a media stream.
- Distinguish:
  - **source audio** (input media),
  - **monitored audio** (what user hears),
  - **captured/exported output** (what gets encoded).
- Sync concerns: audio and visual clocks may drift unless capture path and timestamps are handled intentionally.
- **Container vs codec vs format** are distinct:
  - container (e.g., WebM/MP4),
  - codec (e.g., VP9/H.264/AAC/Opus),
  - file extension is not proof of codec compatibility.

### 9) Common failure modes and traps

- Clipping hidden by post-smoothing visuals.
- Misleading meters (e.g., peak-only presented as loudness).
- “Pretty but dishonest” graphics disconnected from measured data.
- Stale analyzers after source switch.
- Wrong stereo assumptions (L+R always “better”).
- Excessive smoothing masking transients.
- Over-trusting dominant-band logic as semantic truth.
- Real-time performance traps: overdraw, oversized FFT, unnecessary allocations in render loops.

### 10) Design implications (pre-architecture)

- **Configurable**: FFT size/window, smoothing constants, meter ballistics, dB ranges, silence threshold, recording settings.
- **Measured explicitly**: CPU cost, frame time, analyzer latency, dropped frames, clipping events, peak/RMS history.
- **Separate modules**: input/decode, transport/playback, analysis engine, visualization mapping, capture/export, preset/runtime state.
- **First-class interfaces**: signal frame contract, analysis frame contract, transport state, recorder lifecycle, settings schema.
- **Runtime-only vs preset-worthy**:
  - runtime-only: active queue, permissions, temporary capture session IDs.
  - preset-worthy: analyzer/display tunings that define reproducible behavior.
- **Must be documented**: units, ranges, defaults, update rates, averaging windows, and whether metrics are instantaneous or integrated.

## Product Description

Auralprint is a modular web application for audio playback/analysis/recording where visual output is driven by explicit, inspectable signal analysis.

## Non-goals (Build 113)

- No claim of mastering-grade loudness compliance metering.
- No AI tagging or semantic “music understanding.”
- No network/CDN runtime dependencies.
- No replacement of analysis truth with purely decorative animation.

## User Flows (Build 113)

1. Load one or more local audio files.
2. Play/pause, scrub, and navigate queue (prev/next enabled only when queue length >= 2).
3. Observe analyzer-driven visual session.
4. Start recording (MediaRecorder), monitor status/time, stop recording.
5. Download captured output.

## Architecture Principles (Constitution)

- Interfaces are stable contracts; modules can evolve.
- No hidden state/variables/magic numbers.
- Behavior-affecting controls must be exposed via UX or documented as code-only with rationale.
- Prefer readable, composable, testable modules.
- Zero runtime network dependency; all assets local.
- Must run hosted and offline from `file://` distributable package.

## Run Modes

### Hosted (static host)

- Serve `dist/` on any static host.
- Ensure all assets are referenced locally (no CDN).

### Offline (`file://`)

- Use packaged `portable/` artifact.
- Open `portable/index.html` directly in a browser.
- Behavior must not require local HTTP server.
- Packaging parity note: `portable/index.html` is expected to expose the same runtime UI shell surface as hosted `dist/index.html` (including Build 112 queue/scrubber controls and Build 113 recording controls), with only local relative assets/modules for offline execution.

## Build 113 Definition of Done (verifiable)

- [ ] Build 112 baseline behaviors still pass:
  - [ ] No double-advance on track end (no accumulating `ended` handlers).
  - [ ] No-audio state remains clean.
  - [ ] Switching tracks resets trails and scrubber state.
  - [ ] Prev/Next disabled unless queue length >= 2.
- [ ] Recording controls exist: Start/Stop + visible status/timer.
- [ ] Capture uses WebM as canonical output; MP4 only if browser support is confirmed.
- [ ] Recorded file downloads successfully and is playable.
- [ ] Recording start/stop performs cleanup (stopped tracks/streams, revoked object URLs where applicable).
- [ ] Playback/analysis continue behaving correctly before/during/after recording.
- [ ] No major FPS collapse at sane defaults (document tested defaults and observed range).

## Release 3 pre-tag step (required)

Immediately before tagging `v0.1.13` / Release 3:

1. Regenerate hosted output from current source: `npm run build`.
2. Verify source-to-dist parity for key Build 113 contract files: `npm run check:dist-contracts`.
3. Only tag if both commands pass without mismatches.

## Proposed Repository Layout (Build 113-ready, future-proof for 114–120)

```text
/
  README.md
  roadmap.md
  docs/
    engineering/
      audio-briefing.md
      measurement-definitions.md
    builds/
      build-113-dod.md
  src/
    app/
      bootstrap/
      lifecycle/
    domain/
      transport/
      queue/
      analysis/
      visualization/
      recording/
      presets/
    io/
      decode/
      playback/
      capture/
      export/
    ui/
      controls/
      panels/
      status/
    shared/
      constants/
      types/
      utils/
  public/
    assets/
  dist/        # hosted output
  portable/    # file:// package output
  releases/
    Release_3_v0.1.13/
```

## Practical Engineering Takeaways

- Always state analyzer parameters next to outputs.
- Treat display smoothing as interpretation, not source truth.
- Keep playback reliability independent from visualization complexity.
- Log and expose lifecycle transitions for source switch and recording state.

## Vocabulary / Glossary

- **PCM**: Pulse-code modulation sample representation.
- **dBFS**: Decibels relative to full-scale digital amplitude.
- **FFT**: Discrete transform estimating frequency content in a finite window.
- **Nyquist**: Half sample rate; theoretical max representable frequency.
- **Aliasing**: Folded spectral artifacts from undersampling.
- **RMS**: Root-mean-square level metric approximating signal power.
- **Transient**: Fast, short-duration signal event.
- **Correlation**: Similarity measure between stereo channels.

## What This Means for Software Design

- Build the analyzer as a measurable subsystem with explicit contracts.
- Treat visualization as a consumer of analysis frames, not a source of truth.
- Keep runtime operational state separate from persistent presets.
- Make lifecycle teardown a first-class concern from day one.

## Common Wrong Assumptions

- “If it looks responsive, analysis must be accurate.” (False)
- “Dominant frequency equals perceived pitch/loudness.” (Often false)
- “Stereo width implies quality.” (Context-dependent)
- “MP4 extension guarantees compatibility.” (False: codec/container mismatch common)
- “Smoothing improves accuracy.” (It improves readability, can reduce fidelity)

## Audio Engineering Readiness Check

Minimum concepts understood well enough to move into architecture work:

- Sound as pressure-over-time; frequency/amplitude/phase/time relationship.
- PCM fundamentals: sample rate, bit depth, channels, clipping, quantization.
- Time-domain vs frequency-domain interpretations and limits.
- FFT/window/smoothing tradeoffs and parameter dependence.
- Nyquist/aliasing, latency/buffer interactions, and resolution tradeoff.
- dB/dBFS and linear vs logarithmic representation implications.
- Psychoacoustic caveats: numeric energy ≠ perceived loudness.
- Practical role/limits of waveform, meters, spectrum, spectrogram, stereo views.
- Pipeline separation: source/playback/analysis/render/capture lifecycles.
- Recording distinctions: source vs monitored vs exported media.
- Common analyzer and real-time performance failure modes.
