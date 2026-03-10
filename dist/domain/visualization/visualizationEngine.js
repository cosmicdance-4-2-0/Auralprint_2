import { createVisualizationRenderer } from './visualizationRenderer.js';
import { createVisualizationSimulation } from './visualizationSimulation.js';

/** Visualization orchestrator over simulation step + renderer draw. */
export function createVisualizationEngine({
  simEngine = createVisualizationSimulation(),
  rendererEngine = createVisualizationRenderer(),
} = {}) {
  const state = {
    settings: null,
    latestFrame: null,
    running: false,
  };

  function configure(settings = {}) {
    state.settings = {
      ...settings,
    };
    simEngine.configure(state.settings);
  }

  function bindCanvas(canvas) {
    rendererEngine.bindCanvas(canvas);
  }

  function tick({ analysisFrame, nowMs = performance.now() } = {}) {
    if (!state.running) return state.latestFrame;

    const simFrame = simEngine.step({ analysisFrame, nowMs, settings: state.settings });
    rendererEngine.draw(simFrame, state.settings);
    state.latestFrame = simFrame;
    return simFrame;
  }

  function start() {
    state.running = true;
  }

  function stop() {
    state.running = false;
  }

  function reset() {
    simEngine.reset();
    rendererEngine.reset();
    state.latestFrame = null;
  }

  return {
    configure,
    bindCanvas,
    tick,
    start,
    stop,
    reset,
    getLatestFrame() {
      return state.latestFrame;
    },
  };
}
