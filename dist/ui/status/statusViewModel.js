function formatDominantSummary(dominant) {
  if (!dominant) {
    return 'Dominant band: (none)';
  }

  return `Dominant band: [${dominant.index}] ${dominant.name} — ${dominant.hzRangeText}`;
}

function formatAnalysisSummary({ dominant, monoIsh }) {
  const channelSummary = monoIsh?.isMonoIsh ? 'mono-ish (L≈R)' : 'stereo (L≠R)';
  if (!dominant) {
    return `Analysis summary: ${channelSummary} · dominant unavailable`;
  }

  return `Analysis summary: ${channelSummary} · [${dominant.index}] ${dominant.name}`;
}

export function createStatusViewModel() {
  const state = {
    audioStatus: 'idle',
    dominant: null,
    monoIsh: null,
  };

  function setAudioStatus(status) {
    state.audioStatus = status;
  }

  function setDominantBand(dominant) {
    state.dominant = dominant ? { ...dominant } : null;
  }

  function setMonoIsh(monoIsh) {
    state.monoIsh = monoIsh ? { ...monoIsh } : null;
  }

  function getState() {
    return {
      audioStatusText: `Audio status: ${state.audioStatus}`,
      liveStatusText: formatDominantSummary(state.dominant),
      analysisSummaryText: formatAnalysisSummary(state),
    };
  }

  return {
    setAudioStatus,
    setDominantBand,
    setMonoIsh,
    getState,
  };
}
