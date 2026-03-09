/** User-visible system status projection. */
export function createStatusViewModel() {
  let state = {
    audioStatus: 'idle',
    simPaused: false,
    resetCount: 0,
    dominantBand: {
      index: 0,
      name: '(none)',
      hzRangeText: '',
    },
  };

  const listeners = new Set();

  function getState() {
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

  function emitChange() {
    const snapshot = getState();
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function setAudioStatus(status) {
    state = {
      ...state,
      audioStatus: status || 'idle',
    };
    emitChange();
  }

  function setSimulationStatus(simulation = {}) {
    state = {
      ...state,
      simPaused: Boolean(simulation.simPaused),
      resetCount: Number.isFinite(simulation.resetCount) ? simulation.resetCount : state.resetCount,
    };
    emitChange();
  }

  function setDominantBand(dominant) {
    if (!dominant) return;

    state = {
      ...state,
      dominantBand: {
        index: Number.isFinite(dominant.index) ? dominant.index : 0,
        name: dominant.name || '(none)',
        hzRangeText: dominant.hzRangeText || '',
      },
    };
    emitChange();
  }

  return {
    setAudioStatus,
    setSimulationStatus,
    setDominantBand,
    getState,
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
  };
}
