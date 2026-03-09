import { createBandBank } from '../../bands/bandBank.js';

/** Analyzer orchestrator over AudioEngine sampling and BandBank aggregation. */
export function createAnalysisEngine({ audioEngine = null } = {}) {
  const bandBank = createBandBank({ sourceChannelId: 'C' });
  const state = {
    audioEngine,
    audioSettings: null,
    latestFrame: null,
    running: false,
  };

  function bindAudioEngine(nextAudioEngine) {
    state.audioEngine = nextAudioEngine ?? null;
  }

  function configure({ audio, bands } = {}) {
    if (audio) {
      state.audioSettings = { ...audio };
    }
    if (bands) {
      bandBank.configure({
        floorHz: bands.floorHz,
        ceilingHz: bands.ceilingHz,
        logSpacing: bands.logSpacing,
      });
    }
  }

  function consumeAudioFrame(audioFrame) {
    if (!audioFrame) return null;

    const sampleRate = audioFrame.sampleRateHz || 48000;
    const fftSize = audioFrame.fftSize || state.audioSettings?.fftSize || 2048;
    const bandsSnapshot = bandBank.updateFromAnalysisFrame(audioFrame, {
      sampleRate,
      fftSize,
    });

    state.latestFrame = {
      sampleRateHz: sampleRate,
      fftSize,
      channels: audioFrame.channels,
      monoIsh: audioFrame.monoIsh,
      bands: bandsSnapshot,
    };

    return state.latestFrame;
  }

  function tick() {
    if (!state.running || !state.audioEngine?.sampleAnalysisFrame) return state.latestFrame;
    const audioFrame = state.audioEngine.sampleAnalysisFrame();
    return consumeAudioFrame(audioFrame);
  }

  function reset() {
    state.latestFrame = null;
    bandBank.reset();
  }

  function start() {
    state.running = true;
  }

  function stop() {
    state.running = false;
  }

  return {
    configure,
    reset,
    start,
    stop,
    tick,
    bindAudioEngine,
    consumeAudioFrame,
    getLatestFrame() {
      return state.latestFrame;
    }
  };
}
