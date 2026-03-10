/** Build 113 transport state and commands over playback gateway. */
export function createTransportController({ playbackGateway = null, onStateChange = null } = {}) {
  const state = {
    playbackState: 'idle',
    hasSource: false,
    currentTimeSeconds: 0,
    durationSeconds: 0,
    source: null,
    lastError: null,
  };

  function projectPlaybackState() {
    if (!playbackGateway) {
      return getState();
    }

    const playback = playbackGateway.getPlaybackState();
    state.playbackState = playback.status || 'idle';
    state.hasSource = Boolean(playback.hasSource);
    state.currentTimeSeconds = Number.isFinite(playback.currentTimeSeconds) ? playback.currentTimeSeconds : 0;
    state.durationSeconds = Number.isFinite(playback.durationSeconds) ? playback.durationSeconds : 0;

    onStateChange?.(getState());
    return getState();
  }

  function setPlaybackGateway(nextGateway) {
    playbackGateway = nextGateway;
    return projectPlaybackState();
  }

  async function loadSource(source, { autoplay = true } = {}) {
    if (!playbackGateway) {
      throw new Error('TransportController requires a playback gateway.');
    }
    if (!source?.file) {
      throw new Error('TransportController.loadSource requires a source with file.');
    }

    state.lastError = null;
    state.source = source;
    playbackGateway.loadSource(source.file);
    projectPlaybackState();

    if (autoplay) {
      try {
        await playbackGateway.play();
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : 'Playback blocked.';
      }
      projectPlaybackState();
    }

    return getState();
  }

  async function play() {
    if (!playbackGateway) return getState();
    state.lastError = null;
    try {
      await playbackGateway.play();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : 'Playback blocked.';
    }
    return projectPlaybackState();
  }

  function pause() {
    playbackGateway?.pause();
    return projectPlaybackState();
  }

  function stop() {
    playbackGateway?.stop();
    return projectPlaybackState();
  }

  function seek(seconds) {
    playbackGateway?.seek(seconds);
    return projectPlaybackState();
  }

  function unload() {
    playbackGateway?.unload();
    state.source = null;
    state.lastError = null;
    return projectPlaybackState();
  }

  function handlePlaybackStatus(status) {
    state.playbackState = status || state.playbackState;
    return projectPlaybackState();
  }

  function getPlaybackState() {
    return playbackGateway?.getPlaybackState() ?? {
      status: 'idle',
      hasSource: false,
      currentTimeSeconds: 0,
      durationSeconds: 0,
    };
  }

  function getState() {
    return {
      playbackState: state.playbackState,
      hasSource: state.hasSource,
      currentTimeSeconds: state.currentTimeSeconds,
      durationSeconds: state.durationSeconds,
      source: state.source,
      lastError: state.lastError,
    };
  }

  return {
    setPlaybackGateway,
    loadSource,
    play,
    pause,
    stop,
    seek,
    unload,
    handlePlaybackStatus,
    projectPlaybackState,
    getPlaybackState,
    getState,
  };
}
