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

function createPresetDebugUpdater(debugElement) {
  return function update(message) {
    if (debugElement) {
      debugElement.textContent = `Preset Debug: ${message}`;
    }
  };
}

function applyLiveSettings({ audioEngine, analysisEngine, visualizationEngine }) {
  const settings = runtime.settings;

  audioEngine.setAnalysisConfig({
    fftSize: settings.audio.fftSize,
    smoothingTimeConstant: settings.audio.smoothingTimeConstant,
    rmsGain: settings.audio.rmsGain,
  });

  audioEngine.setPlaybackLoop(settings.audio.loop);
  audioEngine.setPlaybackMuted(settings.audio.muted);
  audioEngine.setPlaybackVolume(settings.audio.volume);

  analysisEngine.configure({
    audio: settings.audio,
    bands: settings.bands,
  });

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
  applyAll();
  updateDebug(`applied schema v1 preset (${result.reason.toLowerCase()}).`);
}

function handleResetPrefs(updateDebug, applyAll) {
  resetPreferences();
  panelsViewModel.syncFromPreferences();
  applyAll();
  updateDebug('preferences reset to defaults.');
}

function wirePresetButtons(applyAll) {
  const updateDebug = createPresetDebugUpdater(ui.presetDebugLine);

  if (ui.presetShareLinkButton) {
    ui.presetShareLinkButton.addEventListener('click', () => {
      void handleShareLink(updateDebug);
    });
  }

  if (ui.presetApplyUrlButton) {
    ui.presetApplyUrlButton.addEventListener('click', () => {
      handleApplyUrl(updateDebug, applyAll);
    });
  }

  if (ui.presetResetPrefsButton) {
    ui.presetResetPrefsButton.addEventListener('click', () => {
      handleResetPrefs(updateDebug, applyAll);
    });
  }

  updateDebug('ready.');
}

function wireAudioControls(audioEngine, applyAll) {
  const audioSettings = runtime.settings.audio;

  if (ui.audioLoopToggle) {
    ui.audioLoopToggle.addEventListener('click', () => {
      const next = !runtime.settings.audio.loop;
      patchPreferences({ audio: { loop: next } });
      applyAll();
      ui.audioLoopToggle.setAttribute('aria-pressed', String(next));
    });
    ui.audioLoopToggle.setAttribute('aria-pressed', String(audioSettings.loop));
  }

  if (ui.audioMuteToggle) {
    ui.audioMuteToggle.addEventListener('click', () => {
      const next = !runtime.settings.audio.muted;
      patchPreferences({ audio: { muted: next } });
      applyAll();
      ui.audioMuteToggle.setAttribute('aria-pressed', String(next));
    });
    ui.audioMuteToggle.setAttribute('aria-pressed', String(audioSettings.muted));
  }

  if (ui.audioVolumeSlider) {
    ui.audioVolumeSlider.value = String(Math.round(audioSettings.volume * 100));
    ui.audioVolumeSlider.addEventListener('input', () => {
      const value01 = Number(ui.audioVolumeSlider.value) / 100;
      patchPreferences({ audio: { volume: value01 } });
      applyAll();
    });
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';
  fileInput.style.display = 'none';
  document.body.append(fileInput);

  ui.audioLoadButton?.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    audioEngine.loadFile(file);
    try {
      await audioEngine.play();
    } catch {
      // Browser autoplay rules may block immediate playback; the file still remains loaded.
    }

    fileInput.value = '';
  });

  ui.audioPlayPauseButton?.addEventListener('click', async () => {
    const playbackState = audioEngine.getPlaybackState();
    if (!playbackState.hasSource) return;

    if (playbackState.status === 'playing') {
      audioEngine.pause();
      return;
    }

    await audioEngine.play();
  });

  ui.audioStopButton?.addEventListener('click', () => {
    audioEngine.stop();
  });

  window.addEventListener('beforeunload', () => {
    void audioEngine.dispose();
    fileInput.remove();
  });
}

const { analysisEngine, visualizationEngine, statusViewModel, panelsViewModel } = bootstrapResult.modules;

const audioEngine = createAudioEngine({
  onStatusChange(status) {
    statusViewModel.setAudioStatus(status);
    if (ui.audioStatusTextRegion) {
      ui.audioStatusTextRegion.textContent = `Audio status: ${status}`;
    }
  },
});

const bandHudPresenter = createBandHudPresenter({
  tableBodyElement: ui.bandHudTableBody,
  dominantElement: ui.bandHudDominantLine,
});


function renderPanelVisibility(panelState) {
  const visibilityById = panelState.panelVisibility;

  const panels = [
    ui.spectralHudPanel,
    ui.simulationControlsPanel,
    ui.audioControlPanel,
  ].filter(Boolean);

  panels.forEach((panelElement) => {
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

function wirePanels() {
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

  panelsViewModel.wireKeyboardShortcuts(window);
}

function renderStatusPanels() {
  const state = statusViewModel.getState();
  if (ui.liveStatusReadoutRegion) {
    ui.liveStatusReadoutRegion.textContent = state.statusText;
  }
  if (ui.analysisSummaryRegion) {
    ui.analysisSummaryRegion.textContent = state.dominantBandText;
  }
}

function tickHudFromAnalysis() {
  const analysisFrame = audioEngine.sampleAnalysisFrame();
  const latestFrame = analysisEngine.consumeAudioFrame(analysisFrame);
  const bandSnapshot = latestFrame?.bands;
  if (bandSnapshot?.dominant) {
    statusViewModel.setDominantBand(bandSnapshot.dominant);
  }
  bandHudPresenter.present(bandSnapshot);
  renderStatusPanels();
}

const applyAll = () => {
  applyLiveSettings({
    audioEngine,
    analysisEngine,
    visualizationEngine,
  });
};

wirePresetButtons(applyAll);
wireAudioControls(audioEngine, applyAll);
wirePanels();
wireSimulationControls({
  ui,
  onSettingsApplied() {
    applyAll();
  },
});
applyAll();
renderStatusPanels();
window.setInterval(tickHudFromAnalysis, bandHudPresenter.refreshIntervalMs);
