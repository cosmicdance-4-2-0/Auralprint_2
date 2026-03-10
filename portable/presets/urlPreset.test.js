import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizePreferences } from '../core/validate.js';
import {
  decodePreferencesFromHash,
  encodePreferencesToHash,
  PRESET_SCHEMA_VERSION,
} from './urlPreset.js';
import { BUILD_111_DECODE_FIXTURES } from './urlPreset.decode.fixtures.js';

function encodePayloadToHash(payload) {
  const json = JSON.stringify(payload);
  const token = Buffer.from(json, 'utf8').toString('base64url');
  return `#p=${token}`;
}

test('decodes existing Build 111 fixtures with expected outcomes', () => {
  for (const fixture of BUILD_111_DECODE_FIXTURES) {
    const decoded = decodePreferencesFromHash(fixture.hash);
    assert.equal(decoded.ok, fixture.expectedOk, `${fixture.name}: decode ok mismatch`);

    if (!fixture.expectedOk) {
      assert.equal(decoded.reason, fixture.expectedReason, `${fixture.name}: rejection reason mismatch`);
      continue;
    }

    assert.deepEqual(
      decoded.preferences,
      sanitizePreferences(fixture.sourcePreferences),
      `${fixture.name}: sanitized preferences mismatch`,
    );
  }
});

test('decodes Build 111 wrappers for schema 3/4/5/6 using prefs payload', () => {
  const sourcePreferences = {
    visuals: { backgroundColor: '#123456' },
    particles: { sizeMinPx: 999, sizeMaxPx: 1 },
  };

  for (const schema of [3, 4, 5, 6]) {
    const hash = encodePayloadToHash({ schema, prefs: sourcePreferences });
    const decoded = decodePreferencesFromHash(hash);
    assert.equal(decoded.ok, true, `schema ${schema}: should decode`);
    assert.equal(decoded.reason, 'Preset migrated from legacy schema.', `schema ${schema}: reason mismatch`);
    assert.deepEqual(decoded.preferences, sanitizePreferences(sourcePreferences), `schema ${schema}: preferences mismatch`);
  }
});

test('decodes modern wrapper schema 1 using preferences payload', () => {
  const sourcePreferences = {
    trace: { numLines: 9999, lineColorMode: 'bad' },
    audio: { minRadiusFrac: 0.95, maxRadiusFrac: 0.1 },
  };

  const hash = encodePayloadToHash({ schema: PRESET_SCHEMA_VERSION, preferences: sourcePreferences });
  const decoded = decodePreferencesFromHash(hash);

  assert.equal(decoded.ok, true);
  assert.equal(decoded.reason, 'Preset decoded.');
  assert.deepEqual(decoded.preferences, sanitizePreferences(sourcePreferences));
});

test('rejects unsupported schemas', () => {
  for (const schema of [2, 7, 99]) {
    const hash = encodePayloadToHash({ schema, preferences: { visuals: { backgroundColor: '#ffffff' } } });
    const decoded = decodePreferencesFromHash(hash);
    assert.equal(decoded.ok, false, `schema ${schema}: should reject`);
    assert.equal(decoded.reason, `Unsupported schema v${schema}.`, `schema ${schema}: reason mismatch`);
  }
});

test('encode/decode round-trip preserves sanitized preferences', () => {
  const unsanitized = {
    visuals: { backgroundColor: '#ABCDEF', particleColor: 'oops' },
    trace: { numLines: 9999, lineColorMode: 'not-real' },
    particles: { sizeMinPx: 900, sizeMaxPx: 2, ttlSec: 0.01, sizeToMinSec: 2 },
    audio: { minRadiusFrac: 0.9, maxRadiusFrac: 0.1, fftSize: 123, volume: 2 },
  };

  const expected = sanitizePreferences(unsanitized);
  const encodedHash = encodePreferencesToHash(unsanitized);
  const decoded = decodePreferencesFromHash(encodedHash);

  assert.equal(decoded.ok, true);
  assert.equal(decoded.reason, 'Preset decoded.');
  assert.deepEqual(decoded.preferences, expected);

  const secondPass = decodePreferencesFromHash(encodePreferencesToHash(decoded.preferences));
  assert.equal(secondPass.ok, true);
  assert.deepEqual(secondPass.preferences, expected);
});

test('handles missing wrapper keys for legacy and modern payloads', () => {
  const missingBuild111Prefs = decodePreferencesFromHash(encodePayloadToHash({ schema: 6 }));
  assert.equal(missingBuild111Prefs.ok, false);
  assert.equal(missingBuild111Prefs.reason, 'Preset payload is invalid.');

  const nullBuild111Prefs = decodePreferencesFromHash(encodePayloadToHash({ schema: 4, prefs: null }));
  assert.equal(nullBuild111Prefs.ok, false);
  assert.equal(nullBuild111Prefs.reason, 'Preset payload is invalid.');

  const missingModernPreferences = decodePreferencesFromHash(encodePayloadToHash({ schema: PRESET_SCHEMA_VERSION }));
  assert.equal(missingModernPreferences.ok, true);
  assert.equal(missingModernPreferences.reason, 'Preset decoded.');
  assert.deepEqual(missingModernPreferences.preferences, sanitizePreferences(undefined));
});
