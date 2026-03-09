/** Public interface stub for analyzer frame production. */
export function createAnalysisEngine() {
  return {
    configure() {},
    start() {},
    stop() {},
    getLatestFrame() {
      return null;
    }
  };
}
