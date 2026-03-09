import { createBandBank } from '../../bands/bandBank.js';

/** Analyzer frame production with BandBank-owned spectral math. */
export function createAnalysisEngine() {
  const bandBank = createBandBank({ sourceChannelId: 'C' });
  const state = {
    audioSettings: null,
    latestFrame: null,
  };

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

  return {
    configure,
    start() {},
    stop() {},
    consumeAudioFrame,
    getLatestFrame() {
      return state.latestFrame;
    }
  };
}
