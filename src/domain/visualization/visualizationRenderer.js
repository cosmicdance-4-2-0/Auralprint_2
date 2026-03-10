const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hsvToRgb01(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;

  if (mod === 0) return [v, t, p];
  if (mod === 1) return [q, v, p];
  if (mod === 2) return [p, v, t];
  if (mod === 3) return [p, q, v];
  if (mod === 4) return [t, p, v];
  return [v, p, q];
}

function hexToRgb01(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return [1, 1, 1];
  const clean = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const value = Number.parseInt(clean.slice(1), 16);
  if (!Number.isFinite(value)) return [1, 1, 1];
  return [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
}

function rgb01ToCss(rgb, alpha = 1) {
  return `rgba(${Math.round(clamp(rgb[0], 0, 1) * 255)}, ${Math.round(clamp(rgb[1], 0, 1) * 255)}, ${Math.round(clamp(rgb[2], 0, 1) * 255)}, ${clamp(alpha, 0, 1)})`;
}

function lerpRgb01(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

export function createVisualizationRenderer() {
  const state = {
    canvas: null,
    latestFrame: null,
  };

  function bindCanvas(canvas) {
    state.canvas = canvas ?? null;
  }

  function getCanvasState() {
    const canvas = state.canvas;
    const widthPx = canvas?.width ?? 0;
    const heightPx = canvas?.height ?? 0;
    const dpr = globalThis.devicePixelRatio || 1;
    const minDim = Math.min(widthPx, heightPx);
    const centerX = widthPx * 0.5;
    const centerY = heightPx * 0.5;

    return { canvas, widthPx, heightPx, dpr, minDim, centerX, centerY };
  }

  function simToScreen(xNorm, yNorm, canvasState) {
    return {
      x: canvasState.centerX + xNorm * canvasState.minDim,
      y: canvasState.centerY + yNorm * canvasState.minDim,
    };
  }

  function bandRgb01(index, settings) {
    const rainbow = settings.bands?.rainbow ?? {};
    const count = Math.max(1, settings.bands?.count ?? 1);
    const hueOffset = rainbow.hueOffsetDeg ?? 0;
    const hue = (((index / count) * 360 + hueOffset) % 360 + 360) % 360;
    return hsvToRgb01(hue / 360, clamp(rainbow.saturation ?? 1, 0, 1), clamp(rainbow.value ?? 1, 0, 1));
  }

  function pickParticleColorRgb01(particle, simFrame, settings) {
    const source = settings.bands?.particleColorSource ?? 'fixed';
    if (source === 'angle') {
      const hue = (((particle.angleRad / TAU) * 360 + (settings.bands?.rainbow?.hueOffsetDeg ?? 0)) % 360 + 360) % 360;
      return hsvToRgb01(hue / 360, clamp(settings.bands?.rainbow?.saturation ?? 1, 0, 1), clamp(settings.bands?.rainbow?.value ?? 1, 0, 1));
    }
    if (source === 'dominant') {
      const dominantIndex = simFrame?.bands?.dominant?.index ?? 0;
      return bandRgb01(dominantIndex, settings);
    }
    return hexToRgb01(settings.visuals?.particleColor ?? '#ffffff');
  }

  function pickLineColorRgb01(particles, simFrame, settings) {
    const mode = settings.trace?.lineColorMode ?? 'fixed';
    if (mode === 'dominantBand') {
      const dominantIndex = simFrame?.bands?.dominant?.index ?? 0;
      return bandRgb01(dominantIndex, settings);
    }
    if (mode === 'lastParticle' && particles.length > 0) {
      return pickParticleColorRgb01(particles[particles.length - 1], simFrame, settings);
    }
    return hexToRgb01(settings.visuals?.particleColor ?? '#ffffff');
  }

  function clearFrame(ctx, canvasState, settings) {
    ctx.fillStyle = settings.visuals?.backgroundColor ?? '#000000';
    ctx.fillRect(0, 0, canvasState.widthPx, canvasState.heightPx);
  }

  function drawTrailLines(ctx, orbSnapshot, simFrame, settings, canvasState) {
    if (!settings.trace?.lines) return;

    const particles = orbSnapshot.particles;
    const segments = settings.trace?.numLines ?? 0;
    const neededPts = segments + 1;
    if (!particles || particles.length < 2) return;

    const startIdx = Math.max(0, particles.length - neededPts);
    const slice = particles.slice(startIdx);
    if (slice.length < 2) return;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgb01ToCss(pickLineColorRgb01(slice, simFrame, settings), settings.trace?.lineAlpha ?? 1);
    ctx.lineWidth = (settings.trace?.lineWidthPx ?? 1) * canvasState.dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const p0 = simToScreen(slice[0].xNorm, slice[0].yNorm, canvasState);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < slice.length; i += 1) {
      const pi = simToScreen(slice[i].xNorm, slice[i].yNorm, canvasState);
      ctx.lineTo(pi.x, pi.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(ctx, orbSnapshot, simFrame, settings, canvasState) {
    const particles = orbSnapshot.particles;
    const nowSec = simFrame.nowSec;
    const sizeMax = (settings.particles?.sizeMaxPx ?? 1) * canvasState.dpr;
    const sizeMin = Math.min(settings.particles?.sizeMinPx ?? 1, settings.particles?.sizeMaxPx ?? 1) * canvasState.dpr;
    const toMin = Math.max(0.0001, settings.particles?.sizeToMinSec ?? 1);
    const ttl = Math.max(0.0001, settings.particles?.ttlSec ?? 1);
    const fadeSec = Math.max(0.0001, ttl - toMin);
    const bg = hexToRgb01(settings.visuals?.backgroundColor ?? '#000000');

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const age = nowSec - particle.bornSec;

      let size = sizeMin;
      if (age < toMin) {
        size = lerp(sizeMax, sizeMin, clamp(age / toMin, 0, 1));
      }

      const fg = pickParticleColorRgb01(particle, simFrame, settings);
      let color = fg;
      if (age >= toMin) {
        color = lerpRgb01(fg, bg, clamp((age - toMin) / fadeSec, 0, 1));
      }

      const p = simToScreen(particle.xNorm, particle.yNorm, canvasState);
      ctx.fillStyle = rgb01ToCss(color, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, TAU);
      ctx.fill();
    }
  }

  function drawBandOverlay(ctx, simFrame, settings, canvasState) {
    const overlay = settings.bands?.overlay;
    if (!overlay?.enabled || !simFrame?.bands) return;

    const energies01 = simFrame.bands.energies01;
    const count = Math.max(1, settings.bands?.count ?? energies01?.length ?? 1);
    const waveform = simFrame?.bandsWaveform ?? simFrame?.analysisWaveform ?? null;
    const minRadiusFrac = settings.audio?.minRadiusFrac ?? 0;
    const maxRadiusFrac = settings.audio?.maxRadiusFrac ?? 1;
    const safeMin = Math.min(minRadiusFrac, maxRadiusFrac);
    const safeMax = Math.max(minRadiusFrac, maxRadiusFrac);
    const waveformDisp = settings.motion?.waveformRadialDisplaceFrac ?? 0;

    const pts = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const angle = simFrame.overlay?.ringPhaseRad + (i * TAU / count);
      const energy = clamp(energies01?.[i] ?? 0, 0, 1);
      const baseR = safeMin + (safeMax - safeMin) * energy;
      let disp = 0;
      if (waveform && waveform.length > 0) {
        const phase01 = ((((angle % TAU) + TAU) % TAU) / TAU);
        const idx = Math.floor(phase01 * (waveform.length - 1));
        const sample = waveform[idx] ?? 0;
        disp = baseR * waveformDisp * sample;
      }
      const r = baseR + disp;
      pts[i] = { xNorm: r * Math.cos(angle), yNorm: r * Math.sin(angle) };
    }

    if (overlay.connectAdjacent) {
      ctx.save();
      ctx.lineWidth = (overlay.lineWidthPx ?? 1) * canvasState.dpr;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < count; i += 1) {
        const j = (i + 1) % count;
        const a = simToScreen(pts[i].xNorm, pts[i].yNorm, canvasState);
        const b = simToScreen(pts[j].xNorm, pts[j].yNorm, canvasState);
        ctx.strokeStyle = rgb01ToCss(bandRgb01(i, settings), overlay.lineAlpha ?? 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    const pointRadius = (overlay.pointSizePx ?? 1) * canvasState.dpr;
    for (let i = 0; i < count; i += 1) {
      const p = simToScreen(pts[i].xNorm, pts[i].yNorm, canvasState);
      ctx.fillStyle = rgb01ToCss(bandRgb01(i, settings), overlay.alpha ?? 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pointRadius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(simFrame, settings) {
    state.latestFrame = simFrame ?? null;

    const canvasState = getCanvasState();
    if (!canvasState.canvas || !simFrame) return;

    const ctx = canvasState.canvas.getContext('2d');
    if (!ctx) return;

    clearFrame(ctx, canvasState, settings);
    drawBandOverlay(ctx, simFrame, settings, canvasState);
    for (const orbSnapshot of simFrame.orbs ?? []) {
      drawTrailLines(ctx, orbSnapshot, simFrame, settings, canvasState);
      drawParticles(ctx, orbSnapshot, simFrame, settings, canvasState);
    }
  }

  function reset() {
    state.latestFrame = null;
    const canvasState = getCanvasState();
    if (!canvasState.canvas) return;
    const ctx = canvasState.canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvasState.widthPx, canvasState.heightPx);
  }

  return {
    bindCanvas,
    draw,
    reset,
    getState() {
      return {
        latestFrame: state.latestFrame,
      };
    },
  };
}
