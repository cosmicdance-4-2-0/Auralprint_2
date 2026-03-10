function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  if (isEditableTarget(target)) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === 'button' || tagName === 'a';
}

export function createAppLifecycle() {
  const state = {
    phase: 'initialized',
    simulation: {
      simPaused: false,
      resetCount: 0,
      lastResetAtMs: null,
    },
    loopRafId: null,
  };

  function start() {
    state.phase = 'running';
  }

  function stop() {
    if (state.loopRafId !== null) {
      window.cancelAnimationFrame(state.loopRafId);
      state.loopRafId = null;
    }
    state.phase = 'stopped';
  }

  function startFrameLoop({ onFrame } = {}) {
    if (typeof onFrame !== 'function') return;

    if (state.loopRafId !== null) {
      window.cancelAnimationFrame(state.loopRafId);
      state.loopRafId = null;
    }

    const tick = (timestamp) => {
      onFrame(timestamp);
      state.loopRafId = window.requestAnimationFrame(tick);
    };

    state.loopRafId = window.requestAnimationFrame(tick);
  }

  function toggleSimulationPaused() {
    state.simulation.simPaused = !state.simulation.simPaused;
    return state.simulation.simPaused;
  }

  function requestSimulationReset() {
    state.simulation.resetCount += 1;
    state.simulation.lastResetAtMs = Date.now();
  }

  function getState() {
    return {
      phase: state.phase,
      simulation: { ...state.simulation },
    };
  }

  function wireBaselineKeyboardShortcuts({
    host = window,
    scopeElement = document.body,
    onTogglePanels,
    onPauseToggle,
    onReset,
    onQueueNavigate,
    onSeekRelative,
  } = {}) {
    host.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (scopeElement instanceof Element && event.target instanceof Element && !scopeElement.contains(event.target)) {
        const isDocumentRootTarget = event.target === document.body || event.target === document.documentElement;
        if (!isDocumentRootTarget) {
          return;
        }
      }

      const activeElement = document.activeElement;
      if (isInteractiveTarget(event.target) || isInteractiveTarget(activeElement)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        const isPaused = toggleSimulationPaused();
        onPauseToggle?.(isPaused);
        return;
      }

      if (event.code === 'KeyR') {
        requestSimulationReset();
        onReset?.(getState().simulation);
        return;
      }

      if (event.code === 'KeyH') {
        onTogglePanels?.();
        return;
      }

      if (event.code === 'KeyN') {
        event.preventDefault();
        onQueueNavigate?.({ direction: 'next' });
        return;
      }

      if (event.code === 'KeyP') {
        event.preventDefault();
        onQueueNavigate?.({ direction: 'previous' });
        return;
      }

      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        const direction = event.code === 'ArrowRight' ? 1 : -1;
        onSeekRelative?.({ direction, accelerated: event.shiftKey });
      }
    });
  }

  return {
    start,
    stop,
    startFrameLoop,
    getState,
    requestSimulationReset,
    toggleSimulationPaused,
    wireBaselineKeyboardShortcuts,
  };
}
