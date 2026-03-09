/** Controls projection for audio transport + recording affordances. */
export function createControlsViewModel() {
  let state = {
    audioStatus: 'idle',
    hasSource: false,
    canPlay: false,
    canPause: false,
    canStop: false,
    canRecord: false,
    playButtonLabel: 'Play',
    loopPressed: false,
    mutePressed: false,
    volumePercent: 100,
  };

  const listeners = new Set();

  function emitChange() {
    const snapshot = getState();
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function projectFromPlayback(playbackState = {}) {
    const status = playbackState.status || state.audioStatus;
    const hasSource = Boolean(playbackState.hasSource);
    const isPlaying = status === 'playing';

    state = {
      ...state,
      audioStatus: status,
      hasSource,
      canPlay: hasSource,
      canPause: hasSource && isPlaying,
      canStop: hasSource,
      canRecord: hasSource,
      playButtonLabel: isPlaying ? 'Pause' : 'Play',
      loopPressed: Boolean(playbackState.loop),
      mutePressed: Boolean(playbackState.muted),
      volumePercent: Math.round((playbackState.volume ?? 1) * 100),
    };

    emitChange();
  }

  function setAudioStatus(status) {
    projectFromPlayback({
      status,
      hasSource: state.hasSource,
      loop: state.loopPressed,
      muted: state.mutePressed,
      volume: state.volumePercent / 100,
    });
  }

  function getState() {
    return { ...state };
  }

  return {
    getState,
    setAudioStatus,
    projectFromPlayback,
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
  };
}
