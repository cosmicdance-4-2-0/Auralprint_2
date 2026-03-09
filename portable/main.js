import { createAppLifecycle } from './app/lifecycle/appLifecycle.js';
import { bootstrapApplication } from './app/bootstrap/bootstrapApplication.js';

const appLifecycle = createAppLifecycle();
const bootstrapResult = bootstrapApplication({ appLifecycle });

const appStatusElement = document.getElementById('app-status');
if (appStatusElement) {
  appStatusElement.textContent = bootstrapResult.statusMessage;
}
