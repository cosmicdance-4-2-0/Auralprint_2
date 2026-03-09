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

function createBandHudFeed(ui, bandBank) {
  const dominantBadge = document.createElement('div');
  dominantBadge.textContent = 'Dominant: (none)';
  ui.analysisSummaryRegion?.replaceChildren(dominantBadge);

  const table = document.createElement('div');
  table.style.display = 'grid';
  table.style.gridTemplateColumns = '44px 1fr 120px';
  table.style.gap = '4px 8px';

  const rows = [];
  const snapshot = bandBank.getSnapshot();
  for (let i = 0; i < snapshot.names.length; i += 1) {
    const idx = document.createElement('div');
    idx.textContent = `${i}`;
    idx.style.opacity = '0.65';

    const name = document.createElement('div');
    name.textContent = snapshot.names[i];
    name.style.whiteSpace = 'nowrap';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';

    const val = document.createElement('div');
    val.textContent = '0.000';
    val.style.fontVariantNumeric = 'tabular-nums';

    table.append(idx, name, val);
    rows.push({ name, val });
  }

  ui.bandHudTableRegion?.replaceChildren(table);

  const canvas = ui.spectrum256Canvas;
  const ctx = canvas?.getContext('2d') ?? null;

  function paintSpectrum(snapshotInput) {
    if (!ctx || !canvas) return;
    const width = canvas.clientWidth || 700;
    const height = canvas.clientHeight || 180;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    const barWidth = width / snapshotInput.energies01.length;
    for (let i = 0; i < snapshotInput.energies01.length; i += 1) {
      const e = snapshotInput.energies01[i];
      const h = e * height;
      ctx.fillStyle = i === snapshotInput.dominant.index ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth - 0.5), h);
    }
  }

  function render(snapshotInput) {
    if (!snapshotInput) return;

    for (let i = 0; i < rows.length; i += 1) {
      const energy = snapshotInput.energies01[i] ?? 0;
      rows[i].val.textContent = energy.toFixed(3);
      rows[i].name.style.opacity = i === snapshotInput.dominant.index ? '1' : '0.72';
    }

    dominantBadge.textContent = `Dominant: [${snapshotInput.dominant.index}] ${snapshotInput.dominant.name} — ${snapshotInput.dominant.hzRangeText}`;

    if (ui.liveStatusReadoutRegion) {
      const m = snapshotInput.metadata;
      ui.liveStatusReadoutRegion.textContent = `Band metadata: sr=${Math.round(m.sampleRate)}Hz nyquist=${Math.round(m.nyquistHz)}Hz ceiling(cfg/effective)=${Math.round(m.configuredCeilingHz)}/${Math.round(m.effectiveCeilingHz)}Hz`;
    }

    paintSpectrum(snapshotInput);
  }

  return { render };
}

function wireAudioControls() {
  const ui = getUIElements(document);
  const settings = runtime.settings;
  const audioSettings = settings.audio;
  const bandsSettings = settings.bands;

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

  const bandBank = createBandBank({ sourceChannelId: 'C' });
  bandBank.configure({
    floorHz: bandsSettings.floorHz,
    ceilingHz: bandsSettings.ceilingHz,
    logSpacing: bandsSettings.logSpacing,
  });
  const bandHud = createBandHudFeed(ui, bandBank);

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

  const hudUpdateIntervalMs = 100;
  const hudTimer = window.setInterval(() => {
    const panelVisible = !ui.spectralHudPanel?.hidden && ui.spectralHudPanel?.offsetParent !== null;
    if (!panelVisible) return;

    const frame = engine.sampleAnalysisFrame();
    const metadata = frame.analysisMetadata;
    if (!metadata?.sampleRate || !metadata.fftSize) return;

    const snapshot = bandBank.updateFromAnalysisFrame(frame, {
      sampleRate: metadata.sampleRate,
      fftSize: metadata.fftSize,
      dbMin: metadata.dbMin,
      dbMax: metadata.dbMax,
    });
    bandHud.render(snapshot);
  }, hudUpdateIntervalMs);

  window.addEventListener('beforeunload', () => {
    window.clearInterval(hudTimer);
    void engine.dispose();
    fileInput.remove();
  });
}

wirePresetButtons();
wireAudioControls();
