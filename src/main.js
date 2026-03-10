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
import { createDecodeGateway } from './io/decode/decodeGateway.js';
import { createPlaybackGateway } from './io/playback/playbackGateway.js';
import { wireSimulationControls } from './ui/controls/wireSimulationControls.js';
import { createBandHudPresenter } from './ui/hud/bandHudPresenter.js';
import { createSpectrum256CanvasPresenter } from './ui/hud/spectrum256CanvasPresenter.js';
import { createCaptureGateway } from './io/capture/captureGateway.js';
import { createExportGateway } from './io/export/exportGateway.js';
import { createRecordingController } from './domain/recording/recordingController.js';
import { createTransportController } from './domain/transport/transportController.js';

const SCRUBBER_KEYBOARD_SEEK_STEP_SECONDS = 5;
const SCRUBBER_KEYBOARD_ACCELERATED_SEEK_STEP_SECONDS = 30;

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
  queueController,
} = bootstrapResult.modules;

const playbackSession = {
  itemIdCounter: 0,
  activeTrackId: null,
  scrubberWaveform: new Float32Array(0),
  isScrubbing: false,
};

let transportController;

const audioEngine = createAudioEngine({
  onStatusChange(status) {
    transportController?.handlePlaybackStatus(status);
    statusViewModel.setAudioStatus(status);
    controlsViewModel.setAudioStatus(status);

    if (status === 'ended' && !runtime.settings.audio.loop) {
      void playQueueOffset({ direction: 'next', autoplay: true });
    }
  },
});

const decodeGateway = createDecodeGateway();
const playbackGateway = createPlaybackGateway({ audioEngine });
transportController = createTransportController({ playbackGateway });

analysisEngine.bindAudioEngine(audioEngine);
visualizationEngine.bindCanvas(ui.renderSurfaceCanvas);

const bandHudPresenter = createBandHudPresenter({
  tableBodyElement: ui.bandHudTableBody,
  dominantElement: ui.bandHudDominantLine,
});

const spectrum256CanvasPresenter = createSpectrum256CanvasPresenter({
  canvasElement: ui.spectrum256Canvas,
  panelElement: ui.spectrum256Region,
});

const captureGateway = createCaptureGateway();
const exportGateway = createExportGateway({ host: window });
const recordingController = createRecordingController({
  captureGateway,
  exportGateway,
  onStateChange: renderRecordingState,
});

function createPresetDebugUpdater(debugElement) {
  return function update(message) {
    if (debugElement) {
      debugElement.textContent = `Preset Debug: ${message}`;
    }
  };
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function renderScrubber(playbackState) {
  if (!ui.waveformScrubberCanvas) return;

  const canvas = ui.waveformScrubberCanvas;
  const context = canvas.getContext('2d');
  if (!context) return;

  const cssWidth = Math.max(8, canvas.clientWidth || 8);
  const cssHeight = Math.max(32, canvas.clientHeight || 32);
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.floor(cssWidth * dpr);
  const targetHeight = Math.floor(cssHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = 'rgba(14, 18, 30, 0.95)';
  context.fillRect(0, 0, cssWidth, cssHeight);

  const waveform = playbackSession.scrubberWaveform;
  if (waveform.length > 0) {
    const centerY = cssHeight * 0.5;
    const halfHeight = Math.max(1, cssHeight * 0.42);
    const step = waveform.length / cssWidth;

    context.strokeStyle = 'rgba(101, 220, 255, 0.95)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x < cssWidth; x += 1) {
      const index = Math.min(waveform.length - 1, Math.floor(x * step));
      const sample = waveform[index] ?? 0;
      const y = centerY + sample * halfHeight;
      if (x === 0) {
        context.moveTo(0, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  }

  const durationSeconds = playbackState.durationSeconds || 0;
  const progress = durationSeconds > 0 ? (playbackState.currentTimeSeconds || 0) / durationSeconds : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  context.fillStyle = 'rgba(125, 132, 255, 0.24)';
  context.fillRect(0, 0, cssWidth * clampedProgress, cssHeight);

  context.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  context.strokeRect(0.5, 0.5, Math.max(0, cssWidth - 1), Math.max(0, cssHeight - 1));

  if (ui.scrubberTimeDisplay) {
    ui.scrubberTimeDisplay.textContent = `${formatTime(playbackState.currentTimeSeconds || 0)} / ${formatTime(durationSeconds)}`;
  }
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

  const queueState = queueController.getQueueState();
  const hasMultipleTracks = queueState.length >= 2;
  if (ui.audioPrevButton) {
    ui.audioPrevButton.disabled = !hasMultipleTracks;
  }
  if (ui.audioNextButton) {
    ui.audioNextButton.disabled = !hasMultipleTracks;
  }
}

function renderPanelVisibility(panelState) {
  const visibilityById = panelState.panelVisibility;

  panelState.toggleablePanels
    .map((panelId) => document.getElementById(panelId))
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

function renderRecordingState(recordingState) {
  if (ui.recordingStatusTextRegion) {
    ui.recordingStatusTextRegion.textContent = recordingState.statusText;
  }

  if (ui.recordStartButton) {
    ui.recordStartButton.disabled = !recordingState.canStart;
  }

  if (ui.recordStopButton) {
    ui.recordStopButton.disabled = !recordingState.canStop;
  }

  if (ui.recordDownloadAction) {
    const downloadUrl = recordingState.artifact?.url ?? '';
    ui.recordDownloadAction.href = downloadUrl || '#';
    ui.recordDownloadAction.download = recordingState.artifact?.fileName || 'auralprint-capture.webm';
    ui.recordDownloadAction.setAttribute('aria-disabled', String(!recordingState.canDownload));
    ui.recordDownloadAction.tabIndex = recordingState.canDownload ? 0 : -1;
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

  spectrum256CanvasPresenter.configure(settings);

  controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
}

function performSimulationReset() {
  analysisEngine.reset();
  visualizationEngine.reset();
}

function resetTrackTransitionState() {
  performSimulationReset();
  playbackSession.scrubberWaveform = new Float32Array(0);
}

function createQueueItem(file, metadata = null) {
  return {
    id: `track-${playbackSession.itemIdCounter += 1}`,
    file,
    title: metadata?.name || file?.name || 'Untitled track',
    metadata,
  };
}

function renderQueueList() {
  if (!ui.queueListRegion) return;

  const queueState = queueController.getQueueState();
  const template = document.getElementById('queue-item-template');
  ui.queueListRegion.innerHTML = '';

  queueState.items.forEach((item, index) => {
    let row;
    if (template) {
      row = template.cloneNode(true);
      row.removeAttribute('id');
    } else {
      row = document.createElement('li');
      row.className = 'queue-item';
      row.innerHTML = '<button class="queue-jump-target" type="button"></button><button class="queue-item-remove" type="button" aria-label="Remove queue item">✕</button>';
    }

    row.dataset.index = String(index);
    const jumpButton = row.querySelector('.queue-jump-target');
    const removeButton = row.querySelector('.queue-item-remove');

    if (jumpButton) {
      jumpButton.textContent = item.title;
      jumpButton.dataset.index = String(index);
      jumpButton.setAttribute('aria-current', String(index === queueState.activeIndex));
    }

    if (removeButton) {
      removeButton.dataset.index = String(index);
    }

    if (index === queueState.activeIndex) {
      row.setAttribute('aria-current', 'true');
    }

    ui.queueListRegion.append(row);
  });

  controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
}

async function loadQueueItem(item, { autoplay = true } = {}) {
  if (!item?.file) return;

  playbackSession.activeTrackId = item.id;
  resetTrackTransitionState();

  await transportController.loadSource(item, { autoplay });
  applyLiveSettings();

  controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
  renderQueueList();
}

async function playQueueOffset({ direction, autoplay = true } = {}) {
  const item = direction === 'previous' ? queueController.previous() : queueController.next();
  if (!item) return;
  await loadQueueItem(item, { autoplay });
}

async function jumpToQueueIndex(index, { autoplay = true } = {}) {
  const item = queueController.jumpTo(index);
  if (!item) return;
  await loadQueueItem(item, { autoplay });
}

function clearQueueAndPlayback() {
  queueController.clear();
  playbackSession.activeTrackId = null;
  resetTrackTransitionState();
  transportController.unload();
  renderQueueList();
  renderScrubber(transportController.getPlaybackState());
}

function runFrame() {
  const analysisFrame = analysisEngine.tick();
  const bandSnapshot = analysisFrame?.bands;
  if (bandSnapshot?.dominant) {
    statusViewModel.setDominantBand(bandSnapshot.dominant);
  }

  if (analysisFrame?.channels?.C?.waveform?.length) {
    playbackSession.scrubberWaveform = analysisFrame.channels.C.waveform;
  }

  visualizationEngine.tick({ analysisFrame });
  bandHudPresenter.present(bandSnapshot);
  spectrum256CanvasPresenter.present(bandSnapshot);

  renderScrubber(transportController.getPlaybackState());
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

function wireScrubberInteractions() {
  if (!ui.waveformScrubberCanvas) return;

  const seekFromClientX = (clientX) => {
    const playbackState = transportController.getPlaybackState();
    if (!playbackState.hasSource || !Number.isFinite(playbackState.durationSeconds) || playbackState.durationSeconds <= 0) {
      return;
    }

    const rect = ui.waveformScrubberCanvas.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    transportController.seek(playbackState.durationSeconds * ratio);
    controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
    renderScrubber(transportController.getPlaybackState());
  };

  ui.waveformScrubberCanvas.addEventListener('mousedown', (event) => {
    playbackSession.isScrubbing = true;
    seekFromClientX(event.clientX);
  });

  window.addEventListener('mousemove', (event) => {
    if (!playbackSession.isScrubbing) return;
    seekFromClientX(event.clientX);
  });

  window.addEventListener('mouseup', () => {
    playbackSession.isScrubbing = false;
  });

  ui.waveformScrubberCanvas.addEventListener('click', (event) => {
    seekFromClientX(event.clientX);
  });
}

function wireRecordingControls() {
  ui.recordStartButton?.addEventListener('click', () => {
    recordingController.startRecording({
      canvasElement: ui.renderSurfaceCanvas,
      audioEngine,
    });
  });

  ui.recordStopButton?.addEventListener('click', () => {
    recordingController.stopRecording();
  });

  ui.recordDownloadAction?.addEventListener('click', (event) => {
    const recordingState = recordingController.getRecordingState();
    if (!recordingState.canDownload) {
      event.preventDefault();
    }
  });
}

function wireAudioControls(applyAll) {
  const dropSurfaceElement = ui.renderSurfaceCanvas ?? ui.appShell;
  const DROP_ACTIVE_CLASS_NAME = 'is-drop-active';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.append(fileInput);

  const processIncomingFiles = async (files) => {
    if (!files.length) return;

    const decodeResult = await decodeGateway.decodeFiles(files);
    const queueItems = decodeResult.accepted.map(({ file, metadata }) => createQueueItem(file, metadata));
    if (!queueItems.length) return;

    const queueStateBefore = queueController.getQueueState();
    const shouldAutoplayFirst = queueStateBefore.length === 0;

    queueController.addItems(queueItems);
    renderQueueList();

    if (shouldAutoplayFirst) {
      await jumpToQueueIndex(0, { autoplay: true });
    }
  };

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

  ui.audioPrevButton?.addEventListener('click', () => {
    void playQueueOffset({ direction: 'previous', autoplay: true });
  });

  ui.audioNextButton?.addEventListener('click', () => {
    void playQueueOffset({ direction: 'next', autoplay: true });
  });

  ui.audioQueueToggle?.addEventListener('click', () => {
    const panelState = panelsViewModel.getState();
    const isVisible = panelState.panelVisibility['playlist-panel'] !== false;
    panelsViewModel.setPanelVisibility('playlist-panel', !isVisible);
  });

  ui.playlistShuffleToggle?.addEventListener('click', () => {
    const queueState = queueController.getQueueState();
    queueController.setShuffleEnabled(!queueState.shuffleEnabled);
    const nextState = queueController.getQueueState();
    ui.playlistShuffleToggle?.setAttribute('aria-pressed', String(nextState.shuffleEnabled));
  });

  ui.playlistClearButton?.addEventListener('click', () => {
    clearQueueAndPlayback();
  });

  ui.queueListRegion?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const jumpButton = target.closest('.queue-jump-target');
    if (jumpButton instanceof HTMLElement) {
      const index = Number(jumpButton.dataset.index);
      if (Number.isInteger(index)) {
        void jumpToQueueIndex(index, { autoplay: true });
      }
      return;
    }

    const removeButton = target.closest('.queue-item-remove');
    if (removeButton instanceof HTMLElement) {
      const index = Number(removeButton.dataset.index);
      if (!Number.isInteger(index)) return;

      const queueStateBefore = queueController.getQueueState();
      const wasActive = index === queueStateBefore.activeIndex;
      queueController.removeAt(index);

      const queueStateAfter = queueController.getQueueState();
      if (!queueStateAfter.length) {
        clearQueueAndPlayback();
        return;
      }

      if (wasActive) {
        const activeItem = queueStateAfter.items[queueStateAfter.activeIndex] ?? null;
        if (activeItem) {
          void loadQueueItem(activeItem, { autoplay: true });
          return;
        }
      }

      renderQueueList();
    }
  });

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    await processIncomingFiles(files);
    fileInput.value = '';
  });

  dropSurfaceElement?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropSurfaceElement.classList.add(DROP_ACTIVE_CLASS_NAME);
  });

  dropSurfaceElement?.addEventListener('dragleave', () => {
    dropSurfaceElement.classList.remove(DROP_ACTIVE_CLASS_NAME);
  });

  dropSurfaceElement?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropSurfaceElement.classList.remove(DROP_ACTIVE_CLASS_NAME);

    const fileItems = Array.from(event.dataTransfer?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);

    const files = fileItems.length
      ? fileItems
      : Array.from(event.dataTransfer?.files ?? []);

    void processIncomingFiles(files);
  });

  ui.audioPlayPauseButton?.addEventListener('click', async () => {
    const playbackState = transportController.getPlaybackState();
    if (!playbackState.hasSource) return;

    if (playbackState.status === 'playing') {
      transportController.pause();
    } else {
      await transportController.play();
    }

    controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
  });

  ui.audioStopButton?.addEventListener('click', () => {
    transportController.stop();
    controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
    renderScrubber(transportController.getPlaybackState());
  });

  window.addEventListener('beforeunload', () => {
    appLifecycle.stop();
    analysisEngine.stop();
    visualizationEngine.stop();
    recordingController.dispose();
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

if (ui.panelHideControls?.length) {
  ui.panelHideControls.forEach((hideControl) => {
    hideControl.addEventListener('click', () => {
      const targetId = hideControl.dataset.panelHideTarget;
      if (!targetId) return;
      panelsViewModel.setPanelVisibility(targetId, false);
    });
  });
}

wirePresetButtons(applyAll);
wireAudioControls(applyAll);
wireScrubberInteractions();
wireRecordingControls();
wireSimulationControls({
  ui,
  onSettingsApplied() {
    applyAll();
  },
});

const queueTemplate = document.getElementById('queue-item-template');
if (queueTemplate) {
  queueTemplate.remove();
}

applyAll();
renderQueueList();
renderScrubber(transportController.getPlaybackState());
renderRecordingState(recordingController.getRecordingState());
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
  onQueueNavigate({ direction }) {
    if (direction !== 'next' && direction !== 'previous') return;
    void playQueueOffset({ direction, autoplay: true });
  },
  onSeekRelative({ direction, accelerated }) {
    if (direction !== 1 && direction !== -1) return;

    const playbackState = transportController.getPlaybackState();
    if (!playbackState.hasSource || !Number.isFinite(playbackState.durationSeconds) || playbackState.durationSeconds <= 0) {
      return;
    }

    const seekStepSeconds = accelerated
      ? SCRUBBER_KEYBOARD_ACCELERATED_SEEK_STEP_SECONDS
      : SCRUBBER_KEYBOARD_SEEK_STEP_SECONDS;
    const nextTimeSeconds = playbackState.currentTimeSeconds + (direction * seekStepSeconds);
    transportController.seek(nextTimeSeconds);
    controlsViewModel.projectFromPlayback(transportController.getPlaybackState());
    renderScrubber(transportController.getPlaybackState());
  },
});

appLifecycle.startFrameLoop({
  onFrame: runFrame,
  intervalMs: bandHudPresenter.refreshIntervalMs,
});
