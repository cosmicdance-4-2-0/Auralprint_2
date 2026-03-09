/** Public interface stub for capture lifecycle using MediaRecorder in Build 113. */
export function createRecordingController() {
  return {
    startRecording() {},
    stopRecording() {},
    getRecordingState() {
      return { status: 'idle' };
    }
  };
}
