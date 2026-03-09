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

  const engine = createAudioEngine({
    onStatusChange(status) {
      if (ui.audioStatusTextRegion) {
        ui.audioStatusTextRegion.textContent = `Audio status: ${status}`;
      }
    },
  });

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
    void engine.dispose();
    fileInput.remove();
  });
}

wirePresetButtons();
wireAudioControls();
