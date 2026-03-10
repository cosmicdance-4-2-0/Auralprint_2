import test from 'node:test';
import assert from 'node:assert/strict';

import { createExportGateway } from './exportGateway.js';

test('createDownloadableArtifact uses .webm for video/webm mime type', () => {
  const gateway = createExportGateway({ host: null });
  const artifact = gateway.createDownloadableArtifact({
    blob: new Blob(['sample'], { type: 'video/webm' }),
    mimeType: 'video/webm',
    fileNameBase: 'capture',
  });

  assert.match(artifact.fileName, /^capture-.*\.webm$/);
  gateway.revokeArtifact(artifact);
});

test('createDownloadableArtifact uses .mp4 for video/mp4 mime types', () => {
  const gateway = createExportGateway({ host: null });

  for (const mimeType of ['video/mp4', 'video/mp4;codecs=avc1']) {
    const artifact = gateway.createDownloadableArtifact({
      blob: new Blob(['sample'], { type: mimeType }),
      mimeType,
      fileNameBase: 'capture',
    });

    assert.match(artifact.fileName, /^capture-.*\.mp4$/);
    gateway.revokeArtifact(artifact);
  }
});

test('createDownloadableArtifact falls back to .bin for unknown mime type', () => {
  const gateway = createExportGateway({ host: null });
  const artifact = gateway.createDownloadableArtifact({
    blob: new Blob(['sample'], { type: 'application/octet-stream' }),
    mimeType: 'application/octet-stream',
    fileNameBase: 'capture',
  });

  assert.match(artifact.fileName, /^capture-.*\.bin$/);
  gateway.revokeArtifact(artifact);
});
