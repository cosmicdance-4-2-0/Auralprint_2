const DEFAULT_MIME_TYPE = 'video/webm';
const DEFAULT_FILENAME_BASE = 'auralprint-capture';

function resolveExtensionFromMimeType(mimeType) {
  if (typeof mimeType === 'string' && mimeType.includes('mp4')) {
    return 'mp4';
  }
  if (typeof mimeType === 'string' && mimeType.includes('webm')) {
    return 'webm';
  }
  return 'bin';
}

function createTimestampToken(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

/** Public interface for packaging and downloading captured output. */
export function createExportGateway({ host = window } = {}) {
  let activeArtifact = null;

  function revokeArtifact(artifact = activeArtifact) {
    if (artifact?.url) {
      URL.revokeObjectURL(artifact.url);
    }

    if (!artifact || artifact === activeArtifact) {
      activeArtifact = null;
    }
  }

  function createDownloadableArtifact({ blob, mimeType = DEFAULT_MIME_TYPE, fileNameBase = DEFAULT_FILENAME_BASE } = {}) {
    if (!(blob instanceof Blob)) {
      throw new Error('ExportGateway.createDownloadableArtifact requires a Blob.');
    }

    revokeArtifact();

    const extension = resolveExtensionFromMimeType(mimeType);
    const fileName = `${fileNameBase}-${createTimestampToken()}.${extension}`;
    const url = URL.createObjectURL(blob);

    activeArtifact = {
      blob,
      mimeType,
      fileName,
      url,
      byteLength: blob.size,
    };

    return { ...activeArtifact };
  }

  function getActiveArtifact() {
    return activeArtifact ? { ...activeArtifact } : null;
  }

  host?.addEventListener?.('beforeunload', () => {
    revokeArtifact();
  });

  return {
    createDownloadableArtifact,
    revokeArtifact,
    getActiveArtifact,
  };
}
