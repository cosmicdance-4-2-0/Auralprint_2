const STATUS = Object.freeze({
  IDLE: 'idle',
  RECORDING: 'recording',
  STOPPING: 'stopping',
});

const STATUS_PREFIX = 'Recording status:';
const TIMER_INTERVAL_MS = 250;
const DEFAULT_MIME_TYPE = 'video/webm';

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Capture lifecycle controller using MediaRecorder (Build 113). */
export function createRecordingController({
  captureGateway,
  exportGateway,
  onStateChange,
  now = () => performance.now(),
} = {}) {
  const state = {
    status: STATUS.IDLE,
    statusText: `${STATUS_PREFIX} idle`,
    startedAtMs: 0,
    elapsedMs: 0,
    latestDurationMs: 0,
    mimeType: DEFAULT_MIME_TYPE,
    artifact: null,
    lastError: null,
  };

  const runtime = {
    captureSession: null,
    recorder: null,
    chunks: [],
    timerId: null,
    recorderListeners: null,
  };

  function emitState() {
    onStateChange?.(getRecordingState());
  }

  function updateStatusText() {
    if (state.status === STATUS.RECORDING) {
      state.statusText = `${STATUS_PREFIX} recording ${formatDuration(state.elapsedMs)}`;
      return;
    }

    if (state.status === STATUS.STOPPING) {
      state.statusText = `${STATUS_PREFIX} stopping…`;
      return;
    }

    if (state.latestDurationMs > 0) {
      state.statusText = `${STATUS_PREFIX} idle (last ${formatDuration(state.latestDurationMs)})`;
      return;
    }

    if (state.lastError?.message) {
      state.statusText = `${STATUS_PREFIX} idle (error: ${state.lastError.message})`;
      return;
    }

    state.statusText = `${STATUS_PREFIX} idle`;
  }

  function toRecordingError(error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unable to start recording.';
    return {
      message,
      atMs: now(),
    };
  }

  function setStatus(nextStatus) {
    state.status = nextStatus;
    updateStatusText();
    emitState();
  }

  function clearTimer() {
    if (runtime.timerId) {
      clearInterval(runtime.timerId);
      runtime.timerId = null;
    }
  }

  function startTimer() {
    clearTimer();
    runtime.timerId = setInterval(() => {
      if (state.status !== STATUS.RECORDING) {
        return;
      }

      state.elapsedMs = Math.max(0, now() - state.startedAtMs);
      updateStatusText();
      emitState();
    }, TIMER_INTERVAL_MS);
  }

  function removeRecorderListeners() {
    if (!runtime.recorder || !runtime.recorderListeners) {
      runtime.recorderListeners = null;
      return;
    }

    const { onDataAvailable, onStop } = runtime.recorderListeners;
    runtime.recorder.removeEventListener('dataavailable', onDataAvailable);
    runtime.recorder.removeEventListener('stop', onStop);
    runtime.recorderListeners = null;
  }

  function releaseCapture() {
    if (runtime.captureSession) {
      captureGateway?.releaseCaptureStream(runtime.captureSession);
      runtime.captureSession = null;
    }
  }

  function finalizeRecording() {
    state.elapsedMs = Math.max(0, now() - state.startedAtMs);
    state.latestDurationMs = state.elapsedMs;

    const mimeType = state.mimeType || DEFAULT_MIME_TYPE;
    const outputBlob = new Blob(runtime.chunks, { type: mimeType });
    runtime.chunks = [];

    state.artifact = outputBlob.size > 0
      ? exportGateway?.createDownloadableArtifact({ blob: outputBlob, mimeType }) ?? null
      : null;
    state.lastError = null;

    clearTimer();
    removeRecorderListeners();
    runtime.recorder = null;
    releaseCapture();
    setStatus(STATUS.IDLE);
  }

  function getRecordingState() {
    return {
      status: state.status,
      statusText: state.statusText,
      elapsedMs: state.elapsedMs,
      latestDurationMs: state.latestDurationMs,
      mimeType: state.mimeType,
      artifact: state.artifact,
      lastError: state.lastError,
      canStart: state.status === STATUS.IDLE,
      canStop: state.status === STATUS.RECORDING,
      canDownload: Boolean(state.artifact?.url),
    };
  }

  function failStartRecording(error) {
    clearTimer();
    removeRecorderListeners();

    if (runtime.recorder?.state && runtime.recorder.state !== 'inactive') {
      runtime.recorder.stop();
    }

    runtime.recorder = null;
    runtime.chunks = [];
    releaseCapture();

    state.startedAtMs = 0;
    state.elapsedMs = 0;
    state.lastError = toRecordingError(error);
    state.status = STATUS.IDLE;
    updateStatusText();
    emitState();

    return getRecordingState();
  }

  function startRecording({ canvasElement, audioEngine, settings } = {}) {
    if (state.status !== STATUS.IDLE) {
      return getRecordingState();
    }

    exportGateway?.revokeArtifact();
    state.artifact = null;
    state.lastError = null;

    try {
      const support = captureGateway?.isCaptureSupported?.({ canvasElement });
      if (support && support.supported === false) {
        throw new Error(support.reason || 'Capture is not supported in this environment.');
      }

      runtime.captureSession = captureGateway?.createCaptureStream({
        canvasElement,
        audioTapStream: settings?.includeAudio ? audioEngine?.getRecordingTapStream?.() ?? null : null,
        frameRate: settings?.captureFps,
        includeAudio: settings?.includeAudio,
      });

      const mimeType = runtime.captureSession?.mimeType ?? DEFAULT_MIME_TYPE;
      state.mimeType = mimeType;
      runtime.chunks = [];

      const recorderOptions = mimeType ? { mimeType } : undefined;
      runtime.recorder = new MediaRecorder(runtime.captureSession.stream, recorderOptions);

      const onDataAvailable = (event) => {
        if (event.data && event.data.size > 0) {
          runtime.chunks.push(event.data);
        }
      };
      const onStop = () => {
        finalizeRecording();
      };

      runtime.recorder.addEventListener('dataavailable', onDataAvailable);
      runtime.recorder.addEventListener('stop', onStop);
      runtime.recorderListeners = { onDataAvailable, onStop };

      state.startedAtMs = now();
      state.elapsedMs = 0;
      setStatus(STATUS.RECORDING);
      startTimer();

      runtime.recorder.start();
      return getRecordingState();
    } catch (error) {
      return failStartRecording(error);
    }
  }

  function stopRecording() {
    if (state.status !== STATUS.RECORDING || !runtime.recorder) {
      return getRecordingState();
    }

    setStatus(STATUS.STOPPING);

    if (runtime.recorder.state !== 'inactive') {
      runtime.recorder.stop();
    }

    return getRecordingState();
  }

  function dispose() {
    clearTimer();

    if (runtime.recorder?.state && runtime.recorder.state !== 'inactive') {
      runtime.recorder.stop();
    }

    removeRecorderListeners();
    runtime.recorder = null;
    runtime.chunks = [];
    releaseCapture();
    exportGateway?.revokeArtifact();

    state.artifact = null;
    state.elapsedMs = 0;
    state.latestDurationMs = 0;
    state.startedAtMs = 0;
    state.lastError = null;
    setStatus(STATUS.IDLE);
  }

  return {
    startRecording,
    stopRecording,
    getRecordingState,
    dispose,
  };
}
