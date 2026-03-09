function createSimEngine() {
  const state = {
    latestFrame: null,
    resetCount: 0,
  };

  return {
    step({ analysisFrame, nowMs }) {
      state.latestFrame = {
        nowMs,
        dominant: analysisFrame?.bands?.dominant ?? null,
        bands: analysisFrame?.bands ?? null,
      };
      return state.latestFrame;
    },
    reset() {
      state.latestFrame = null;
      state.resetCount += 1;
    },
    getState() {
      return {
        latestFrame: state.latestFrame,
        resetCount: state.resetCount,
      };
    },
  };
}

function createRendererEngine() {
  const state = {
    canvas: null,
    latestFrame: null,
  };

  function bindCanvas(canvas) {
    state.canvas = canvas ?? null;
  }

  function draw(simFrame) {
    state.latestFrame = simFrame ?? null;

    if (!state.canvas) return;
    const context = state.canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, state.canvas.width, state.canvas.height);
  }

  return {
    bindCanvas,
    draw,
    reset() {
      state.latestFrame = null;
      if (!state.canvas) return;
      const context = state.canvas.getContext('2d');
      context?.clearRect(0, 0, state.canvas.width, state.canvas.height);
    },
    getState() {
      return {
        latestFrame: state.latestFrame,
      };
    },
  };
}

/** Visualization orchestrator over simulation step + renderer draw. */
export function createVisualizationEngine({ simEngine = createSimEngine(), rendererEngine = createRendererEngine() } = {}) {
  const state = {
    settings: null,
    latestFrame: null,
    running: false,
  };

  function configure(settings = {}) {
    state.settings = {
      ...settings,
    };
  }

  function bindCanvas(canvas) {
    rendererEngine.bindCanvas(canvas);
  }

  function tick({ analysisFrame, nowMs = performance.now() } = {}) {
    if (!state.running) return state.latestFrame;

    const simFrame = simEngine.step({ analysisFrame, nowMs, settings: state.settings });
    rendererEngine.draw(simFrame);
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
