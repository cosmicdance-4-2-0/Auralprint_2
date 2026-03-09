/** Public interface stub for user-visible system status projection. */
export function createStatusViewModel() {
  return {
    getState() {
      return { statusText: 'idle' };
    }
  };
}
