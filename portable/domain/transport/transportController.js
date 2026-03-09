/** Public interface stub for Build 113 transport state and commands. */
export function createTransportController() {
  return {
    loadSource() {},
    play() {},
    pause() {},
    seek() {},
    getState() {
      return { playbackState: 'idle' };
    }
  };
}
