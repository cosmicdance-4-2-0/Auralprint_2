/** Public interface stub for playback I/O boundary. */
export function createPlaybackGateway() {
  return {
    connect() {},
    disconnect() {},
    getTiming() {
      return { currentTimeSeconds: 0 };
    }
  };
}
