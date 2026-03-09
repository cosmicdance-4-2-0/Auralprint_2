# Auralprint System Map (Build 113 Canonical)

This document defines the canonical runtime map for Build 113 scaffolding and forward-compatible boundaries for Builds 114–116.

## Scope and constraints

- Analyzer-first system: visual output is downstream of measured audio data.
- Interfaces are canonical; module internals are replaceable.
- No hidden control paths: every behavior-affecting value has an explicit owner.

## Module graph (text diagram)

```text
┌────────────────────┐
│       Config       │  (defaults, limits, static constants)
└─────────┬──────────┘
          │ provides defaults/limits
┌─────────▼──────────┐       user actions       ┌────────────────────┐
│     Preferences    │◄────────────────────────►│         UI         │
│ (validated values) │                          │ (panels/controls)  │
└─────────┬──────────┘                          └─────────┬──────────┘
          │ runtime snapshot                               │ commands/events
┌─────────▼──────────┐                                     │
│  Runtime Settings  │ (derived immutable frame config)    │
└──────┬──────┬──────┘                                     │
       │      │                                            │
       │      └──────────────────────────────┐             │
       │                                     │             │
┌──────▼─────────────┐   playback/taps   ┌───▼──────────┐  │
│      Playlist      │──────────────────►│  AudioEngine │◄─┘
│ (queue semantics)  │                   │ + Scrubber   │
└────────────────────┘                   └────┬──────────┘
                                              │ analysis frames
                                      ┌───────▼──────────┐
                                      │     BandBank     │
                                      │ 256 bands + dom. │
                                      └───────┬──────────┘
                                              │ band metrics
                                      ┌───────▼──────────┐
                                      │       Sim        │
                                      │ orbs + trails    │
                                      └───────┬──────────┘
                                              │ draw model
                                      ┌───────▼──────────┐
                                      │    Renderer      │
                                      │ canvas draw      │
                                      └───────┬──────────┘
                                              │ canvas stream
                                      ┌───────▼──────────┐
                                      │    Recording     │
                                      │ capture/export   │
                                      └──────────────────┘

Cross-cutting:
- Presets: encode/decode preference subsets (share/apply reproducible state)
- App: boot, wiring, update loop ownership, lifecycle teardown
```

## Canonical data flow

Required primary flow:

`UI -> Preferences -> Runtime Settings -> AudioEngine -> AnalysisEngine(BandBank) -> VisualizationEngine(Sim+Renderer) -> Recording`

Expanded with concrete modules:

1. **UI** emits user intent (`changeSetting`, `play`, `seek`, `startRecording`).
2. **Preferences** validates and stores mutable user-facing settings.
3. **Runtime Settings** materializes an immutable snapshot for deterministic frame processing.
4. **AudioEngine** produces transport status and raw analysis tap frames.
5. **AnalysisEngine** orchestrates AudioEngine sampling and BandBank projection into canonical dominant-band snapshots.
6. **VisualizationEngine** orchestrates Sim step + Renderer draw for each analyzed frame.
7. **Recording** captures renderer output (and optional audio path) and exports artifacts.

## Ownership boundaries (high-level)

- UI owns no domain truth; it projects and dispatches intent.
- Preferences owns mutable setting state; runtime settings are derived snapshots.
- AudioEngine owns playback/analysis runtime connection, not UI state.
- AnalysisEngine owns analyzer orchestration + BandBank composition.
- VisualizationEngine owns Sim+Renderer orchestration per frame.
- Sim owns world state evolution, not pixel rendering.
- Renderer owns draw execution, not simulation rules.
- Recording owns capture lifecycle and artifact cleanup, not source transport.
- Controls/Panels/Status view models own UI state projection from domain snapshots.
- App + Lifecycle own composition, call ordering, and loop orchestration.

## Future extension points

### Build 114: New audio sources

Extension points:
- `AudioEngine` source adapter contract (`file`, `mic`, future stream adapters).
- `Playlist` source descriptor model (typed source kinds, capability checks).
- `App` wiring for source lifecycle/permission gating.

Compatibility rule:
- Downstream contracts (`BandBank` input frame shape) must remain stable regardless of source type.

### Build 115: Per-orb spectral + per-orb color

Extension points:
- `BandBank` enriches output with per-band/per-feature metadata for orb assignment.
- `Sim` consumes orb-level spectral payloads.
- `Renderer` consumes explicit orb color channels from sim draw model.

Compatibility rule:
- Existing dominant-band summary remains supported for fallback behavior.

### Build 116: Camera transform render != sim

Extension points:
- `Renderer` adds camera/view transform pipeline decoupled from simulation coordinates.
- `Sim` remains world-space authoritative; no camera state ownership.
- `Preferences/Runtime Settings` add camera transform controls with explicit defaults/limits.

Compatibility rule:
- Simulation stepping and recording timestamps must remain independent of camera transform changes.

## Lifecycle checkpoints

- Boot order: `Config -> Preferences -> bootstrapApplication -> bind UI/view-models -> bind AudioEngine to AnalysisEngine -> bind canvas to VisualizationEngine -> apply runtime settings -> start engines -> start lifecycle frame loop`.
- Track/source switch: reset scrubber/sim transient state where defined; prevent stale analyzers.
- Recording stop/unload: stop recorder, release streams, revoke object URLs.
- App teardown: detach listeners, cancel animation loop, release audio/capture resources.


## Canonical frame call order (Build 113 finalized)

1. `appLifecycle.startFrameLoop` triggers `runFrame` on the HUD interval.
2. `analysisEngine.tick()` samples AudioEngine and updates BandBank snapshot.
3. `statusViewModel` projects dominant-band + lifecycle simulation state.
4. `visualizationEngine.tick({ analysisFrame })` advances Sim and draws Renderer output.
5. HUD/panel presenters project view-model state to DOM.
