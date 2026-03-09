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
import { preferences, resetPreferences, runtime, setPreferences } from './core/preferences.js';
import { createAudioEngine } from './audio/audioEngine.js';
import { createBandBank } from './bands/bandBank.js';
import { createBandHudPresenter } from './ui/bands/bandHudPresenter.js';
import { createStatusViewModel } from './ui/status/statusViewModel.js';

const appLifecycle = createAppLifecycle();
const bootstrapResult = bootstrapApplication({ appLifecycle });

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

async function handleShareLink(updateDebug) {
  const hash = encodePreferencesToHash(preferences);
  writeHash(hash);

  const link = buildShareLink(hash);
  const copied = await copyTextToClipboard(link);
  updateDebug(copied ? 'share link copied to clipboard.' : 'hash updated; clipboard unavailable.');
}

function handleApplyUrl(updateDebug) {
  const result = decodePreferencesFromHash(readCurrentHash());
  if (!result.ok) {
    updateDebug(`apply failed: ${result.reason}`);
    return;
  }

  setPreferences(result.preferences);
  updateDebug(`applied schema v1 preset (${result.reason.toLowerCase()}).`);
}

function handleResetPrefs(updateDebug) {
  resetPreferences();
  updateDebug('preferences reset to defaults.');
}

function wirePresetButtons() {
  const ui = getUIElements(document);
  const updateDebug = createPresetDebugUpdater(ui.presetDebugLine);

  if (ui.presetShareLinkButton) {
    ui.presetShareLinkButton.addEventListener('click', () => {
      void handleShareLink(updateDebug);
    });
  }

  if (ui.presetApplyUrlButton) {
    ui.presetApplyUrlButton.addEventListener('click', () => {
      handleApplyUrl(updateDebug);
    });
  }

  if (ui.presetResetPrefsButton) {
    ui.presetResetPrefsButton.addEventListener('click', () => {
      handleResetPrefs(updateDebug);
    });
  }

  updateDebug('ready.');
}

function wireAudioControls() {
  const ui = getUIElements(document);
  const audioSettings = runtime.settings.audio;
  const bandSettings = runtime.settings.bands;
  const statusViewModel = createStatusViewModel();
  const bandBank = createBandBank({ sourceChannelId: 'C' });
  const hudPresenter = createBandHudPresenter({
    panelElement: ui.spectralHudPanel,
    dominantElement: ui.bandHudDominant,
    metaElement: ui.bandHudMeta,
    tableBodyElement: ui.bandHudTableBody,
  });

  bandBank.configure({
    floorHz: bandSettings.floorHz,
    ceilingHz: bandSettings.ceilingHz,
    logSpacing: bandSettings.logSpacing,
  });

  let analysisRafId = 0;

  function renderStatus() {
    const state = statusViewModel.getState();
    if (ui.audioStatusTextRegion) ui.audioStatusTextRegion.textContent = state.audioStatusText;
    if (ui.liveStatusReadoutRegion) ui.liveStatusReadoutRegion.textContent = state.liveStatusText;
    if (ui.analysisSummaryRegion) ui.analysisSummaryRegion.textContent = state.analysisSummaryText;
  }

  const engine = createAudioEngine({
    onStatusChange(status) {
      statusViewModel.setAudioStatus(status);
      renderStatus();
    },
  });

  function runAnalysisLoop() {
    const analysisInfo = engine.getAnalysisInfo();
    if (analysisInfo.sampleRate > 0) {
      const analysisFrame = engine.sampleAnalysisFrame();
      const snapshot = bandBank.updateFromAnalysisFrame(analysisFrame, {
        sampleRate: analysisInfo.sampleRate,
        fftSize: analysisInfo.fftSize,
      });

      hudPresenter.ingest(snapshot);
      const renderedSnapshot = hudPresenter.render(performance.now());
      if (renderedSnapshot) {
        statusViewModel.setDominantBand(renderedSnapshot.dominant);
        statusViewModel.setMonoIsh(analysisFrame.monoIsh);
        renderStatus();
      }
    }

    analysisRafId = requestAnimationFrame(runAnalysisLoop);
  }

  renderStatus();
  analysisRafId = requestAnimationFrame(runAnalysisLoop);

  engine.setAnalysisConfig({
    fftSize: audioSettings.fftSize,
    smoothingTimeConstant: audioSettings.smoothingTimeConstant,
    rmsGain: audioSettings.rmsGain,
  });

  if (ui.audioLoopToggle) {
    engine.setPlaybackLoop(audioSettings.loop);
    ui.audioLoopToggle.addEventListener('click', () => {
      const next = !engine.getPlaybackState().loop;
      engine.setPlaybackLoop(next);
      ui.audioLoopToggle.setAttribute('aria-pressed', String(next));
    });
    ui.audioLoopToggle.setAttribute('aria-pressed', String(audioSettings.loop));
  }

  if (ui.audioMuteToggle) {
    engine.setPlaybackMuted(audioSettings.muted);
    ui.audioMuteToggle.addEventListener('click', () => {
      const next = !engine.getPlaybackState().muted;
      engine.setPlaybackMuted(next);
      ui.audioMuteToggle.setAttribute('aria-pressed', String(next));
    });
    ui.audioMuteToggle.setAttribute('aria-pressed', String(audioSettings.muted));
  }

  if (ui.audioVolumeSlider) {
    ui.audioVolumeSlider.value = String(Math.round(audioSettings.volume * 100));
    engine.setPlaybackVolume(audioSettings.volume);
    ui.audioVolumeSlider.addEventListener('input', () => {
      const value01 = Number(ui.audioVolumeSlider.value) / 100;
      engine.setPlaybackVolume(value01);
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

    engine.loadFile(file);
    try {
      await engine.play();
    } catch {
      // Browser autoplay rules may block immediate playback; the file still remains loaded.
    }

    fileInput.value = '';
  });

  ui.audioPlayPauseButton?.addEventListener('click', async () => {
    const playbackState = engine.getPlaybackState();
    if (!playbackState.hasSource) return;

    if (playbackState.status === 'playing') {
      engine.pause();
      return;
    }

    await engine.play();
  });

  ui.audioStopButton?.addEventListener('click', () => {
    engine.stop();
  });

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(analysisRafId);
    void engine.dispose();
    fileInput.remove();
  });
}

wirePresetButtons();
wireAudioControls();
