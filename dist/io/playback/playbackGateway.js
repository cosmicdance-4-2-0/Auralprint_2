/** Playback gateway as a thin adapter over audio engine transport/timing. */
export function createPlaybackGateway({ audioEngine = null } = {}) {
  let engine = audioEngine;

  function requireEngine() {
    if (!engine) {
      throw new Error('PlaybackGateway is not connected to an audio engine.');
    }
    return engine;
  }

  function connect(nextEngine) {
    engine = nextEngine;
    return getPlaybackState();
  }

  function disconnect() {
    engine = null;
  }

  function loadSource(file) {
    return requireEngine().loadFile(file);
  }

  async function play() {
    return requireEngine().play();
  }

  function pause() {
    requireEngine().pause();
  }

  function stop() {
    requireEngine().stop();
  }

  function seek(seconds) {
    requireEngine().seekTo(seconds);
  }

  function unload() {
    requireEngine().unload();
  }

  function getPlaybackState() {
    if (!engine) {
      return {
        status: 'idle',
        hasSource: false,
        currentTimeSeconds: 0,
        durationSeconds: 0,
      };
    }
    return engine.getPlaybackState();
  }

  function getTiming() {
    const playback = getPlaybackState();
    return {
      currentTimeSeconds: playback.currentTimeSeconds || 0,
      durationSeconds: playback.durationSeconds || 0,
      playbackStatus: playback.status || 'idle',
      hasSource: Boolean(playback.hasSource),
    };
  }

  return {
    connect,
    disconnect,
    loadSource,
    play,
    pause,
    stop,
    seek,
    unload,
    getPlaybackState,
    getTiming,
  };
}
