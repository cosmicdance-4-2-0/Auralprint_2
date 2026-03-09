/**
 * Stable DOM contract for the UI shell.
 * This module only provides IDs and element references.
 */

export const UI_ELEMENT_IDS = Object.freeze({
  appShell: 'app-shell',
  renderSurfaceCanvas: 'render-surface-canvas',

  spectralHudPanel: 'spectral-hud-panel',
  bandHudTableRegion: 'band-hud-table-region',
  bandHudDominant: 'band-hud-dominant',
  bandHudMeta: 'band-hud-meta',
  bandHudTable: 'band-hud-table',
  bandHudTableBody: 'band-hud-table-body',
  spectrum256Region: 'spectrum-256-region',
  spectrum256Canvas: 'spectrum-256-canvas',

  simulationControlsPanel: 'simulation-controls-panel',
  traceControlsGroup: 'trace-controls-group',
  particlesControlsGroup: 'particles-controls-group',
  motionControlsGroup: 'motion-controls-group',
  audioAnalysisControlsGroup: 'audio-analysis-controls-group',

  renderCameraChannelPanel: 'render-camera-channel-panel',
  renderControlsGroup: 'render-controls-group',
  cameraControlsGroup: 'camera-controls-group',
  channelControlsGroup: 'channel-controls-group',
  bandControlsGroup: 'band-controls-group',
  colorControlsGroup: 'color-controls-group',

  playlistPanel: 'playlist-panel',
  playlistShuffleToggle: 'playlist-shuffle-toggle',
  playlistClearButton: 'playlist-clear-button',
  queueListRegion: 'queue-list-region',

  statusPanel: 'status-panel',
  liveStatusReadoutRegion: 'live-status-readout-region',
  analysisSummaryRegion: 'analysis-summary-region',
  inputLegendRegion: 'input-legend-region',

  scrubberPanel: 'scrubber-panel',
  waveformScrubberCanvas: 'waveform-scrubber-canvas',
  scrubberTimeDisplay: 'scrubber-time-display',
  recordStartButton: 'record-start-button',
  recordStopButton: 'record-stop-button',
  recordDownloadAction: 'record-download-action',
  recordingStatusTextRegion: 'recording-status-text-region',

  audioControlPanel: 'audio-control-panel',
  audioLoadButton: 'audio-load-button',
  audioPrevButton: 'audio-prev-button',
  audioPlayPauseButton: 'audio-play-pause-button',
  audioStopButton: 'audio-stop-button',
  audioNextButton: 'audio-next-button',
  audioQueueToggle: 'audio-queue-toggle',
  audioLoopToggle: 'audio-loop-toggle',
  audioMuteToggle: 'audio-mute-toggle',
  audioVolumeSlider: 'audio-volume-slider',
  audioStatusTextRegion: 'audio-status-text-region',


  presetShareLinkButton: 'preset-share-link-button',
  presetApplyUrlButton: 'preset-apply-url-button',
  presetResetPrefsButton: 'preset-reset-prefs-button',
  presetDebugLine: 'preset-debug-line',
  panelLauncherStrip: 'panel-launcher-strip'
});

export function getUIElements(root = document) {
  return {
    appShell: root.getElementById(UI_ELEMENT_IDS.appShell),
    renderSurfaceCanvas: root.getElementById(UI_ELEMENT_IDS.renderSurfaceCanvas),

    spectralHudPanel: root.getElementById(UI_ELEMENT_IDS.spectralHudPanel),
    bandHudTableRegion: root.getElementById(UI_ELEMENT_IDS.bandHudTableRegion),
    bandHudDominant: root.getElementById(UI_ELEMENT_IDS.bandHudDominant),
    bandHudMeta: root.getElementById(UI_ELEMENT_IDS.bandHudMeta),
    bandHudTable: root.getElementById(UI_ELEMENT_IDS.bandHudTable),
    bandHudTableBody: root.getElementById(UI_ELEMENT_IDS.bandHudTableBody),
    spectrum256Region: root.getElementById(UI_ELEMENT_IDS.spectrum256Region),
    spectrum256Canvas: root.getElementById(UI_ELEMENT_IDS.spectrum256Canvas),

    simulationControlsPanel: root.getElementById(UI_ELEMENT_IDS.simulationControlsPanel),
    traceControlsGroup: root.getElementById(UI_ELEMENT_IDS.traceControlsGroup),
    particlesControlsGroup: root.getElementById(UI_ELEMENT_IDS.particlesControlsGroup),
    motionControlsGroup: root.getElementById(UI_ELEMENT_IDS.motionControlsGroup),
    audioAnalysisControlsGroup: root.getElementById(UI_ELEMENT_IDS.audioAnalysisControlsGroup),

    renderCameraChannelPanel: root.getElementById(UI_ELEMENT_IDS.renderCameraChannelPanel),
    renderControlsGroup: root.getElementById(UI_ELEMENT_IDS.renderControlsGroup),
    cameraControlsGroup: root.getElementById(UI_ELEMENT_IDS.cameraControlsGroup),
    channelControlsGroup: root.getElementById(UI_ELEMENT_IDS.channelControlsGroup),
    bandControlsGroup: root.getElementById(UI_ELEMENT_IDS.bandControlsGroup),
    colorControlsGroup: root.getElementById(UI_ELEMENT_IDS.colorControlsGroup),

    playlistPanel: root.getElementById(UI_ELEMENT_IDS.playlistPanel),
    playlistShuffleToggle: root.getElementById(UI_ELEMENT_IDS.playlistShuffleToggle),
    playlistClearButton: root.getElementById(UI_ELEMENT_IDS.playlistClearButton),
    queueListRegion: root.getElementById(UI_ELEMENT_IDS.queueListRegion),

    statusPanel: root.getElementById(UI_ELEMENT_IDS.statusPanel),
    liveStatusReadoutRegion: root.getElementById(UI_ELEMENT_IDS.liveStatusReadoutRegion),
    analysisSummaryRegion: root.getElementById(UI_ELEMENT_IDS.analysisSummaryRegion),
    inputLegendRegion: root.getElementById(UI_ELEMENT_IDS.inputLegendRegion),

    scrubberPanel: root.getElementById(UI_ELEMENT_IDS.scrubberPanel),
    waveformScrubberCanvas: root.getElementById(UI_ELEMENT_IDS.waveformScrubberCanvas),
    scrubberTimeDisplay: root.getElementById(UI_ELEMENT_IDS.scrubberTimeDisplay),
    recordStartButton: root.getElementById(UI_ELEMENT_IDS.recordStartButton),
    recordStopButton: root.getElementById(UI_ELEMENT_IDS.recordStopButton),
    recordDownloadAction: root.getElementById(UI_ELEMENT_IDS.recordDownloadAction),
    recordingStatusTextRegion: root.getElementById(UI_ELEMENT_IDS.recordingStatusTextRegion),

    audioControlPanel: root.getElementById(UI_ELEMENT_IDS.audioControlPanel),
    audioLoadButton: root.getElementById(UI_ELEMENT_IDS.audioLoadButton),
    audioPrevButton: root.getElementById(UI_ELEMENT_IDS.audioPrevButton),
    audioPlayPauseButton: root.getElementById(UI_ELEMENT_IDS.audioPlayPauseButton),
    audioStopButton: root.getElementById(UI_ELEMENT_IDS.audioStopButton),
    audioNextButton: root.getElementById(UI_ELEMENT_IDS.audioNextButton),
    audioQueueToggle: root.getElementById(UI_ELEMENT_IDS.audioQueueToggle),
    audioLoopToggle: root.getElementById(UI_ELEMENT_IDS.audioLoopToggle),
    audioMuteToggle: root.getElementById(UI_ELEMENT_IDS.audioMuteToggle),
    audioVolumeSlider: root.getElementById(UI_ELEMENT_IDS.audioVolumeSlider),
    audioStatusTextRegion: root.getElementById(UI_ELEMENT_IDS.audioStatusTextRegion),


    presetShareLinkButton: root.getElementById(UI_ELEMENT_IDS.presetShareLinkButton),
    presetApplyUrlButton: root.getElementById(UI_ELEMENT_IDS.presetApplyUrlButton),
    presetResetPrefsButton: root.getElementById(UI_ELEMENT_IDS.presetResetPrefsButton),
    presetDebugLine: root.getElementById(UI_ELEMENT_IDS.presetDebugLine),

    panelLauncherStrip: root.getElementById(UI_ELEMENT_IDS.panelLauncherStrip),
    panelLaunchers: Array.from(root.querySelectorAll('.panel-launcher'))
  };
}
