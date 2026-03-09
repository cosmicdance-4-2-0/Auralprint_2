/** Public interface stub for preset-worthy configuration persistence. */
export function createPresetStore() {
  return {
    loadPreset() {},
    savePreset() {},
    listPresets() {
      return [];
    }
  };
}
