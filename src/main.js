import { createAppLifecycle } from './app/lifecycle/appLifecycle.js';
import { bootstrapApplication } from './app/bootstrap/bootstrapApplication.js';
import { getUIElements } from './ui/dom.js';
import {
  buildShareLink,
  copyTextToClipboard,
  decodePreferencesFromHash,
  encodePreferencesToHash,
  readCurrentHash,
  writeHash,
} from './presets/urlPreset.js';
import { preferences, resetPreferences, setPreferences } from './core/preferences.js';

const appLifecycle = createAppLifecycle();
const bootstrapResult = bootstrapApplication({ appLifecycle });

const appStatusElement = document.getElementById('app-status');
if (appStatusElement) {
  appStatusElement.textContent = bootstrapResult.statusMessage;
}

function createPresetDebugUpdater(debugElement) {
  return function update(message) {
    if (debugElement) {
      debugElement.textContent = `Preset Debug: ${message}`;
    }
  };
}

async function handleShareLink(updateDebug) {
  const hash = encodePreferencesToHash(preferences);
  writeHash(hash);

  const link = buildShareLink(hash);
  const copied = await copyTextToClipboard(link);
  updateDebug(copied ? 'share link copied to clipboard.' : 'hash updated; clipboard unavailable.');
}

function handleApplyUrl(updateDebug) {
  const result = decodePreferencesFromHash(readCurrentHash());
  if (!result.ok) {
    updateDebug(`apply failed: ${result.reason}`);
    return;
  }

  setPreferences(result.preferences);
  updateDebug(`applied schema v1 preset (${result.reason.toLowerCase()}).`);
}

function handleResetPrefs(updateDebug) {
  resetPreferences();
  updateDebug('preferences reset to defaults.');
}

function wirePresetButtons() {
  const ui = getUIElements(document);
  const updateDebug = createPresetDebugUpdater(ui.presetDebugLine);

  if (ui.presetShareLinkButton) {
    ui.presetShareLinkButton.addEventListener('click', () => {
      void handleShareLink(updateDebug);
    });
  }

  if (ui.presetApplyUrlButton) {
    ui.presetApplyUrlButton.addEventListener('click', () => {
      handleApplyUrl(updateDebug);
    });
  }

  if (ui.presetResetPrefsButton) {
    ui.presetResetPrefsButton.addEventListener('click', () => {
      handleResetPrefs(updateDebug);
    });
  }

  updateDebug('ready.');
}

wirePresetButtons();
