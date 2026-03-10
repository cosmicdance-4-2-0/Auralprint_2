import assert from 'node:assert/strict';

import { sanitizePreferences } from '../src/core/validate.js';
import { decodePreferencesFromHash, encodePreferencesToHash } from '../src/presets/urlPreset.js';
import { BUILD_111_DECODE_FIXTURES } from '../src/presets/urlPreset.decode.fixtures.js';

for (const fixture of BUILD_111_DECODE_FIXTURES) {
  const decoded = decodePreferencesFromHash(fixture.hash);

  assert.equal(decoded.ok, fixture.expectedOk, `${fixture.name}: decode ok mismatch`);

  if (!fixture.expectedOk) {
    assert.equal(decoded.reason, fixture.expectedReason, `${fixture.name}: rejection reason mismatch`);
    continue;
  }

  const expectedSanitized = sanitizePreferences(fixture.sourcePreferences);
  assert.deepEqual(decoded.preferences, expectedSanitized, `${fixture.name}: decoded sanitization mismatch`);

  const roundTripHash = encodePreferencesToHash(decoded.preferences);
  const roundTripDecoded = decodePreferencesFromHash(roundTripHash);
  assert.equal(roundTripDecoded.ok, true, `${fixture.name}: round-trip decode failed`);
  assert.equal(roundTripDecoded.reason, 'Preset decoded.', `${fixture.name}: round-trip reason mismatch`);
  assert.deepEqual(roundTripDecoded.preferences, expectedSanitized, `${fixture.name}: round-trip sanitization mismatch`);
}

console.log(`Verified ${BUILD_111_DECODE_FIXTURES.length} URL preset migration fixture(s).`);
