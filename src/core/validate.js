import { CONFIG, deepClone } from './config.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampToRange(value, range, fallback) {
  return Number.isFinite(value) ? clamp(value, range.min, range.max) : fallback;
}

function normalizeEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}


function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeColorHex(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return /^#([0-9a-fA-F]{6})$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

function normalizeOrbChannelId(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const upperValue = value.trim().toUpperCase();
  return CONFIG.enums.orbChannelIds.includes(upperValue) ? upperValue : fallback;
}

function sanitizeOrbBandIds(rawBandIds, fallback) {
  if (!Array.isArray(rawBandIds)) return deepClone(fallback);

  const out = [];
  const seen = new Set();
  for (const value of rawBandIds) {
    if (!Number.isInteger(value)) continue;
    if (value < 0 || value >= CONFIG.defaults.bands.count) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function sanitizeOrb(rawOrb, fallbackOrb) {
  const source = isPlainObject(rawOrb) ? rawOrb : {};

  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : fallbackOrb.id;

  const chiralityRaw = Number.isFinite(source.chirality) ? source.chirality : fallbackOrb.chirality;
  const chirality = chiralityRaw >= 0 ? 1 : -1;

  const startAngleRad = Number.isFinite(source.startAngleRad) ? source.startAngleRad : fallbackOrb.startAngleRad;

  return {
    id,
    chanId: normalizeOrbChannelId(source.chanId, fallbackOrb.chanId),
    bandIds: sanitizeOrbBandIds(source.bandIds, fallbackOrb.bandIds),
    chirality,
    startAngleRad,
  };
}

export function sanitizePreferences(input) {
  const candidate = isPlainObject(input) ? input : {};
  const defaults = CONFIG.defaults;
  const limits = CONFIG.limits;

  const sanitized = deepClone(defaults);


  const uiInput = isPlainObject(candidate.ui) ? candidate.ui : {};
  const uiPanelsInput = isPlainObject(uiInput.panels) ? uiInput.panels : {};
  sanitized.ui.panels.spectralHudPanelVisible = normalizeBoolean(
    uiPanelsInput.spectralHudPanelVisible,
    defaults.ui.panels.spectralHudPanelVisible,
  );
  sanitized.ui.panels.simulationControlsPanelVisible = normalizeBoolean(
    uiPanelsInput.simulationControlsPanelVisible,
    defaults.ui.panels.simulationControlsPanelVisible,
  );
  sanitized.ui.panels.renderCameraChannelPanelVisible = normalizeBoolean(
    uiPanelsInput.renderCameraChannelPanelVisible,
    defaults.ui.panels.renderCameraChannelPanelVisible,
  );
  sanitized.ui.panels.playlistPanelVisible = normalizeBoolean(
    uiPanelsInput.playlistPanelVisible,
    defaults.ui.panels.playlistPanelVisible,
  );
  sanitized.ui.panels.statusPanelVisible = normalizeBoolean(
    uiPanelsInput.statusPanelVisible,
    defaults.ui.panels.statusPanelVisible,
  );
  sanitized.ui.panels.scrubberPanelVisible = normalizeBoolean(
    uiPanelsInput.scrubberPanelVisible,
    defaults.ui.panels.scrubberPanelVisible,
  );
  sanitized.ui.panels.audioControlPanelVisible = normalizeBoolean(
    uiPanelsInput.audioControlPanelVisible,
    defaults.ui.panels.audioControlPanelVisible,
  );

  const visualsInput = isPlainObject(candidate.visuals) ? candidate.visuals : {};
  sanitized.visuals.backgroundColor = normalizeColorHex(visualsInput.backgroundColor, defaults.visuals.backgroundColor);
  sanitized.visuals.particleColor = normalizeColorHex(visualsInput.particleColor, defaults.visuals.particleColor);

  const traceInput = isPlainObject(candidate.trace) ? candidate.trace : {};
  sanitized.trace.lines = typeof traceInput.lines === 'boolean' ? traceInput.lines : defaults.trace.lines;
  sanitized.trace.numLines = clampToRange(traceInput.numLines, limits.trace.numLines, defaults.trace.numLines);
  sanitized.trace.lineAlpha = clampToRange(traceInput.lineAlpha, limits.trace.lineAlpha, defaults.trace.lineAlpha);
  sanitized.trace.lineWidthPx = clampToRange(traceInput.lineWidthPx, limits.trace.lineWidthPx, defaults.trace.lineWidthPx);
  sanitized.trace.lineColorMode = normalizeEnum(traceInput.lineColorMode, CONFIG.enums.traceLineColorModes, defaults.trace.lineColorMode);

  const particlesInput = isPlainObject(candidate.particles) ? candidate.particles : {};
  sanitized.particles.emitPerSecond = clampToRange(particlesInput.emitPerSecond, limits.particles.emitPerSecond, defaults.particles.emitPerSecond);
  sanitized.particles.sizeMaxPx = clampToRange(particlesInput.sizeMaxPx, limits.particles.sizeMaxPx, defaults.particles.sizeMaxPx);
  sanitized.particles.sizeMinPx = clampToRange(particlesInput.sizeMinPx, limits.particles.sizeMinPx, defaults.particles.sizeMinPx);
  sanitized.particles.sizeToMinSec = clampToRange(particlesInput.sizeToMinSec, limits.particles.sizeToMinSec, defaults.particles.sizeToMinSec);
  sanitized.particles.ttlSec = clampToRange(particlesInput.ttlSec, limits.particles.ttlSec, defaults.particles.ttlSec);
  sanitized.particles.overlapRadiusPx = clampToRange(particlesInput.overlapRadiusPx, limits.particles.overlapRadiusPx, defaults.particles.overlapRadiusPx);

  // Invariant: particle minimum size must not exceed maximum size.
  sanitized.particles.sizeMinPx = Math.min(sanitized.particles.sizeMinPx, sanitized.particles.sizeMaxPx);
  // Invariant: lifetime must allow enough time to reach minimum size.
  sanitized.particles.ttlSec = Math.max(sanitized.particles.ttlSec, sanitized.particles.sizeToMinSec);

  const motionInput = isPlainObject(candidate.motion) ? candidate.motion : {};
  sanitized.motion.angularSpeedRadPerSec = clampToRange(motionInput.angularSpeedRadPerSec, limits.motion.angularSpeedRadPerSec, defaults.motion.angularSpeedRadPerSec);
  sanitized.motion.waveformRadialDisplaceFrac = clampToRange(motionInput.waveformRadialDisplaceFrac, limits.motion.waveformRadialDisplaceFrac, defaults.motion.waveformRadialDisplaceFrac);

  const audioInput = isPlainObject(candidate.audio) ? candidate.audio : {};
  sanitized.audio.rmsGain = clampToRange(audioInput.rmsGain, limits.audio.rmsGain, defaults.audio.rmsGain);
  sanitized.audio.minRadiusFrac = clampToRange(audioInput.minRadiusFrac, limits.audio.minRadiusFrac, defaults.audio.minRadiusFrac);
  sanitized.audio.maxRadiusFrac = clampToRange(audioInput.maxRadiusFrac, limits.audio.maxRadiusFrac, defaults.audio.maxRadiusFrac);
  sanitized.audio.smoothingTimeConstant = clampToRange(audioInput.smoothingTimeConstant, limits.audio.smoothingTimeConstant, defaults.audio.smoothingTimeConstant);

  sanitized.audio.fftSize = Number.isFinite(audioInput.fftSize) && limits.audio.fftSizes.includes(audioInput.fftSize)
    ? audioInput.fftSize
    : defaults.audio.fftSize;

  sanitized.audio.loop = typeof audioInput.loop === 'boolean' ? audioInput.loop : defaults.audio.loop;
  sanitized.audio.muted = typeof audioInput.muted === 'boolean' ? audioInput.muted : defaults.audio.muted;
  sanitized.audio.volume = clampToRange(audioInput.volume, CONFIG.ui.volume, defaults.audio.volume);

  const recordingInput = isPlainObject(candidate.recording) ? candidate.recording : {};
  sanitized.recording.captureFps = clampToRange(
    recordingInput.captureFps,
    limits.recording.captureFps,
    defaults.recording.captureFps,
  );
  sanitized.recording.includeAudio = normalizeBoolean(recordingInput.includeAudio, defaults.recording.includeAudio);

  // Invariant: maintain ordered radial bounds for downstream systems.
  const orderedRadii = [sanitized.audio.minRadiusFrac, sanitized.audio.maxRadiusFrac].sort((a, b) => a - b);
  [sanitized.audio.minRadiusFrac, sanitized.audio.maxRadiusFrac] = orderedRadii;

  const bandsInput = isPlainObject(candidate.bands) ? candidate.bands : {};
  const overlayInput = isPlainObject(bandsInput.overlay) ? bandsInput.overlay : {};
  const rainbowInput = isPlainObject(bandsInput.rainbow) ? bandsInput.rainbow : {};

  sanitized.bands.overlay.enabled = typeof overlayInput.enabled === 'boolean' ? overlayInput.enabled : defaults.bands.overlay.enabled;
  sanitized.bands.overlay.connectAdjacent = typeof overlayInput.connectAdjacent === 'boolean'
    ? overlayInput.connectAdjacent
    : defaults.bands.overlay.connectAdjacent;
  sanitized.bands.overlay.alpha = clampToRange(overlayInput.alpha, limits.bands.overlayAlpha, defaults.bands.overlay.alpha);
  sanitized.bands.overlay.pointSizePx = clampToRange(overlayInput.pointSizePx, limits.bands.pointSizePx, defaults.bands.overlay.pointSizePx);
  sanitized.bands.overlay.phaseMode = normalizeEnum(overlayInput.phaseMode, CONFIG.enums.bandOverlayPhaseModes, defaults.bands.overlay.phaseMode);
  sanitized.bands.overlay.ringSpeedRadPerSec = clampToRange(
    overlayInput.ringSpeedRadPerSec,
    limits.bands.ringSpeedRadPerSec,
    defaults.bands.overlay.ringSpeedRadPerSec,
  );

  sanitized.bands.rainbow.hueOffsetDeg = clampToRange(rainbowInput.hueOffsetDeg, limits.bands.hueOffsetDeg, defaults.bands.rainbow.hueOffsetDeg);
  sanitized.bands.rainbow.saturation = clampToRange(rainbowInput.saturation, limits.bands.saturation, defaults.bands.rainbow.saturation);
  sanitized.bands.rainbow.value = clampToRange(rainbowInput.value, limits.bands.value, defaults.bands.rainbow.value);

  sanitized.bands.particleColorSource = normalizeEnum(
    bandsInput.particleColorSource,
    CONFIG.enums.bandParticleColorSources,
    defaults.bands.particleColorSource,
  );

  const orbsInput = Array.isArray(candidate.orbs) ? candidate.orbs : defaults.orbs;
  sanitized.orbs = defaults.orbs.map((fallbackOrb, index) => sanitizeOrb(orbsInput[index], fallbackOrb));

  const timingInput = isPlainObject(candidate.timing) ? candidate.timing : {};
  sanitized.timing.maxDeltaTimeSec = Number.isFinite(timingInput.maxDeltaTimeSec)
    ? timingInput.maxDeltaTimeSec
    : defaults.timing.maxDeltaTimeSec;

  return sanitized;
}
