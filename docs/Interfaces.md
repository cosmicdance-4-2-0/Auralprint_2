# Interfaces (Build 113 Scaffold)

This document defines canonical module boundaries for Build 113 scaffolding. Bodies are placeholders by design; signatures and responsibilities are the contract.

## App Layer

### `app/lifecycle/appLifecycle.createAppLifecycle()`
**Responsibility:** Own high-level application lifecycle state and teardown.

**Public API:**
- `createAppLifecycle(): { state: string, start(): void, stop(): void }`

### `app/bootstrap/bootstrapApplication.bootstrapApplication({ appLifecycle })`
**Responsibility:** Compose modules and perform deterministic startup.

**Public API:**
- `bootstrapApplication({ appLifecycle }): { statusMessage: string, modules: object }`

## Domain Layer

### `domain/transport/transportController.createTransportController()`
**Responsibility:** Playback transport commands and state.

**Public API:**
- `loadSource(sourceDescriptor): void`
- `play(): void`
- `pause(): void`
- `seek(seconds): void`
- `getState(): { playbackState: string }`

### `domain/queue/queueController.createQueueController()`
**Responsibility:** Queue ordering, active item, and next/prev transitions.

**Public API:**
- `setItems(items): void`
- `next(): void`
- `previous(): void`
- `getQueueState(): { length: number, activeIndex: number }`

### `domain/analysis/analysisEngine.createAnalysisEngine()`
**Responsibility:** Produce analysis frames from source/playback taps.

**Public API:**
- `configure(config): void`
- `start(): void`
- `stop(): void`
- `getLatestFrame(): object | null`

### `domain/visualization/visualizationEngine.createVisualizationEngine()`
**Responsibility:** Transform analysis frames into render-ready model state.

**Public API:**
- `configure(config): void`
- `update(analysisFrame): void`
- `reset(): void`

### `domain/recording/recordingController.createRecordingController()`
**Responsibility:** Recording state machine for MediaRecorder lifecycle.

**Public API:**
- `startRecording(options): void`
- `stopRecording(): void`
- `getRecordingState(): { status: string }`

### `domain/presets/presetStore.createPresetStore()`
**Responsibility:** Persist and retrieve preset-worthy settings.

**Public API:**
- `loadPreset(presetId): object | null`
- `savePreset(preset): void`
- `listPresets(): Array<object>`

## IO Layer

### `io/decode/decodeGateway.createDecodeGateway()`
**Responsibility:** Decode local source files into usable audio payloads.

**Public API:**
- `decodeFile(file): Promise<object> | void`
- `clear(): void`

### `io/playback/playbackGateway.createPlaybackGateway()`
**Responsibility:** Bridge domain transport to playback runtime.

**Public API:**
- `connect(source): void`
- `disconnect(): void`
- `getTiming(): { currentTimeSeconds: number }`

### `io/capture/captureGateway.createCaptureGateway()`
**Responsibility:** Create/release capture streams for recording.

**Public API:**
- `createCaptureStream(options): object | null`
- `releaseCaptureStream(): void`

### `io/export/exportGateway.createExportGateway()`
**Responsibility:** Produce downloadable media artifacts and cleanup URLs.

**Public API:**
- `createDownloadableArtifact(payload): { url: string, filename: string } | null`
- `revokeArtifact(url): void`

## UI Layer

### `ui/controls/controlsViewModel.createControlsViewModel()`
**Responsibility:** Project control availability for play/scrub/record UX.

**Public API:**
- `getState(): { canPlay: boolean, canRecord: boolean }`

### `ui/panels/panelsViewModel.createPanelsViewModel()`
**Responsibility:** Project analyzer panel visibility/state.

**Public API:**
- `getState(): { activePanel: string }`

### `ui/status/statusViewModel.createStatusViewModel()`
**Responsibility:** Project global status and errors for display.

**Public API:**
- `getState(): { statusText: string }`

## Shared Modules

### `shared/constants/build.BUILD_IDENTIFIER`
**Responsibility:** Version/build identifier constant.

### `shared/types/contracts.CONTRACTS_PLACEHOLDER`
**Responsibility:** Placeholder export for future shared contract type definitions.

### `shared/utils/noop.noop()`
**Responsibility:** Explicit named no-op helper.
