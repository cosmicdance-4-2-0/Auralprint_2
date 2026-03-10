const DEFAULT_CAPTURE_FRAME_RATE = 60;
const DEFAULT_WEBM_MIME_TYPE = 'video/webm';
const WEBM_MIME_CANDIDATES = Object.freeze([
  DEFAULT_WEBM_MIME_TYPE,
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
]);

function canUseMimeType(mimeType) {
  if (typeof MediaRecorder === 'undefined') {
    return false;
  }

  if (typeof MediaRecorder.isTypeSupported !== 'function') {
    return mimeType === DEFAULT_WEBM_MIME_TYPE;
  }

  return MediaRecorder.isTypeSupported(mimeType);
}

function resolveSupportedMimeType(preferredMimeTypes = WEBM_MIME_CANDIDATES) {
  for (const mimeType of preferredMimeTypes) {
    if (canUseMimeType(mimeType)) {
      return mimeType;
    }
  }
  return DEFAULT_WEBM_MIME_TYPE;
}

/** Public interface for capture stream setup and teardown. */
export function createCaptureGateway() {
  function createCaptureStream({ canvasElement, audioTapStream = null, frameRate = DEFAULT_CAPTURE_FRAME_RATE } = {}) {
    if (!(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('CaptureGateway.createCaptureStream requires a render canvas element.');
    }

    if (typeof canvasElement.captureStream !== 'function') {
      throw new Error('CaptureGateway.createCaptureStream requires canvas.captureStream support.');
    }

    const canvasStream = canvasElement.captureStream(frameRate);
    const composedStream = new MediaStream();
    const ownedTracks = [];

    for (const track of canvasStream.getVideoTracks()) {
      composedStream.addTrack(track);
      ownedTracks.push(track);
    }

    if (audioTapStream instanceof MediaStream) {
      for (const track of audioTapStream.getAudioTracks()) {
        const clonedTrack = track.clone();
        composedStream.addTrack(clonedTrack);
        ownedTracks.push(clonedTrack);
      }
    }

    return {
      stream: composedStream,
      mimeType: resolveSupportedMimeType(),
      ownedTracks,
    };
  }

  function releaseCaptureStream(captureSession) {
    if (!captureSession) return;

    const tracks = Array.isArray(captureSession.ownedTracks)
      ? captureSession.ownedTracks
      : captureSession.stream instanceof MediaStream
        ? captureSession.stream.getTracks()
        : [];

    for (const track of tracks) {
      track.stop();
    }
  }

  return {
    createCaptureStream,
    releaseCaptureStream,
  };
}
