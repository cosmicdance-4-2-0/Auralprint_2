import { CONFIG } from '../../core/config.js';
import { patchPreferences, preferences, runtime } from '../../core/preferences.js';

function createRow(labelText, inputElement, valueElement) {
  const row = document.createElement('label');
  row.className = 'control-row';

  const label = document.createElement('span');
  label.className = 'control-label';
  label.textContent = labelText;

  row.append(label, inputElement, valueElement);
  return row;
}

function createValueReadout() {
  const readout = document.createElement('output');
  readout.className = 'control-value';
  return readout;
}

function configureRangeInput(input, limits) {
  input.type = 'range';
  input.min = String(limits.min);
  input.max = String(limits.max);
  input.step = String(limits.step);
}

function nestedPatch(path, value) {
  return path.reduceRight((accumulator, key) => ({ [key]: accumulator }), value);
}

function setSelectOptions(select, options) {
  select.innerHTML = '';
  for (const optionValue of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.append(option);
  }
}

function syncBooleanControl(input, readout, value) {
  input.checked = Boolean(value);
  readout.textContent = input.checked ? 'on' : 'off';
}

function syncRangeControl(input, readout, value) {
  input.value = String(value);
  readout.textContent = String(value);
}

function syncColorControl(input, readout, value) {
  input.value = value;
  readout.textContent = value;
}

function syncSelectControl(input, readout, value) {
  input.value = value;
  readout.textContent = value;
}

function createCheckbox(id) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  return input;
}

function createRange(id, limits) {
  const input = document.createElement('input');
  input.id = id;
  configureRangeInput(input, limits);
  return input;
}

function createSelect(id, options) {
  const input = document.createElement('select');
  input.id = id;
  setSelectOptions(input, options);
  return input;
}

function createColor(id) {
  const input = document.createElement('input');
  input.type = 'color';
  input.id = id;
  return input;
}

export function wireSimulationControls({ ui, onSettingsApplied }) {
  const controls = [];

  function registerControl({ section, label, id, createInput, sync, path, eventName = 'input', parse }) {
    if (!section) return;

    const input = createInput();
    const readout = createValueReadout();
    section.append(createRow(label, input, readout));

    const control = { input, readout, sync };
    controls.push(control);

    input.addEventListener(eventName, () => {
      const nextValue = parse(input);
      const nextSettings = patchPreferences(nestedPatch(path, nextValue));
      onSettingsApplied?.(nextSettings);
      render();
    });
  }

  registerControl({
    section: ui.traceControlsGroup,
    label: 'Lines',
    id: 'chkLines',
    createInput: () => createCheckbox('chkLines'),
    sync: (input, readout, settings) => syncBooleanControl(input, readout, settings.trace.lines),
    path: ['trace', 'lines'],
    eventName: 'change',
    parse: (input) => input.checked,
  });

  registerControl({
    section: ui.traceControlsGroup,
    label: 'Num lines',
    id: 'rngNumLines',
    createInput: () => createRange('rngNumLines', CONFIG.limits.trace.numLines),
    sync: (input, readout, settings) => syncRangeControl(input, readout, settings.trace.numLines),
    path: ['trace', 'numLines'],
    parse: (input) => Number(input.value),
  });

  registerControl({
    section: ui.traceControlsGroup,
    label: 'Line color mode',
    id: 'selLineColorMode',
    createInput: () => createSelect('selLineColorMode', CONFIG.enums.traceLineColorModes),
    sync: (input, readout, settings) => syncSelectControl(input, readout, settings.trace.lineColorMode),
    path: ['trace', 'lineColorMode'],
    eventName: 'change',
    parse: (input) => input.value,
  });

  registerControl({
    section: ui.particlesControlsGroup,
    label: 'Emit rate',
    createInput: () => createRange('rngEmit', CONFIG.limits.particles.emitPerSecond),
    sync: (input, readout, settings) => syncRangeControl(input, readout, settings.particles.emitPerSecond),
    path: ['particles', 'emitPerSecond'],
    parse: (input) => Number(input.value),
  });

  registerControl({ section: ui.particlesControlsGroup, label: 'Size max', createInput: () => createRange('rngSizeMax', CONFIG.limits.particles.sizeMaxPx), sync: (i, r, s) => syncRangeControl(i, r, s.particles.sizeMaxPx), path: ['particles', 'sizeMaxPx'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.particlesControlsGroup, label: 'Size min', createInput: () => createRange('rngSizeMin', CONFIG.limits.particles.sizeMinPx), sync: (i, r, s) => syncRangeControl(i, r, s.particles.sizeMinPx), path: ['particles', 'sizeMinPx'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.particlesControlsGroup, label: 'Time to min', createInput: () => createRange('rngSizeToMin', CONFIG.limits.particles.sizeToMinSec), sync: (i, r, s) => syncRangeControl(i, r, s.particles.sizeToMinSec), path: ['particles', 'sizeToMinSec'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.particlesControlsGroup, label: 'TTL', createInput: () => createRange('rngTTL', CONFIG.limits.particles.ttlSec), sync: (i, r, s) => syncRangeControl(i, r, s.particles.ttlSec), path: ['particles', 'ttlSec'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.particlesControlsGroup, label: 'Overlap radius', createInput: () => createRange('rngOverlap', CONFIG.limits.particles.overlapRadiusPx), sync: (i, r, s) => syncRangeControl(i, r, s.particles.overlapRadiusPx), path: ['particles', 'overlapRadiusPx'], parse: (i) => Number(i.value) });

  registerControl({ section: ui.motionControlsGroup, label: 'Angular speed', createInput: () => createRange('rngOmega', CONFIG.limits.motion.angularSpeedRadPerSec), sync: (i, r, s) => syncRangeControl(i, r, s.motion.angularSpeedRadPerSec), path: ['motion', 'angularSpeedRadPerSec'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.motionControlsGroup, label: 'Waveform disp', createInput: () => createRange('rngWfDisp', CONFIG.limits.motion.waveformRadialDisplaceFrac), sync: (i, r, s) => syncRangeControl(i, r, s.motion.waveformRadialDisplaceFrac), path: ['motion', 'waveformRadialDisplaceFrac'], parse: (i) => Number(i.value) });

  registerControl({ section: ui.audioAnalysisControlsGroup, label: 'RMS gain', createInput: () => createRange('rngRmsGain', CONFIG.limits.audio.rmsGain), sync: (i, r, s) => syncRangeControl(i, r, s.audio.rmsGain), path: ['audio', 'rmsGain'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.audioAnalysisControlsGroup, label: 'Min radius', createInput: () => createRange('rngMinRad', CONFIG.limits.audio.minRadiusFrac), sync: (i, r, s) => syncRangeControl(i, r, s.audio.minRadiusFrac), path: ['audio', 'minRadiusFrac'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.audioAnalysisControlsGroup, label: 'Max radius', createInput: () => createRange('rngMaxRad', CONFIG.limits.audio.maxRadiusFrac), sync: (i, r, s) => syncRangeControl(i, r, s.audio.maxRadiusFrac), path: ['audio', 'maxRadiusFrac'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.audioAnalysisControlsGroup, label: 'Smoothing', createInput: () => createRange('rngSmooth', CONFIG.limits.audio.smoothingTimeConstant), sync: (i, r, s) => syncRangeControl(i, r, s.audio.smoothingTimeConstant), path: ['audio', 'smoothingTimeConstant'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.audioAnalysisControlsGroup, label: 'FFT size', createInput: () => createSelect('selFFT', CONFIG.limits.audio.fftSizes.map(String)), sync: (i, r, s) => syncSelectControl(i, r, String(s.audio.fftSize)), path: ['audio', 'fftSize'], eventName: 'change', parse: (i) => Number(i.value) });

  registerControl({ section: ui.bandControlsGroup, label: 'Band overlay', createInput: () => createCheckbox('chkBandOverlay'), sync: (i, r, s) => syncBooleanControl(i, r, s.bands.overlay.enabled), path: ['bands', 'overlay', 'enabled'], eventName: 'change', parse: (i) => i.checked });
  registerControl({ section: ui.bandControlsGroup, label: 'Band connect', createInput: () => createCheckbox('chkBandConnect'), sync: (i, r, s) => syncBooleanControl(i, r, s.bands.overlay.connectAdjacent), path: ['bands', 'overlay', 'connectAdjacent'], eventName: 'change', parse: (i) => i.checked });
  registerControl({ section: ui.bandControlsGroup, label: 'Overlay alpha', createInput: () => createRange('rngBandAlpha', CONFIG.limits.bands.overlayAlpha), sync: (i, r, s) => syncRangeControl(i, r, s.bands.overlay.alpha), path: ['bands', 'overlay', 'alpha'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.bandControlsGroup, label: 'Overlay point size', createInput: () => createRange('rngBandPoint', CONFIG.limits.bands.pointSizePx), sync: (i, r, s) => syncRangeControl(i, r, s.bands.overlay.pointSizePx), path: ['bands', 'overlay', 'pointSizePx'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.bandControlsGroup, label: 'Ring phase mode', createInput: () => createSelect('selRingPhaseMode', CONFIG.enums.bandOverlayPhaseModes), sync: (i, r, s) => syncSelectControl(i, r, s.bands.overlay.phaseMode), path: ['bands', 'overlay', 'phaseMode'], eventName: 'change', parse: (i) => i.value });
  registerControl({ section: ui.bandControlsGroup, label: 'Ring speed', createInput: () => createRange('rngRingSpeed', CONFIG.limits.bands.ringSpeedRadPerSec), sync: (i, r, s) => syncRangeControl(i, r, s.bands.overlay.ringSpeedRadPerSec), path: ['bands', 'overlay', 'ringSpeedRadPerSec'], parse: (i) => Number(i.value) });

  registerControl({ section: ui.colorControlsGroup, label: 'Background', createInput: () => createColor('clrBg'), sync: (i, r, s) => syncColorControl(i, r, s.visuals.backgroundColor), path: ['visuals', 'backgroundColor'], parse: (i) => i.value });
  registerControl({ section: ui.colorControlsGroup, label: 'Particle color', createInput: () => createColor('clrParticle'), sync: (i, r, s) => syncColorControl(i, r, s.visuals.particleColor), path: ['visuals', 'particleColor'], parse: (i) => i.value });
  registerControl({ section: ui.colorControlsGroup, label: 'Particle color src', createInput: () => createSelect('selParticleColorSrc', CONFIG.enums.bandParticleColorSources), sync: (i, r, s) => syncSelectControl(i, r, s.bands.particleColorSource), path: ['bands', 'particleColorSource'], eventName: 'change', parse: (i) => i.value });
  registerControl({ section: ui.colorControlsGroup, label: 'Hue offset', createInput: () => createRange('rngHueOff', CONFIG.limits.bands.hueOffsetDeg), sync: (i, r, s) => syncRangeControl(i, r, s.bands.rainbow.hueOffsetDeg), path: ['bands', 'rainbow', 'hueOffsetDeg'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.colorControlsGroup, label: 'Saturation', createInput: () => createRange('rngSat', CONFIG.limits.bands.saturation), sync: (i, r, s) => syncRangeControl(i, r, s.bands.rainbow.saturation), path: ['bands', 'rainbow', 'saturation'], parse: (i) => Number(i.value) });
  registerControl({ section: ui.colorControlsGroup, label: 'Value', createInput: () => createRange('rngVal', CONFIG.limits.bands.value), sync: (i, r, s) => syncRangeControl(i, r, s.bands.rainbow.value), path: ['bands', 'rainbow', 'value'], parse: (i) => Number(i.value) });

  function render() {
    const settings = runtime.settings;
    for (const control of controls) {
      control.sync(control.input, control.readout, settings);
    }
  }

  render();

  return {
    render,
    getPreferences() {
      return preferences;
    },
  };
}
