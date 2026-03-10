const DEFAULT_ALLOWED_PREFIX = 'audio/';

function normalizeFileName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || 'Untitled track';
}

function readAudioDurationSeconds(file) {
  return new Promise((resolve) => {
    const probe = new Audio();
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(objectUrl);
    };

    probe.preload = 'metadata';

    probe.addEventListener('loadedmetadata', () => {
      const durationSeconds = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0;
      cleanup();
      resolve(durationSeconds);
    }, { once: true });

    probe.addEventListener('error', () => {
      cleanup();
      resolve(0);
    }, { once: true });

    probe.src = objectUrl;
  });
}

/** Public interface for decoding/loading source audio metadata. */
export function createDecodeGateway({ acceptedMimePrefix = DEFAULT_ALLOWED_PREFIX } = {}) {
  function validateFile(file) {
    if (!(file instanceof File)) {
      return { ok: false, reason: 'Input is not a File.' };
    }

    if (!file.size) {
      return { ok: false, reason: 'File is empty.' };
    }

    if (acceptedMimePrefix && typeof file.type === 'string' && file.type && !file.type.startsWith(acceptedMimePrefix)) {
      return { ok: false, reason: 'File is not a supported audio type.' };
    }

    return { ok: true };
  }

  async function decodeFile(file) {
    const validation = validateFile(file);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, file };
    }

    const durationSeconds = await readAudioDurationSeconds(file);
    const metadata = {
      name: normalizeFileName(file.name),
      type: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      durationSeconds,
      lastModifiedMs: Number.isFinite(file.lastModified) ? file.lastModified : 0,
    };

    return {
      ok: true,
      file,
      metadata,
    };
  }

  async function decodeFiles(files = []) {
    const list = Array.isArray(files) ? files : Array.from(files);
    const results = await Promise.all(list.map((file) => decodeFile(file)));

    return {
      accepted: results.filter((result) => result.ok),
      rejected: results.filter((result) => !result.ok),
    };
  }

  function clear() {}

  return {
    validateFile,
    decodeFile,
    decodeFiles,
    clear,
  };
}
