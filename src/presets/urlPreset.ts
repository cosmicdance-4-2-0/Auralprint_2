import { deepClone } from '../core/config.js';
import { sanitizePreferences } from '../core/validate.js';

export const PRESET_SCHEMA_VERSION = 1;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(token: string): Uint8Array {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodePreferencesToHash(preferences: unknown): string {
  // Presets intentionally serialize sanitized preferences only.
  // Runtime-only state (queue/recording/permissions) is excluded by design.
  const payload = {
    schema: PRESET_SCHEMA_VERSION,
    preferences: sanitizePreferences(preferences),
  };

  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return `#p=${toBase64Url(bytes)}`;
}

export function decodePreferencesFromHash(hash: string): { ok: boolean; preferences: unknown; reason: string } {
  if (typeof hash !== 'string' || !hash.startsWith('#p=')) {
    return { ok: false, preferences: null, reason: 'No preset hash found.' };
  }

  try {
    const token = hash.slice(3);
    const bytes = fromBase64Url(token);
    const raw = new TextDecoder().decode(bytes);
    const payload = JSON.parse(raw);

    if (!payload || !Number.isInteger(payload.schema)) {
      return { ok: false, preferences: null, reason: 'Preset schema is missing.' };
    }

    if (payload.schema !== PRESET_SCHEMA_VERSION) {
      return { ok: false, preferences: null, reason: `Unsupported schema v${payload.schema}.` };
    }

    const sanitizedPreferences = sanitizePreferences(payload.preferences);
    return { ok: true, preferences: sanitizedPreferences, reason: 'Preset decoded.' };
  } catch {
    return { ok: false, preferences: null, reason: 'Preset payload is invalid.' };
  }
}

export function readCurrentHash(): string {
  return window.location.hash || '';
}

export function writeHash(hash: string): void {
  window.location.hash = hash;
}

export function buildShareLink(hash: string): string {
  const url = new URL(window.location.href);
  url.hash = hash.startsWith('#') ? hash.slice(1) : hash;
  return url.toString();
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
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

export function clonePreferences(input: unknown): unknown {
  return deepClone(input);
}
