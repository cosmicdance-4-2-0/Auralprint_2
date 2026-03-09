/** Public interface stub for user-visible system status projection. */
export function createStatusViewModel() {
  const state = {
    audioStatus: 'idle',
    simPaused: false,
    resetCount: 0,
    dominantBand: {
      index: 0,
      name: '(none)',
      hzRangeText: '',
    },
  };

  function setAudioStatus(status) {
    state.audioStatus = status || 'idle';
  }

  function setSimulationStatus(simulation = {}) {
    state.simPaused = Boolean(simulation.simPaused);
    state.resetCount = Number.isFinite(simulation.resetCount) ? simulation.resetCount : state.resetCount;
  }

  function setDominantBand(dominant) {
    if (!dominant) return;

    state.dominantBand = {
      index: Number.isFinite(dominant.index) ? dominant.index : 0,
      name: dominant.name || '(none)',
      hzRangeText: dominant.hzRangeText || '',
    };
  }

  return {
    setAudioStatus,
    setSimulationStatus,
    setDominantBand,
    getState() {
      const dom = state.dominantBand;
      const dominantBandText = `Dominant: [${dom.index}] ${dom.name}${dom.hzRangeText ? ` — ${dom.hzRangeText}` : ''}`;
      return {
        statusText: `Audio: ${state.audioStatus} | Sim: ${state.simPaused ? 'paused' : 'running'} | Resets: ${state.resetCount}`,
        dominantBandText,
        audioStatus: state.audioStatus,
        simPaused: state.simPaused,
        resetCount: state.resetCount,
        dominantBand: { ...dom },
      };
    }
  };
}
