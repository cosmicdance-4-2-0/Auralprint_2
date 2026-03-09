import { CONFIG, deepClone } from './config.js';
import { sanitizePreferences } from './validate.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(baseValue, patchValue) {
  if (!isPlainObject(baseValue) || !isPlainObject(patchValue)) {
    return deepClone(patchValue);
  }

  const merged = deepClone(baseValue);
  for (const [key, value] of Object.entries(patchValue)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }
    merged[key] = deepClone(value);
  }

  return merged;
}

export let preferences = deepClone(CONFIG.defaults);

export const runtime = {
  settings: deepClone(CONFIG.defaults),
};

export function resolveRuntimeSettings() {
  runtime.settings = sanitizePreferences(preferences);
  return runtime.settings;
}

export function setPreferences(nextPreferences) {
  preferences = deepClone(nextPreferences);
  return resolveRuntimeSettings();
}

export function patchPreferences(partialPreferences) {
  preferences = deepMerge(preferences, partialPreferences);
  return resolveRuntimeSettings();
}

export function resetPreferences() {
  preferences = deepClone(CONFIG.defaults);
  return resolveRuntimeSettings();
}
