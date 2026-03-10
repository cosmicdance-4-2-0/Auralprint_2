import { deepClone } from '../core/config.js';
import { sanitizePreferences } from '../core/validate.js';

export const PRESET_SCHEMA_VERSION = 1;

const LEGACY_SCHEMA_VERSION = 0;
const BUILD_111_CANONICAL_SCHEMA_VERSION = 6;
const BUILD_111_SUPPORTED_SCHEMA_VERSIONS = new Set([6, 5, 4, 3]);

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(token) {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodePreferencesToHash(preferences) {
  const payload = {
    schema: PRESET_SCHEMA_VERSION,
    preferences: sanitizePreferences(preferences),
  };

  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return `#p=${toBase64Url(bytes)}`;
}

export function decodePreferencesFromHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#p=')) {
    return { ok: false, preferences: null, reason: 'No preset hash found.' };
  }

  try {
    const token = hash.slice(3);
    const bytes = fromBase64Url(token);
    const raw = new TextDecoder().decode(bytes);
    const payload = JSON.parse(raw);

    const migrated = migratePayloadToCurrentSchema(payload);
    if (!migrated.ok) {
      return { ok: false, preferences: null, reason: migrated.reason };
    }

    const sanitizedPreferences = sanitizePreferences(migrated.preferences);
    return { ok: true, preferences: sanitizedPreferences, reason: migrated.reason };
  } catch {
    return { ok: false, preferences: null, reason: 'Preset payload is invalid.' };
  }
}

function migratePayloadToCurrentSchema(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, preferences: null, reason: 'Preset payload is invalid.' };
  }

  const schema = payload.schema;

  if (schema === PRESET_SCHEMA_VERSION) {
    return { ok: true, preferences: payload.preferences, reason: 'Preset decoded.' };
  }

  if (schema === LEGACY_SCHEMA_VERSION) {
    return { ok: true, preferences: payload.preferences, reason: 'Preset migrated from legacy schema.' };
  }

  // Build 111 canonical wrapper: { schema: 6, prefs: { ... } }
  // Build 111 also accepted inbound v3-v5 wrappers for compatibility.
  if (Number.isInteger(schema) && BUILD_111_SUPPORTED_SCHEMA_VERSIONS.has(schema)) {
    if (payload.prefs && typeof payload.prefs === 'object') {
      return { ok: true, preferences: payload.prefs, reason: 'Preset migrated from legacy schema.' };
    }
    return { ok: false, preferences: null, reason: 'Preset payload is invalid.' };
  }

  // Legacy wrapper without explicit schema occasionally appears in copied payloads.
  if (payload.prefs && typeof payload.prefs === 'object' && !Number.isInteger(schema)) {
    return {
      ok: true,
      preferences: payload.prefs,
      reason: `Preset migrated from Build ${BUILD_111_CANONICAL_SCHEMA_VERSION} wrapper.`,
    };
  }

  // Legacy unwrapped payloads encoded preferences directly.
  if (!Number.isInteger(schema)) {
    return { ok: true, preferences: payload, reason: 'Preset migrated from legacy schema.' };
  }

  return { ok: false, preferences: null, reason: `Unsupported schema v${payload.schema}.` };
}

export function readCurrentHash() {
  return window.location.hash || '';
}

export function writeHash(hash) {
  window.location.hash = hash;
}

export function buildShareLink(hash) {
  const url = new URL(window.location.href);
  url.hash = hash.startsWith('#') ? hash.slice(1) : hash;
  return url.toString();
}

export async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function clonePreferences(input) {
  return deepClone(input);
}
