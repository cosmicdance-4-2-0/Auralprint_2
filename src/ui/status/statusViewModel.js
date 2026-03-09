/** Public interface stub for user-visible system status projection. */
export function createStatusViewModel() {
  const state = {
    audioStatus: 'idle',
    dominantBand: {
      index: 0,
      name: '(none)',
      hzRangeText: '',
    },
  };

  function setAudioStatus(status) {
    state.audioStatus = status || 'idle';
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
    setDominantBand,
    getState() {
      const dom = state.dominantBand;
      const dominantBandText = `Dominant: [${dom.index}] ${dom.name}${dom.hzRangeText ? ` — ${dom.hzRangeText}` : ''}`;
      return {
        statusText: `Audio: ${state.audioStatus}`,
        dominantBandText,
        audioStatus: state.audioStatus,
        dominantBand: { ...dom },
      };
    }
  };
}
