# UI Contract (DOM + CSS Shell)

## Scope
This contract defines the static UI shell only:
- HTML structure and regions
- CSS layout and responsive behavior
- Stable element IDs for future bindings

No business logic is implemented in this layer.

## Overall layout summary
- `#render-surface-canvas` is a full-viewport render surface and remains the primary visual element.
- Overlay panels provide controls and status regions.
- Bottom stack includes scrubber and audio controls.
- Launcher strip exposes restore targets for panels when hidden.

## Panel definitions

### 1) Spectral HUD panel
- Panel: `#spectral-hud-panel`
- Purpose: host spectral HUD table and 256-band analyzer placeholder regions.
- Regions:
  - `#band-hud-table-region`
  - `#spectrum-256-region`
  - `#spectrum-256-canvas`

### 2) Simulation controls panel (top-left)
- Panel: `#simulation-controls-panel`
- Purpose: host simulation control groups for future logic.
- Groups:
  - `#trace-controls-group`
  - `#particles-controls-group`
  - `#motion-controls-group`
  - `#audio-analysis-controls-group`

### 3) Render/camera/channel panel (right side)
- Panel: `#render-camera-channel-panel`
- Purpose: host render and camera tuning controls.
- Groups:
  - `#render-controls-group`
  - `#camera-controls-group`
  - `#channel-controls-group`
  - `#band-controls-group`
  - `#color-controls-group`

### 4) Playlist panel
- Panel: `#playlist-panel`
- Purpose: queue management UI surface.
- Elements:
  - `#queue-list-region` (list container)
  - `#playlist-shuffle-toggle`
  - `#playlist-clear-button`
  - `.queue-jump-target` (per-item click-to-jump target)
  - `.queue-item-remove` (per-item remove control)

### 5) Scrubber panel
- Panel: `#scrubber-panel`
- Purpose: waveform scrubbing UI and recording controls.
- Elements:
  - `#waveform-scrubber-canvas`
  - `#scrubber-time-display`
  - `#record-start-button`
  - `#record-stop-button`
  - `#record-download-action`
  - `#recording-status-text-region`

Recording format policy note for current binding:
- MIME type selection is browser-dependent and uses `MediaRecorder.isTypeSupported` when available.
- WebM candidates are attempted first and remain canonical defaults.
- MP4 candidates are optional fallbacks and are used only when WebM candidates are unavailable but MP4 is supported.

### 6) Audio control panel (bottom)
- Panel: `#audio-control-panel`
- Purpose: transport and output controls.
- Elements:
  - `#audio-load-button`
  - `#audio-prev-button`
  - `#audio-play-pause-button`
  - `#audio-stop-button`
  - `#audio-next-button`
  - `#audio-queue-toggle`
  - `#audio-loop-toggle`
  - `#audio-mute-toggle`
  - `#audio-volume-slider`
  - `#audio-status-text-region`

### 7) Status panel (bottom-right)
- Panel: `#status-panel`
- Purpose: diagnostics and control legend container.
- Regions:
  - `#live-status-readout-region`
  - `#analysis-summary-region`
  - `#input-legend-region`

### 8) Panel launcher system
- Container: `#panel-launcher-strip`
- Launcher buttons: `.panel-launcher`
- Contract: each launcher must include `data-panel-target="<panel-id>"` for restore mapping.

## Non-panel base regions
- `#app-shell`: root layout container.
- `#render-surface-canvas`: full viewport canvas.

## DOM reference module
- File: `src/ui/dom.js`
- Exports:
  - `UI_ELEMENT_IDS`: immutable ID contract map.
  - `getUIElements(root?)`: centralized element lookup for future behavior binding.

## Placeholder and future-binding notes
The following regions are intentionally inert placeholders:
- Spectral HUD and 256-band analyzer regions
- Render/camera/channel control groups
- Recording controls and status text
- Status readout and analysis summary regions
- Launcher system (visual and target mapping only)

Future systems should bind behavior to these IDs without requiring structural DOM changes.

## Responsive behavior contract
- On wide viewports, panels are overlay-positioned around the render surface.
- At narrower widths, side panels reflow into a stacked layout to keep all controls reachable.
- Controls maintain touch-friendly minimum height.
- Deliberate overflow is enabled on dense panels via local scrolling.
