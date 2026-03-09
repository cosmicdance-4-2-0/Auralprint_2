# Interface Contracts (Build 113 Canonical)

This file defines module contracts only (no implementation). Each section specifies purpose, I/O, API signatures, events, and state ownership.

---

## 1) Config (defaults/limits)

### Purpose
Single source of static defaults, limits, and named constants used across modules.

### Inputs / outputs
- **Inputs:** none at runtime (static data).
- **Outputs:** immutable config objects (defaults, min/max ranges, enums).

### Public API (signatures)
- `getConfig(): AppConfig`
- `getLimits(): LimitsConfig`
- `getBuildInfo(): BuildInfo`

### Events emitted / consumed
- **Emits:** none.
- **Consumes:** none.

### State owned
- **Owns:** static constants/version metadata.
- **Does NOT own:** mutable preferences, runtime session state.

---

## 2) Preferences (mutations + validation)

### Purpose
Store user-mutable settings with validation against Config limits.

### Inputs / outputs
- **Inputs:** user setting mutation intents.
- **Outputs:** validated preference state; validation results/errors.

### Public API (signatures)
- `createPreferencesStore(config: AppConfig): PreferencesStore`
- `getPreferences(): PreferencesState`
- `setPreference<Key extends keyof PreferencesState>(key: Key, value: PreferencesState[Key]): ValidationResult`
- `applyPatch(patch: Partial<PreferencesState>): ValidationResult`
- `resetToDefaults(): PreferencesState`

### Events emitted / consumed
- **Emits:** `preferencesChanged`, `preferencesValidationFailed`.
- **Consumes:** `uiPreferenceMutationRequested`, `presetApplied`.

### State owned
- **Owns:** mutable user preferences.
- **Does NOT own:** derived runtime frame settings, transport/playback state.

---

## 3) Presets (URL encode/decode)

### Purpose
Encode/decode preset-worthy settings for URL/state sharing.

### Inputs / outputs
- **Inputs:** current preferences or URL token.
- **Outputs:** encoded preset token / decoded preference patch.

### Public API (signatures)
- `encodePreset(preferences: PreferencesState): string`
- `decodePreset(token: string): DecodeResult<Partial<PreferencesState>>`
- `isPresetCompatible(token: string, buildInfo: BuildInfo): boolean`

### Events emitted / consumed
- **Emits:** `presetEncoded`, `presetDecoded`, `presetDecodeFailed`.
- **Consumes:** `requestPresetEncode`, `requestPresetDecode`.

### State owned
- **Owns:** no long-lived mutable runtime state (stateless transform module).
- **Does NOT own:** canonical preferences store, URL routing policy.

---

## 4) AudioEngine (file playback + analysis taps)

### Purpose
Manage source playback and expose analysis tap frames + transport timing.

### Inputs / outputs
- **Inputs:** source descriptors, transport commands, runtime analysis settings.
- **Outputs:** playback state, timing updates, analysis frame payloads.

### Public API (signatures)
- `createAudioEngine(deps: AudioEngineDeps): AudioEngine`
- `loadSource(source: AudioSourceDescriptor): Promise<void>`
- `play(): Promise<void>`
- `pause(): void`
- `seek(seconds: number): void`
- `setAnalysisConfig(config: AnalysisRuntimeSettings): void`
- `getTransportState(): TransportState`
- `getLatestAnalysisFrame(): AnalysisFrame | null`
- `dispose(): Promise<void>`

### Events emitted / consumed
- **Emits:** `audioReady`, `audioEnded`, `audioError`, `transportStateChanged`, `analysisFrameReady`.
- **Consumes:** `playlistItemSelected`, `transportPlayRequested`, `transportPauseRequested`, `scrubRequested`.

### State owned
- **Owns:** audio context handles, source node graph, playback timing cache.
- **Does NOT own:** queue policy, UI control enabled/disabled decisions.

---

## 5) BandBank (256 bands, dominant band)

### Purpose
Convert analysis frames to canonical 256-band representation and dominant-band summary.

### Inputs / outputs
- **Inputs:** `AnalysisFrame`, band mapping config.
- **Outputs:** `BandFrame` with exactly 256 band energies + dominant band metadata.

### Public API (signatures)
- `createBandBank(config: BandBankConfig): BandBank`
- `updateFromAnalysis(frame: AnalysisFrame): BandFrame`
- `getLatestBandFrame(): BandFrame | null`
- `reset(): void`

### Events emitted / consumed
- **Emits:** `bandFrameReady`.
- **Consumes:** `analysisFrameReady`, `runtimeSettingsChanged`.

### State owned
- **Owns:** latest normalized band frame + aggregation buffers.
- **Does NOT own:** simulation entities, renderer draw state.

---

## 6) Sim (orbs + trails)

### Purpose
Advance simulation state (orbs/trails) from band input and timing.

### Inputs / outputs
- **Inputs:** `BandFrame`, frame delta/time, sim runtime settings.
- **Outputs:** render-ready simulation snapshot (`SimFrame`).

### Public API (signatures)
- `createSim(config: SimConfig): SimEngine`
- `step(input: SimStepInput): SimFrame`
- `reset(reason: SimResetReason): void`
- `getState(): SimState`

### Events emitted / consumed
- **Emits:** `simFrameReady`, `simReset`.
- **Consumes:** `bandFrameReady`, `trackChanged`, `runtimeSettingsChanged`.

### State owned
- **Owns:** orb positions/velocities, trail buffers, sim clock accumulators.
- **Does NOT own:** canvas context, encoded recording chunks.

---

## 7) Renderer (canvas draw)

### Purpose
Render `SimFrame` to canvas deterministically using runtime render settings.

### Inputs / outputs
- **Inputs:** `SimFrame`, viewport/canvas metrics, renderer settings.
- **Outputs:** drawn frame side effects on canvas; optional draw telemetry.

### Public API (signatures)
- `createRenderer(canvas: HTMLCanvasElement, config: RendererConfig): Renderer`
- `render(frame: SimFrame, timing: RenderTiming): RenderStats`
- `resize(width: number, height: number, devicePixelRatio: number): void`
- `clear(): void`
- `dispose(): void`

### Events emitted / consumed
- **Emits:** `frameRendered`, `rendererError`.
- **Consumes:** `simFrameReady`, `viewportChanged`, `runtimeSettingsChanged`.

### State owned
- **Owns:** canvas/context handles and draw-only caches.
- **Does NOT own:** simulation truth, audio transport state.

---

## 8) UI (panels, controls, bindings)

### Purpose
Bind user inputs to intents and project domain state into controls/panels.

### Inputs / outputs
- **Inputs:** DOM events, domain state snapshots.
- **Outputs:** semantic intents/events (`playRequested`, `settingChanged`, etc.).

### Public API (signatures)
- `createUI(deps: UIDeps): UIController`
- `bind(root: HTMLElement): void`
- `render(viewModel: UIViewModel): void`
- `setControlEnabled(controlId: UIControlId, enabled: boolean): void`
- `dispose(): void`

### Events emitted / consumed
- **Emits:** `uiIntent`, `transportPlayRequested`, `transportPauseRequested`, `scrubRequested`, `recordingToggleRequested`, `uiPreferenceMutationRequested`.
- **Consumes:** `transportStateChanged`, `queueStateChanged`, `recordingStateChanged`, `statusChanged`.

### State owned
- **Owns:** ephemeral UI local state (expanded panels, focus hints).
- **Does NOT own:** authoritative transport/queue/recording domain state.

---

## 9) Playlist (queue semantics)

### Purpose
Own queue ordering and next/prev semantics (including Build 112 constraints).

### Inputs / outputs
- **Inputs:** file/source list mutations, next/prev/select commands, `audioEnded`.
- **Outputs:** active item descriptor, queue state, command eligibility.

### Public API (signatures)
- `createPlaylist(initialState?: PlaylistState): Playlist`
- `setItems(items: AudioSourceDescriptor[]): void`
- `select(index: number): PlaylistSelectionResult`
- `next(): PlaylistSelectionResult`
- `previous(): PlaylistSelectionResult`
- `getState(): PlaylistState`

### Events emitted / consumed
- **Emits:** `queueStateChanged`, `playlistSelectionChanged`.
- **Consumes:** `filesAdded`, `audioEnded`, `transportNextRequested`, `transportPreviousRequested`.

### State owned
- **Owns:** queue items, active index, derived `canNext/canPrevious`.
- **Does NOT own:** waveform cache, playback node instances.

---

## 10) Scrubber (waveform overview + seek)

### Purpose
Expose scrub UI model (position/duration/overview) and convert seeks to time commands.

### Inputs / outputs
- **Inputs:** transport timing updates, overview data, user seek interactions.
- **Outputs:** scrub view model, seek command intents.

### Public API (signatures)
- `createScrubber(config: ScrubberConfig): Scrubber`
- `setOverview(data: WaveformOverview | null): void`
- `setTransportTiming(timing: TransportTiming): void`
- `requestSeek(normalizedPosition: number): SeekRequestResult`
- `reset(reason: ScrubberResetReason): void`
- `getViewModel(): ScrubberViewModel`

### Events emitted / consumed
- **Emits:** `scrubRequested`, `scrubberStateChanged`.
- **Consumes:** `transportStateChanged`, `trackChanged`, `waveformOverviewReady`.

### State owned
- **Owns:** scrubber local model (duration, playhead, hover/drag state).
- **Does NOT own:** actual transport seek execution.

---

## 11) Recording (capture/export)

### Purpose
Manage capture lifecycle and export artifacts for Build 113 recording.

### Inputs / outputs
- **Inputs:** renderer capture stream, optional mixed audio stream, start/stop commands.
- **Outputs:** recording state, encoded blob/artifact metadata.

### Public API (signatures)
- `createRecordingController(deps: RecordingDeps): RecordingController`
- `start(options: RecordingStartOptions): Promise<RecordingStartResult>`
- `stop(): Promise<RecordingStopResult>`
- `getState(): RecordingState`
- `dispose(): Promise<void>`

### Events emitted / consumed
- **Emits:** `recordingStarted`, `recordingStopped`, `recordingDataAvailable`, `recordingError`.
- **Consumes:** `recordingToggleRequested`, `appTeardownRequested`.

### State owned
- **Owns:** MediaRecorder instance, chunk buffers, active artifact URL(s).
- **Does NOT own:** render loop scheduling, queue selection logic.

---

## 12) App (boot + loop + wiring)

### Purpose
Compose modules, enforce lifecycle order, and run/cancel main update loop.

### Inputs / outputs
- **Inputs:** module factories, config, DOM root, lifecycle events.
- **Outputs:** initialized runtime, teardown side effects, top-level status.

### Public API (signatures)
- `createApp(deps: AppDeps): AppRuntime`
- `boot(): Promise<void>`
- `startLoop(): void`
- `stopLoop(): void`
- `teardown(): Promise<void>`

### Events emitted / consumed
- **Emits:** `appBooted`, `appLoopStarted`, `appLoopStopped`, `appTeardownCompleted`, `appError`.
- **Consumes:** all module domain events via wiring layer.

### State owned
- **Owns:** composition graph, loop handle, lifecycle stage.
- **Does NOT own:** module-internal domain state.

---

## Event bus conventions (canonical)

- Events are semantic and module-agnostic (no DOM event leakage into domain).
- Event payloads are versionable objects (no positional tuple payloads).
- Every emitted event must document source module and delivery guarantees.

## Runtime-only vs preset-worthy state

- **Runtime-only:** queue contents, active recorder session, permissions, temporary URLs, current playhead.
- **Preset-worthy:** analyzer/render/sim tunables that define reproducible output behavior.

## Non-ownership rules (global)

- UI does not own analysis truth.
- Renderer does not mutate sim state.
- Sim does not own camera/render surface handles.
- Playlist does not own decoder/playback objects.
- Recording does not own transport policy.
