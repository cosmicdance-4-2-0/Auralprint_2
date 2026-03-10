import { patchPreferences, preferences } from '../../core/preferences.js';

const TOGGLEABLE_PANELS = Object.freeze([
  'spectral-hud-panel',
  'simulation-controls-panel',
  'render-camera-channel-panel',
  'playlist-panel',
  'status-panel',
  'scrubber-panel',
  'audio-control-panel',
]);

const PREFERENCE_PATH_BY_PANEL_ID = Object.freeze({
  'spectral-hud-panel': ['ui', 'panels', 'spectralHudPanelVisible'],
  'simulation-controls-panel': ['ui', 'panels', 'simulationControlsPanelVisible'],
  'render-camera-channel-panel': ['ui', 'panels', 'renderCameraChannelPanelVisible'],
  'playlist-panel': ['ui', 'panels', 'playlistPanelVisible'],
  'status-panel': ['ui', 'panels', 'statusPanelVisible'],
  'scrubber-panel': ['ui', 'panels', 'scrubberPanelVisible'],
  'audio-control-panel': ['ui', 'panels', 'audioControlPanelVisible'],
});

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[contenteditable="true"]')) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function readPreferredPanelVisibility(panelId) {
  const path = PREFERENCE_PATH_BY_PANEL_ID[panelId];
  if (!path) return true;

  let cursor = preferences;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return true;
    cursor = cursor[key];
  }

  return typeof cursor === 'boolean' ? cursor : true;
}

function writePreferredPanelVisibility(panelId, isVisible) {
  const path = PREFERENCE_PATH_BY_PANEL_ID[panelId];
  if (!path) return;

  const [rootKey, nestedKey, leafKey] = path;
  patchPreferences({
    [rootKey]: {
      [nestedKey]: {
        [leafKey]: isVisible,
      },
    },
  });
}

/**
 * Public interface for panel visibility state projection + interaction wiring.
 */
export function createPanelsViewModel() {
  let state = {
    panelVisibility: {},
    allToggleablePanelsHidden: false,
  };

  const listeners = new Set();

  function emitChange() {
    for (const listener of listeners) {
      listener(getState());
    }
  }

  function setPanelVisibility(panelId, isVisible, persist = true) {
    if (!TOGGLEABLE_PANELS.includes(panelId)) return;

    state.panelVisibility = {
      ...state.panelVisibility,
      [panelId]: isVisible,
    };

    state.allToggleablePanelsHidden = TOGGLEABLE_PANELS.every((id) => !state.panelVisibility[id]);

    if (persist) {
      writePreferredPanelVisibility(panelId, isVisible);
    }

    emitChange();
  }

  function toggleAllToggleablePanels() {
    if (state.allToggleablePanelsHidden) {
      TOGGLEABLE_PANELS.forEach((panelId) => setPanelVisibility(panelId, true));
      return;
    }

    TOGGLEABLE_PANELS.forEach((panelId) => setPanelVisibility(panelId, false));
  }

  function initializeFromPreferences() {
    const panelVisibility = {};
    TOGGLEABLE_PANELS.forEach((panelId) => {
      panelVisibility[panelId] = readPreferredPanelVisibility(panelId);
    });

    state = {
      panelVisibility,
      allToggleablePanelsHidden: TOGGLEABLE_PANELS.every((panelId) => !panelVisibility[panelId]),
    };
  }

  function wireKeyboardShortcuts(host = window) {
    host.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) return;
      if (event.repeat) return;
      if (event.code !== 'KeyH') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      toggleAllToggleablePanels();
    });
  }

  function getState() {
    return {
      panelVisibility: { ...state.panelVisibility },
      allToggleablePanelsHidden: state.allToggleablePanelsHidden,
      toggleablePanels: [...TOGGLEABLE_PANELS],
    };
  }

  initializeFromPreferences();

  function syncFromPreferences() {
    initializeFromPreferences();
    emitChange();
  }

  return {
    getState,
    setPanelVisibility,
    toggleAllToggleablePanels,
    wireKeyboardShortcuts,
    syncFromPreferences,
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
  };
}
