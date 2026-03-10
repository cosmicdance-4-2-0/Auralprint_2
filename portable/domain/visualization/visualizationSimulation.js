const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angleRad) {
  return ((angleRad % TAU) + TAU) % TAU;
}

function sanitizeOrbSettings(settingsOrbs = []) {
  if (!Array.isArray(settingsOrbs) || settingsOrbs.length === 0) {
    return [
      { id: 'ORB0', chanId: 'R', chirality: -1, startAngleRad: 0 },
      { id: 'ORB1', chanId: 'L', chirality: -1, startAngleRad: Math.PI },
    ];
  }

  return settingsOrbs.map((orb, index) => ({
    id: orb?.id ?? `ORB${index}`,
    chanId: typeof orb?.chanId === 'string' ? orb.chanId : 'C',
    chirality: Number.isFinite(orb?.chirality) ? orb.chirality : -1,
    startAngleRad: Number.isFinite(orb?.startAngleRad) ? orb.startAngleRad : index * Math.PI,
  }));
}

function pickOrbEnergy01(orb, analysisFrame) {
  const channelEnergy = analysisFrame?.channels?.[orb.chanId]?.energy01;
  if (Number.isFinite(channelEnergy)) {
    return clamp(channelEnergy, 0, 1);
  }

  const fallback = analysisFrame?.channels?.C?.energy01 ?? analysisFrame?.bands?.energies01?.[analysisFrame?.bands?.dominant?.index ?? 0] ?? 0;
  return clamp(fallback, 0, 1);
}

function pickOrbWaveform(orb, analysisFrame) {
  return analysisFrame?.channels?.[orb.chanId]?.waveform ?? analysisFrame?.channels?.C?.waveform ?? null;
}

function createOrbState(configOrb) {
  return {
    id: configOrb.id,
    chanId: configOrb.chanId,
    chirality: configOrb.chirality,
    startAngleRad: configOrb.startAngleRad,
    angleRad: normalizeAngle(configOrb.startAngleRad),
    trail: [],
    emitCarry: 0,
  };
}

export function createVisualizationSimulation() {
  const state = {
    orbs: [],
    settings: null,
    ringPhaseRad: 0,
    lastNowMs: null,
    latestFrame: null,
  };

  function configure(settings = {}) {
    state.settings = settings;
    const nextOrbConfigs = sanitizeOrbSettings(settings.orbs);
    const existingById = new Map(state.orbs.map((orb) => [orb.id, orb]));

    state.orbs = nextOrbConfigs.map((configOrb) => {
      const existing = existingById.get(configOrb.id);
      if (!existing) return createOrbState(configOrb);
      return {
        ...existing,
        chanId: configOrb.chanId,
        chirality: configOrb.chirality,
        startAngleRad: configOrb.startAngleRad,
      };
    });
  }

  function ensureOrbsFromSettings() {
    if (state.orbs.length === 0) {
      configure(state.settings ?? {});
    }
  }

  function step({ analysisFrame, nowMs }) {
    const settings = state.settings ?? {};
    const nowSec = nowMs / 1000;

    ensureOrbsFromSettings();

    const maxDtSec = settings.timing?.maxDeltaTimeSec ?? 1 / 30;
    let dtSec = 0;
    if (Number.isFinite(state.lastNowMs)) {
      dtSec = clamp((nowMs - state.lastNowMs) / 1000, 0, maxDtSec);
    }
    state.lastNowMs = nowMs;

    const motion = settings.motion ?? {};
    const particles = settings.particles ?? {};
    const bands = analysisFrame?.bands;

    const angularSpeedRadPerSec = motion.angularSpeedRadPerSec ?? 0;
    const waveformRadialDisplaceFrac = motion.waveformRadialDisplaceFrac ?? 0;

    const emitPerSecond = Math.max(0, particles.emitPerSecond ?? 0);
    const ttlSec = Math.max(0.0001, particles.ttlSec ?? 1);

    const minRadiusFrac = settings.audio?.minRadiusFrac ?? 0;
    const maxRadiusFrac = settings.audio?.maxRadiusFrac ?? 1;

    const orbSnapshots = state.orbs.map((orb) => {
      orb.angleRad = normalizeAngle(orb.angleRad + orb.chirality * angularSpeedRadPerSec * dtSec);

      const energy01 = pickOrbEnergy01(orb, analysisFrame);
      const waveform = pickOrbWaveform(orb, analysisFrame);
      const baseRadiusNorm = Math.min(minRadiusFrac, maxRadiusFrac) + (Math.max(minRadiusFrac, maxRadiusFrac) - Math.min(minRadiusFrac, maxRadiusFrac)) * energy01;

      let radialDisplaceNorm = 0;
      if (waveform && waveform.length > 0) {
        const phase01 = orb.angleRad / TAU;
        const idx = Math.floor(phase01 * (waveform.length - 1));
        const sample = waveform[idx] ?? 0;
        radialDisplaceNorm = baseRadiusNorm * waveformRadialDisplaceFrac * sample;
      }

      const radiusNorm = baseRadiusNorm + radialDisplaceNorm;
      const xNorm = radiusNorm * Math.cos(orb.angleRad);
      const yNorm = radiusNorm * Math.sin(orb.angleRad);

      orb.emitCarry += emitPerSecond * dtSec;
      const emitCount = Math.floor(orb.emitCarry);
      orb.emitCarry -= emitCount;

      for (let i = 0; i < emitCount; i += 1) {
        orb.trail.push({
          xNorm,
          yNorm,
          bornSec: nowSec,
          angleRad: orb.angleRad,
        });
      }

      if (orb.trail.length > 0) {
        orb.trail = orb.trail.filter((point) => nowSec - point.bornSec <= ttlSec);
      }

      return {
        id: orb.id,
        chanId: orb.chanId,
        angleRad: orb.angleRad,
        xNorm,
        yNorm,
        particles: orb.trail.slice(),
      };
    });

    const overlayPhaseMode = settings.bands?.overlay?.phaseMode ?? 'orb';
    const ringSpeedRadPerSec = settings.bands?.overlay?.ringSpeedRadPerSec ?? 0;
    if (overlayPhaseMode === 'free') {
      state.ringPhaseRad = normalizeAngle(state.ringPhaseRad + ringSpeedRadPerSec * dtSec);
    } else {
      state.ringPhaseRad = orbSnapshots[0]?.angleRad ?? 0;
    }

    state.latestFrame = {
      nowMs,
      nowSec,
      dominant: bands?.dominant ?? null,
      bands,
      analysisWaveform: analysisFrame?.channels?.C?.waveform ?? null,
      overlay: {
        ringPhaseRad: state.ringPhaseRad,
      },
      orbs: orbSnapshots,
    };

    return state.latestFrame;
  }

  function reset() {
    state.lastNowMs = null;
    state.latestFrame = null;
    state.ringPhaseRad = 0;
    for (const orb of state.orbs) {
      orb.angleRad = normalizeAngle(orb.startAngleRad);
      orb.emitCarry = 0;
      orb.trail = [];
    }
  }

  return {
    configure,
    step,
    reset,
    getState() {
      return {
        latestFrame: state.latestFrame,
      };
    },
  };
}
