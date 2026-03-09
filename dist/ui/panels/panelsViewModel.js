/** Public interface stub for analysis/visualization panel state projection. */
export function createPanelsViewModel() {
  return {
    getState() {
      return { activePanel: 'none' };
    }
  };
}
