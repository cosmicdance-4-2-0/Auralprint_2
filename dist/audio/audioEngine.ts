import { CONFIG } from '../core/config.js';

const CHANNEL_IDS = Object.freeze({
  LEFT: 'L',
  RIGHT: 'R',
  CENTER: 'C',
});

const AUDIO_STATUS = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ENDED: 'ended',
});

function createEmptyChannelFrame(fftSize) {
  return { waveform: new Float32Array(fftSize), rms: 0, energy01: 0 };
}

function computeRms(waveform) {
  let sum = 0;
  for (let i = 0; i < waveform.length; i += 1) {
    sum += waveform[i] * waveform[i];
  }
  return waveform.length > 0 ? Math.sqrt(sum / waveform.length) : 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function correlationCoefficient(leftWaveform, rightWaveform, stride) {
  let dot = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;

  for (let i = 0; i < leftWaveform.length; i += stride) {
    const l = leftWaveform[i];
    const r = rightWaveform[i];
    dot += l * r;
    leftEnergy += l * l;
    rightEnergy += r * r;
  }

  if (leftEnergy <= 0 || rightEnergy <= 0) {
    return 0;
  }

  return dot / Math.sqrt(leftEnergy * rightEnergy);
}

export function createAudioEngine({ onStatusChange } = {}) {
  const defaults = CONFIG.defaults.audio;

  const state = {
    context: null,
    mediaElement: null,
    mediaSource: null,
    splitter: null,
    merger: null,
    analysisMerger: null,
    leftAnalyser: null,
    rightAnalyser: null,
    centerAnalyser: null,
    playbackGain: null,
    analysisTapGain: null,
    recordingTapDestination: null,
    centerFallbackToLeftGain: null,
    centerFallbackToRightGain: null,
    audioObjectUrl: null,
    endedHandler: null,
    fftSize: defaults.fftSize,
    smoothingTimeConstant: defaults.smoothingTimeConstant,
    rmsGain: defaults.rmsGain,
    monoIsh: { isMonoIsh: false, correlation: 0, rightEffectivelySilent: false },
    thresholds: {
      rightSilenceRms: 0.0005,
      correlationStride: 8,
      monoThreshold: 0.985,
    },
    status: AUDIO_STATUS.IDLE,
  };

  function emitStatus(status) {
    state.status = status;
    onStatusChange?.(status);
  }

  function ensureAudioContext() {
    if (!state.context) {
      state.context = new AudioContext();
    }
    return state.context;
  }

  function ensureMediaElement() {
    if (!state.mediaElement) {
      state.mediaElement = new Audio();
      state.mediaElement.preload = 'metadata';
      state.mediaElement.crossOrigin = 'anonymous';
    }
    return state.mediaElement;
  }

  function createAnalysisGraph() {
    const context = ensureAudioContext();
    const mediaElement = ensureMediaElement();

    state.mediaSource = context.createMediaElementSource(mediaElement);
    state.splitter = context.createChannelSplitter(2);
    state.merger = context.createChannelMerger(2);
    state.analysisMerger = context.createChannelMerger(1);

    state.leftAnalyser = context.createAnalyser();
    state.rightAnalyser = context.createAnalyser();
    state.centerAnalyser = context.createAnalyser();

    state.playbackGain = context.createGain();
    state.analysisTapGain = context.createGain();
    state.recordingTapDestination = context.createMediaStreamDestination();

    const analysers = [state.leftAnalyser, state.rightAnalyser, state.centerAnalyser];
    for (const analyser of analysers) {
      analyser.fftSize = state.fftSize;
      analyser.smoothingTimeConstant = state.smoothingTimeConstant;
    }

    state.centerFallbackToLeftGain = context.createGain();
    state.centerFallbackToRightGain = context.createGain();
    state.centerFallbackToLeftGain.gain.value = 0.5;
    state.centerFallbackToRightGain.gain.value = 0.5;

    state.mediaSource.connect(state.playbackGain);
    state.playbackGain.connect(context.destination);

    state.mediaSource.connect(state.analysisTapGain);
    state.analysisTapGain.gain.value = 1;
    state.analysisTapGain.connect(state.recordingTapDestination);

    state.mediaSource.connect(state.splitter);
    state.splitter.connect(state.leftAnalyser, 0);
    state.splitter.connect(state.rightAnalyser, 1);

    state.splitter.connect(state.centerFallbackToLeftGain, 0);
    state.splitter.connect(state.centerFallbackToRightGain, 1);
    state.centerFallbackToLeftGain.connect(state.analysisMerger, 0, 0);
    state.centerFallbackToRightGain.connect(state.analysisMerger, 0, 0);
    state.analysisMerger.connect(state.centerAnalyser);

    state.splitter.connect(state.merger, 0, 0);
    state.splitter.connect(state.merger, 1, 1);
  }

  function resetAnalysisState() {
    state.monoIsh = { isMonoIsh: false, correlation: 0, rightEffectivelySilent: false };
  }

  function detachMediaListeners() {
    if (state.mediaElement && state.endedHandler) {
      state.mediaElement.removeEventListener('ended', state.endedHandler);
      state.endedHandler = null;
    }
  }

  function revokeObjectUrl() {
    if (state.audioObjectUrl) {
      URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = null;
    }
  }

  function clearMediaSourceUrl() {
    if (state.mediaElement) {
      state.mediaElement.pause();
      state.mediaElement.removeAttribute('src');
      state.mediaElement.load();
    }
  }

  function loadFile(file) {
    if (!file) {
      throw new Error('AudioEngine.loadFile requires a File.');
    }

    if (!state.mediaSource) {
      createAnalysisGraph();
    }

    stop();
    detachMediaListeners();
    clearMediaSourceUrl();
    revokeObjectUrl();

    const mediaElement = ensureMediaElement();
    const objectUrl = URL.createObjectURL(file);
    state.audioObjectUrl = objectUrl;

    mediaElement.src = objectUrl;
    mediaElement.loop = defaults.loop;
    mediaElement.muted = defaults.muted;
    mediaElement.volume = defaults.volume;

    state.endedHandler = () => emitStatus(AUDIO_STATUS.ENDED);
    mediaElement.addEventListener('ended', state.endedHandler);

    resetAnalysisState();
    emitStatus(AUDIO_STATUS.READY);
  }

  async function play() {
    if (!state.mediaElement || !state.mediaElement.src) return;
    await ensureAudioContext().resume();
    await state.mediaElement.play();
    emitStatus(AUDIO_STATUS.PLAYING);
  }

  function pause() {
    if (!state.mediaElement) return;
    state.mediaElement.pause();
    emitStatus(AUDIO_STATUS.PAUSED);
  }

  function stop() {
    if (!state.mediaElement) return;
    state.mediaElement.pause();
    state.mediaElement.currentTime = 0;
    emitStatus(AUDIO_STATUS.READY);
  }

  function setPlaybackLoop(loop) {
    if (state.mediaElement) {
      state.mediaElement.loop = loop;
    }
  }

  function setPlaybackMuted(muted) {
    if (state.mediaElement) {
      state.mediaElement.muted = muted;
    }
  }

  function setPlaybackVolume(volume01) {
    if (state.mediaElement) {
      state.mediaElement.volume = clamp01(volume01);
    }
  }

  function setAnalysisConfig({ fftSize, smoothingTimeConstant, rmsGain } = {}) {
    if (Number.isFinite(fftSize) && CONFIG.limits.audio.fftSizes.includes(fftSize)) {
      state.fftSize = fftSize;
    }
    if (Number.isFinite(smoothingTimeConstant)) {
      state.smoothingTimeConstant = clamp01(smoothingTimeConstant);
    }
    if (Number.isFinite(rmsGain)) {
      state.rmsGain = Math.max(0, rmsGain);
    }

    for (const analyser of [state.leftAnalyser, state.rightAnalyser, state.centerAnalyser]) {
      if (!analyser) continue;
      analyser.fftSize = state.fftSize;
      analyser.smoothingTimeConstant = state.smoothingTimeConstant;
    }
  }

  function setMonoIshConfig({ rightSilenceRms, correlationStride, monoThreshold } = {}) {
    if (Number.isFinite(rightSilenceRms) && rightSilenceRms >= 0) {
      state.thresholds.rightSilenceRms = rightSilenceRms;
    }
    if (Number.isFinite(correlationStride) && correlationStride >= 1) {
      state.thresholds.correlationStride = Math.floor(correlationStride);
    }
    if (Number.isFinite(monoThreshold)) {
      state.thresholds.monoThreshold = clamp01(monoThreshold);
    }
  }

  function sampleAnalysisFrame() {
    if (!state.leftAnalyser || !state.rightAnalyser || !state.centerAnalyser) {
      return {
        channels: {
          [CHANNEL_IDS.LEFT]: createEmptyChannelFrame(state.fftSize),
          [CHANNEL_IDS.RIGHT]: createEmptyChannelFrame(state.fftSize),
          [CHANNEL_IDS.CENTER]: createEmptyChannelFrame(state.fftSize),
        },
        monoIsh: { ...state.monoIsh },
      };
    }

    const leftWaveform = new Float32Array(state.leftAnalyser.fftSize);
    const rightWaveform = new Float32Array(state.rightAnalyser.fftSize);
    const centerWaveform = new Float32Array(state.centerAnalyser.fftSize);

    state.leftAnalyser.getFloatTimeDomainData(leftWaveform);
    state.rightAnalyser.getFloatTimeDomainData(rightWaveform);
    state.centerAnalyser.getFloatTimeDomainData(centerWaveform);

    const leftRms = computeRms(leftWaveform);
    const rightRms = computeRms(rightWaveform);
    const centerRms = computeRms(centerWaveform);

    const rightEffectivelySilent = rightRms <= state.thresholds.rightSilenceRms;
    const correlation = correlationCoefficient(leftWaveform, rightWaveform, state.thresholds.correlationStride);
    const isMonoIsh = rightEffectivelySilent || correlation >= state.thresholds.monoThreshold;

    state.monoIsh = { isMonoIsh, correlation, rightEffectivelySilent };

    return {
      channels: {
        [CHANNEL_IDS.LEFT]: { waveform: leftWaveform, rms: leftRms, energy01: clamp01(leftRms * state.rmsGain) },
        [CHANNEL_IDS.RIGHT]: { waveform: rightWaveform, rms: rightRms, energy01: clamp01(rightRms * state.rmsGain) },
        [CHANNEL_IDS.CENTER]: { waveform: centerWaveform, rms: centerRms, energy01: clamp01(centerRms * state.rmsGain) },
      },
      monoIsh: { ...state.monoIsh },
    };
  }

  function getRecordingTapStream() {
    return state.recordingTapDestination?.stream ?? null;
  }

  function getPlaybackState() {
    return {
      status: state.status,
      hasSource: Boolean(state.mediaElement?.src),
      loop: state.mediaElement?.loop ?? defaults.loop,
      muted: state.mediaElement?.muted ?? defaults.muted,
      volume: state.mediaElement?.volume ?? defaults.volume,
      currentTimeSeconds: state.mediaElement?.currentTime ?? 0,
      durationSeconds: state.mediaElement?.duration ?? 0,
      monoIsh: { ...state.monoIsh },
    };
  }

  function unload() {
    stop();
    detachMediaListeners();
    clearMediaSourceUrl();
    revokeObjectUrl();
    resetAnalysisState();
    emitStatus(AUDIO_STATUS.IDLE);
  }

  async function dispose() {
    unload();
    if (state.context && state.context.state !== 'closed') {
      await state.context.close();
    }
  }

  return {
    loadFile,
    play,
    pause,
    stop,
    setPlaybackLoop,
    setPlaybackMuted,
    setPlaybackVolume,
    // Playback-only controls: analysis taps keep full-level signal for correctness and future capture.
    setAnalysisConfig,
    setMonoIshConfig,
    sampleAnalysisFrame,
    getPlaybackState,
    getRecordingTapStream,
    unload,
    dispose,
  };
}
