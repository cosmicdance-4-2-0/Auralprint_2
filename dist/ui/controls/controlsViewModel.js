/** Public interface stub for controls state projection. */
export function createControlsViewModel() {
  return {
    getState() {
      return { canPlay: false, canRecord: false };
    }
  };
}
