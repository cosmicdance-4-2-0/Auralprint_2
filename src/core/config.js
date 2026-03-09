/**
 * Canonical configuration. This module defines static defaults + limits only.
 * It must remain immutable for the life of the process.
 */

/**
 * Code-only numeric constant.
 * Reason: TAU is a mathematical identity used for readability in angular limits.
 * It is not user-facing and should not be tuned through UX.
 */
const TAU = Math.PI * 2;

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const child = value[key];
    if (child && typeof child === 'object') {
      deepFreeze(child);
    }
  }

  return Object.freeze(value);
}

export function deepClone(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

const configDefinition = {
  ui: {
    panelBackgroundRgba: 'rgba(0,0,0,0.72)',
    panelBlurPx: 6,
    panelPaddingPx: 10,
    panelGapPx: 10,
    panelRadiusPx: 10,
    audioPanelHeightPx: 64,
    iconButtonSizePx: 40,
    volume: { min: 0, max: 1, step: 0.01 },
  },

  enums: {
    traceLineColorModes: ['fixed', 'lastParticle', 'dominantBand'],
    bandParticleColorSources: ['fixed', 'dominant', 'angle'],
    bandOverlayPhaseModes: ['orb', 'free'],
    orbChannelIds: ['L', 'R', 'C'],
  },

  defaults: {
    visuals: {
      backgroundColor: '#000000',
      particleColor: '#ffffff',
    },

    trace: {
      lines: false,
      numLines: 5,
      lineAlpha: 0.35,
      lineWidthPx: 2,
      lineColorMode: 'fixed',
    },

    particles: {
      emitPerSecond: 180,
      sizeMaxPx: 6,
      sizeMinPx: 1,
      sizeToMinSec: 3,
      ttlSec: 6,
      overlapRadiusPx: 6,
    },

    motion: {
      angularSpeedRadPerSec: Math.PI * 0.75,
      waveformRadialDisplaceFrac: 0.18,
    },

    audio: {
      fftSize: 2048,
      smoothingTimeConstant: 0.5,
      rmsGain: 6,
      minRadiusFrac: 0.01,
      maxRadiusFrac: 0.8,
      loop: true,
      muted: false,
      volume: 1,
    },

    bands: {
      count: 256,
      floorHz: 10,
      ceilingHz: 26000,
      logSpacing: true,
      overlay: {
        enabled: true,
        connectAdjacent: true,
        alpha: 0.65,
        pointSizePx: 3,
        lineAlpha: 0.35,
        lineWidthPx: 1,
        phaseMode: 'orb',
        ringSpeedRadPerSec: 0.35,
      },
      rainbow: {
        hueOffsetDeg: 0,
        saturation: 0.9,
        value: 1,
      },
      particleColorSource: 'dominant',
    },

    orbs: [
      { id: 'ORB0', chanId: 'R', bandIds: [], chirality: -1, startAngleRad: 0 },
      { id: 'ORB1', chanId: 'L', bandIds: [], chirality: -1, startAngleRad: Math.PI },
    ],

    timing: {
      maxDeltaTimeSec: 1 / 30,
    },
  },

  limits: {
    trace: {
      numLines: { min: 1, max: 1000, step: 1 },
      lineAlpha: { min: 0, max: 1, step: 0.01 },
      lineWidthPx: { min: 1, max: 6, step: 1 },
    },

    particles: {
      emitPerSecond: { min: 4, max: 420, step: 1 },
      sizeMaxPx: { min: 1, max: 8, step: 0.1 },
      sizeMinPx: { min: 0.5, max: 6, step: 0.1 },
      sizeToMinSec: { min: 1, max: 240, step: 1 },
      ttlSec: { min: 1, max: 480, step: 1 },
      overlapRadiusPx: { min: 0.5, max: 40, step: 0.5 },
    },

    motion: {
      angularSpeedRadPerSec: { min: 0.01, max: TAU, step: 0.01 },
      waveformRadialDisplaceFrac: { min: 0.001, max: 1, step: 0.001 },
    },

    audio: {
      rmsGain: { min: 0.05, max: 10, step: 0.05 },
      minRadiusFrac: { min: 0.01, max: 0.3, step: 0.01 },
      maxRadiusFrac: { min: 0.05, max: 1, step: 0.01 },
      smoothingTimeConstant: { min: 0, max: 0.99, step: 0.01 },
      fftSizes: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
    },

    bands: {
      overlayAlpha: { min: 0, max: 1, step: 0.01 },
      pointSizePx: { min: 1, max: 10, step: 1 },
      hueOffsetDeg: { min: 0, max: 360, step: 1 },
      saturation: { min: 0, max: 1, step: 0.01 },
      value: { min: 0, max: 1, step: 0.01 },
      ringSpeedRadPerSec: { min: 0, max: TAU, step: 0.01 },
    },
  },
};

export const CONFIG = deepFreeze(configDefinition);
