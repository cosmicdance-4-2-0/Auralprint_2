import { CONFIG } from '../core/config.js';
import { BAND_NAMES_256 } from './bandNames.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function formatHzRange(lowHz, highHz) {
  return `${Math.round(lowHz)}–${Math.round(highHz)} Hz`;
}

function buildBandEdgesHz({ count, floorHz, ceilingHz, logSpacing }) {
  const edges = new Float32Array(count + 1);
  if (!logSpacing) {
    const width = (ceilingHz - floorHz) / count;
    for (let i = 0; i <= count; i += 1) {
      edges[i] = floorHz + width * i;
    }
    return edges;
  }

  const low = Math.max(1, floorHz);
  const ratio = Math.pow(ceilingHz / low, 1 / count);
  for (let i = 0; i <= count; i += 1) {
    edges[i] = low * Math.pow(ratio, i);
  }
  edges[0] = floorHz;
  edges[count] = ceilingHz;
  return edges;
}

export function createBandBank({ sourceChannelId = 'C' } = {}) {
  const defaults = CONFIG.defaults.bands;
  const count = defaults.count;

  const state = {
    sourceChannelId,
    metadata: {
      sampleRate: 0,
      nyquistHz: 0,
      configuredCeilingHz: defaults.ceilingHz,
      effectiveCeilingHz: defaults.ceilingHz,
      floorHz: defaults.floorHz,
      logSpacing: defaults.logSpacing,
    },
    names: BAND_NAMES_256.slice(0, count),
    lowHz: new Float32Array(count),
    highHz: new Float32Array(count),
    binStart: new Int32Array(count),
    binEndExclusive: new Int32Array(count),
    energies01: new Float32Array(count),
    dominant: { index: 0, name: BAND_NAMES_256[0], hzRangeText: '' },
  };

  function configure({ floorHz, ceilingHz, logSpacing } = {}) {
    if (Number.isFinite(floorHz)) state.metadata.floorHz = Math.max(1, floorHz);
    if (Number.isFinite(ceilingHz)) state.metadata.configuredCeilingHz = Math.max(state.metadata.floorHz + 1, ceilingHz);
    if (typeof logSpacing === 'boolean') state.metadata.logSpacing = logSpacing;
  }

  function refreshLayout(sampleRate, fftSize) {
    const nyquistHz = sampleRate * 0.5;
    const effectiveCeilingHz = Math.min(state.metadata.configuredCeilingHz, nyquistHz);
    const effectiveFloorHz = Math.min(state.metadata.floorHz, Math.max(1, effectiveCeilingHz - 1));

    state.metadata.sampleRate = sampleRate;
    state.metadata.nyquistHz = nyquistHz;
    state.metadata.effectiveCeilingHz = effectiveCeilingHz;

    const edgesHz = buildBandEdgesHz({
      count,
      floorHz: effectiveFloorHz,
      ceilingHz: effectiveCeilingHz,
      logSpacing: state.metadata.logSpacing,
    });

    const binHz = sampleRate / fftSize;
    const maxBin = Math.floor(fftSize * 0.5) - 1;

    for (let i = 0; i < count; i += 1) {
      const lowHz = edgesHz[i];
      const highHz = edgesHz[i + 1];
      state.lowHz[i] = lowHz;
      state.highHz[i] = highHz;

      const start = Math.max(0, Math.min(maxBin, Math.floor(lowHz / binHz)));
      const endExclusiveRaw = Math.ceil(highHz / binHz);
      const endExclusive = Math.max(start + 1, Math.min(maxBin + 1, endExclusiveRaw));
      state.binStart[i] = start;
      state.binEndExclusive[i] = endExclusive;
    }
  }

  function updateFromAnalysisFrame(analysisFrame, { sampleRate, fftSize, dbMin = -100, dbMax = -30 }) {
    if (!analysisFrame?.channels) return null;

    const sourceChannel = analysisFrame.channels[state.sourceChannelId] ?? analysisFrame.channels.L;
    const spectrumDb = sourceChannel?.spectrumDb;
    if (!spectrumDb) return null;

    refreshLayout(sampleRate, fftSize);

    let dominantIndex = 0;
    let dominantEnergy = -1;
    const dbRange = Math.max(1e-6, dbMax - dbMin);

    for (let bandIndex = 0; bandIndex < count; bandIndex += 1) {
      const start = state.binStart[bandIndex];
      const endExclusive = state.binEndExclusive[bandIndex];
      let sum = 0;
      let samples = 0;

      for (let bin = start; bin < endExclusive; bin += 1) {
        const db = spectrumDb[bin];
        const normalized = clamp01((db - dbMin) / dbRange);
        sum += normalized;
        samples += 1;
      }

      const avg = samples > 0 ? sum / samples : 0;
      state.energies01[bandIndex] = avg;
      if (avg > dominantEnergy) {
        dominantEnergy = avg;
        dominantIndex = bandIndex;
      }
    }

    state.dominant = {
      index: dominantIndex,
      name: state.names[dominantIndex] ?? `Band ${dominantIndex}`,
      hzRangeText: formatHzRange(state.lowHz[dominantIndex], state.highHz[dominantIndex]),
    };

    return getSnapshot();
  }

  function getSnapshot() {
    return {
      energies01: state.energies01,
      lowHz: state.lowHz,
      highHz: state.highHz,
      names: state.names,
      dominant: { ...state.dominant },
      metadata: { ...state.metadata },
    };
  }

  function reset() {
    state.energies01.fill(0);
    state.dominant = { index: 0, name: state.names[0] ?? 'Band 0', hzRangeText: '' };
  }

  return {
    configure,
    updateFromAnalysisFrame,
    getSnapshot,
    reset,
  };
}
