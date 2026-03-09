import { createAppLifecycle } from './app/lifecycle/appLifecycle.js';
import { bootstrapApplication } from './app/bootstrap/bootstrapApplication.js';
import { getUIElements } from './ui/dom.js';
import {
  buildShareLink,
  copyTextToClipboard,
  decodePreferencesFromHash,
  encodePreferencesToHash,
  readCurrentHash,
  writeHash,
} from './presets/urlPreset.js';
import { patchPreferences, preferences, resetPreferences, runtime, setPreferences } from './core/preferences.js';
import { createAudioEngine } from './audio/audioEngine.js';
import { wireSimulationControls } from './ui/controls/wireSimulationControls.js';
import { createBandHudPresenter } from './ui/hud/bandHudPresenter.js';

const appLifecycle = createAppLifecycle();
const bootstrapResult = bootstrapApplication({ appLifecycle });
const ui = getUIElements(document);

const appStatusElement = document.getElementById('app-status');
if (appStatusElement) {
  appStatusElement.textContent = bootstrapResult.statusMessage;
}

const {
  analysisEngine,
  visualizationEngine,
  statusViewModel,
  controlsViewModel,
  panelsViewModel,
} = bootstrapResult.modules;

const audioEngine = createAudioEngine({
  onStatusChange(status) {
    statusViewModel.setAudioStatus(status);
    controlsViewModel.setAudioStatus(status);
  },
});

analysisEngine.bindAudioEngine(audioEngine);
visualizationEngine.bindCanvas(ui.renderSurfaceCanvas);

const bandHudPresenter = createBandHudPresenter({
  tableBodyElement: ui.bandHudTableBody,
  dominantElement: ui.bandHudDominantLine,
});

function createPresetDebugUpdater(debugElement) {
  return function update(message) {
    if (debugElement) {
      debugElement.textContent = `Preset Debug: ${message}`;
    }
  };
}

function renderStatusPanels(state) {
  if (ui.liveStatusReadoutRegion) {
    ui.liveStatusReadoutRegion.textContent = state.statusText;
  }
  if (ui.analysisSummaryRegion) {
    ui.analysisSummaryRegion.textContent = state.dominantBandText;
  }
  if (ui.audioStatusTextRegion) {
    ui.audioStatusTextRegion.textContent = `Audio status: ${state.audioStatus}`;
  }
}

function renderControls(controlState) {
  if (ui.audioPlayPauseButton) {
    ui.audioPlayPauseButton.textContent = controlState.playButtonLabel;
    ui.audioPlayPauseButton.disabled = !controlState.canPlay;
  }
  if (ui.audioStopButton) {
    ui.audioStopButton.disabled = !controlState.canStop;
  }
  if (ui.audioLoopToggle) {
    ui.audioLoopToggle.setAttribute('aria-pressed', String(controlState.loopPressed));
  }
  if (ui.audioMuteToggle) {
    ui.audioMuteToggle.setAttribute('aria-pressed', String(controlState.mutePressed));
  }
  if (ui.audioVolumeSlider) {
    ui.audioVolumeSlider.value = String(controlState.volumePercent);
  }
}

function renderPanelVisibility(panelState) {
  const visibilityById = panelState.panelVisibility;

  [ui.spectralHudPanel, ui.simulationControlsPanel, ui.audioControlPanel]
    .filter(Boolean)
    .forEach((panelElement) => {
      const isVisible = visibilityById[panelElement.id] !== false;
      panelElement.hidden = !isVisible;
      panelElement.setAttribute('aria-hidden', String(!isVisible));
    });

  if (ui.panelLaunchers?.length) {
    ui.panelLaunchers.forEach((launcher) => {
      const targetId = launcher.dataset.panelTarget;
      if (!targetId) return;

      const targetVisibility = visibilityById[targetId];
      const shouldShowLauncher = targetVisibility === false;
      launcher.hidden = !shouldShowLauncher;
      launcher.setAttribute('aria-hidden', String(!shouldShowLauncher));
    });
  }

  if (ui.panelLauncherStrip) {
    const hasVisibleLauncher = ui.panelLaunchers?.some((launcher) => !launcher.hidden);
    ui.panelLauncherStrip.hidden = !hasVisibleLauncher;
    ui.panelLauncherStrip.setAttribute('aria-hidden', String(!hasVisibleLauncher));
  }
}

function syncSimulationStatusFromLifecycle() {
  statusViewModel.setSimulationStatus(appLifecycle.getState().simulation);
}

function applyLiveSettings() {
  const settings = runtime.settings;

  audioEngine.setAnalysisConfig({
    fftSize: settings.audio.fftSize,
    smoothingTimeConstant: settings.audio.smoothingTimeConstant,
    rmsGain: settings.audio.rmsGain,
  });

  audioEngine.setPlaybackLoop(settings.audio.loop);
  audioEngine.setPlaybackMuted(settings.audio.muted);
  audioEngine.setPlaybackVolume(settings.audio.volume);

  analysisEngine.configure({ audio: settings.audio, bands: settings.bands });
  visualizationEngine.configure({
    trace: settings.trace,
    particles: settings.particles,
    motion: settings.motion,
    bands: settings.bands,
    visuals: settings.visuals,
  });

  if (ui.renderSurfaceCanvas) {
    ui.renderSurfaceCanvas.style.background = settings.visuals.backgroundColor;
  }

  controlsViewModel.projectFromPlayback(audioEngine.getPlaybackState());
}

function performSimulationReset() {
  analysisEngine.reset();
  visualizationEngine.reset();
}

function runFrame() {
  const analysisFrame = analysisEngine.tick();
  const bandSnapshot = analysisFrame?.bands;
  if (bandSnapshot?.dominant) {
    statusViewModel.setDominantBand(bandSnapshot.dominant);
  }

  visualizationEngine.tick({ analysisFrame });
  bandHudPresenter.present(bandSnapshot);
}

async function handleShareLink(updateDebug) {
  const hash = encodePreferencesToHash(preferences);
  writeHash(hash);

  const link = buildShareLink(hash);
  const copied = await copyTextToClipboard(link);
  updateDebug(copied ? 'share link copied to clipboard.' : 'hash updated; clipboard unavailable.');
}

function handleApplyUrl(updateDebug, applyAll) {
  const result = decodePreferencesFromHash(readCurrentHash());
  if (!result.ok) {
    updateDebug(`apply failed: ${result.reason}`);
    return;
  }

  setPreferences(result.preferences);
  panelsViewModel.syncFromPreferences();
  applyAll({ resetAnalysis: true, resetVisualization: true });
  updateDebug(`applied preset (${result.reason.toLowerCase()}).`);
}

function handleResetPrefs(updateDebug, applyAll) {
  resetPreferences();
  panelsViewModel.syncFromPreferences();
  applyAll({ resetAnalysis: true, resetVisualization: true });
  updateDebug('preferences reset to defaults.');
}

function wirePresetButtons(applyAll) {
  const updateDebug = createPresetDebugUpdater(ui.presetDebugLine);

  ui.presetShareLinkButton?.addEventListener('click', () => {
    void handleShareLink(updateDebug);
  });

  ui.presetApplyUrlButton?.addEventListener('click', () => {
    handleApplyUrl(updateDebug, applyAll);
  });

  ui.presetResetPrefsButton?.addEventListener('click', () => {
    handleResetPrefs(updateDebug, applyAll);
  });

  updateDebug('ready.');
}

function wireAudioControls(applyAll) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';
  fileInput.style.display = 'none';
  document.body.append(fileInput);

  ui.audioLoopToggle?.addEventListener('click', () => {
    patchPreferences({ audio: { loop: !runtime.settings.audio.loop } });
    applyAll();
  });

  ui.audioMuteToggle?.addEventListener('click', () => {
    patchPreferences({ audio: { muted: !runtime.settings.audio.muted } });
    applyAll();
  });

  ui.audioVolumeSlider?.addEventListener('input', () => {
    patchPreferences({ audio: { volume: Number(ui.audioVolumeSlider.value) / 100 } });
    applyAll();
  });

  ui.audioLoadButton?.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    audioEngine.loadFile(file);
    controlsViewModel.projectFromPlayback(audioEngine.getPlaybackState());

    try {
      await audioEngine.play();
    } catch {
      // Browser autoplay rules may block immediate playback; the file still remains loaded.
    }

    controlsViewModel.projectFromPlayback(audioEngine.getPlaybackState());
    fileInput.value = '';
  });

  ui.audioPlayPauseButton?.addEventListener('click', async () => {
    const playbackState = audioEngine.getPlaybackState();
    if (!playbackState.hasSource) return;

    if (playbackState.status === 'playing') {
      audioEngine.pause();
    } else {
      await audioEngine.play();
    }

    controlsViewModel.projectFromPlayback(audioEngine.getPlaybackState());
  });

  ui.audioStopButton?.addEventListener('click', () => {
    audioEngine.stop();
    controlsViewModel.projectFromPlayback(audioEngine.getPlaybackState());
  });

  window.addEventListener('beforeunload', () => {
    appLifecycle.stop();
    analysisEngine.stop();
    visualizationEngine.stop();
    void audioEngine.dispose();
    fileInput.remove();
  });
}

const applyAll = ({ resetAnalysis = false, resetVisualization = false } = {}) => {
  applyLiveSettings();

  if (resetAnalysis) {
    analysisEngine.reset();
  }

  if (resetVisualization) {
    visualizationEngine.reset();
  }
};

statusViewModel.subscribe(renderStatusPanels);
controlsViewModel.subscribe(renderControls);
panelsViewModel.subscribe(renderPanelVisibility);

if (ui.panelLaunchers?.length) {
  ui.panelLaunchers.forEach((launcher) => {
    launcher.addEventListener('click', () => {
      const targetId = launcher.dataset.panelTarget;
      if (!targetId) return;
      panelsViewModel.setPanelVisibility(targetId, true);
    });
  });
}

wirePresetButtons(applyAll);
wireAudioControls(applyAll);
wireSimulationControls({
  ui,
  onSettingsApplied() {
    applyAll();
  },
});

applyAll();
analysisEngine.start();
visualizationEngine.start();
syncSimulationStatusFromLifecycle();

appLifecycle.wireBaselineKeyboardShortcuts({
  host: window,
  scopeElement: ui.appShell,
  onTogglePanels() {
    panelsViewModel.toggleAllToggleablePanels();
  },
  onPauseToggle() {
    syncSimulationStatusFromLifecycle();
  },
  onReset() {
    syncSimulationStatusFromLifecycle();
    performSimulationReset();
  },
});

appLifecycle.startFrameLoop({
  onFrame: runFrame,
  intervalMs: bandHudPresenter.refreshIntervalMs,
});
