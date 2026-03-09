import { createTransportController } from '../../domain/transport/transportController.js';
import { createQueueController } from '../../domain/queue/queueController.js';
import { createAnalysisEngine } from '../../domain/analysis/analysisEngine.js';
import { createVisualizationEngine } from '../../domain/visualization/visualizationEngine.js';
import { createRecordingController } from '../../domain/recording/recordingController.js';
import { createPresetStore } from '../../domain/presets/presetStore.js';
import { createDecodeGateway } from '../../io/decode/decodeGateway.js';
import { createPlaybackGateway } from '../../io/playback/playbackGateway.js';
import { createCaptureGateway } from '../../io/capture/captureGateway.js';
import { createExportGateway } from '../../io/export/exportGateway.js';
import { createControlsViewModel } from '../../ui/controls/controlsViewModel.js';
import { createPanelsViewModel } from '../../ui/panels/panelsViewModel.js';
import { createStatusViewModel } from '../../ui/status/statusViewModel.js';
import { BUILD_IDENTIFIER } from '../../shared/constants/build.js';

export function bootstrapApplication({ appLifecycle }) {
  const modules = {
    transportController: createTransportController(),
    queueController: createQueueController(),
    analysisEngine: createAnalysisEngine(),
    visualizationEngine: createVisualizationEngine(),
    recordingController: createRecordingController(),
    presetStore: createPresetStore(),
    decodeGateway: createDecodeGateway(),
    playbackGateway: createPlaybackGateway(),
    captureGateway: createCaptureGateway(),
    exportGateway: createExportGateway(),
    controlsViewModel: createControlsViewModel(),
    panelsViewModel: createPanelsViewModel(),
    statusViewModel: createStatusViewModel()
  };

  appLifecycle.start();

  return {
    statusMessage: `${BUILD_IDENTIFIER} scaffold bootstrapped`,
    modules
  };
}
