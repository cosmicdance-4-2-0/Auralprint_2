const SPECTRUM_REFRESH_INTERVAL_MS = 100;
const ENERGY_SMOOTHING = 0.32;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function formatHzRange(lowHz, highHz) {
  if (!Number.isFinite(lowHz) || !Number.isFinite(highHz)) return '';
  return `${Math.round(lowHz)}–${Math.round(highHz)} Hz`;
}

function hsvToRgbCss(h, s, v, alpha = 1) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);

  const chroma = val * sat;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;

  if (segment >= 0 && segment < 1) {
    r = chroma;
    g = x;
  } else if (segment < 2) {
    r = x;
    g = chroma;
  } else if (segment < 3) {
    g = chroma;
    b = x;
  } else if (segment < 4) {
    g = x;
    b = chroma;
  } else if (segment < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  const m = val - chroma;
  const r8 = Math.round((r + m) * 255);
  const g8 = Math.round((g + m) * 255);
  const b8 = Math.round((b + m) * 255);
  return `rgba(${r8}, ${g8}, ${b8}, ${clamp01(alpha)})`;
}

export function createSpectrum256CanvasPresenter({ canvasElement, panelElement } = {}) {
  const state = {
    lastRenderMs: 0,
    smoothedEnergies: new Float32Array(0),
    palette: {
      hueOffsetDeg: 0,
      saturation: 0.9,
      value: 1,
      barAlpha: 0.65,
      lineAlpha: 0.85,
      backgroundAlpha: 0.9,
    },
  };

  function ensureCanvasSize() {
    if (!canvasElement) return null;
    const cssWidth = Math.max(8, canvasElement.clientWidth || 8);
    const cssHeight = Math.max(48, canvasElement.clientHeight || 48);
    const dpr = window.devicePixelRatio || 1;

    const widthPx = Math.floor(cssWidth * dpr);
    const heightPx = Math.floor(cssHeight * dpr);
    if (canvasElement.width !== widthPx || canvasElement.height !== heightPx) {
      canvasElement.width = widthPx;
      canvasElement.height = heightPx;
    }

    const ctx = canvasElement.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { ctx, cssWidth, cssHeight };
  }

  function configure(settings) {
    const rainbow = settings?.bands?.rainbow;
    const overlay = settings?.bands?.overlay;

    if (rainbow) {
      state.palette.hueOffsetDeg = Number.isFinite(rainbow.hueOffsetDeg) ? rainbow.hueOffsetDeg : state.palette.hueOffsetDeg;
      state.palette.saturation = Number.isFinite(rainbow.saturation) ? rainbow.saturation : state.palette.saturation;
      state.palette.value = Number.isFinite(rainbow.value) ? rainbow.value : state.palette.value;
    }

    if (overlay) {
      state.palette.barAlpha = Number.isFinite(overlay.alpha) ? overlay.alpha : state.palette.barAlpha;
      state.palette.lineAlpha = Number.isFinite(overlay.lineAlpha) ? Math.max(overlay.lineAlpha, 0.1) : state.palette.lineAlpha;
      state.palette.backgroundAlpha = Number.isFinite(overlay.alpha) ? Math.min(0.96, Math.max(0.2, overlay.alpha + 0.2)) : state.palette.backgroundAlpha;
    }
  }

  function present(snapshot, { nowMs = performance.now() } = {}) {
    if (!snapshot || !canvasElement) return;
    if (panelElement?.hidden || (panelElement && panelElement.offsetParent === null)) return;
    if (nowMs - state.lastRenderMs < SPECTRUM_REFRESH_INTERVAL_MS) return;

    const energies = snapshot.energies01;
    if (!energies?.length) return;

    if (state.smoothedEnergies.length !== energies.length) {
      state.smoothedEnergies = new Float32Array(energies.length);
    }

    const canvasState = ensureCanvasSize();
    if (!canvasState) return;

    const { ctx, cssWidth, cssHeight } = canvasState;
    const baselineY = cssHeight - 20;
    const spectrumHeight = Math.max(12, baselineY - 12);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = `rgba(7, 11, 20, ${state.palette.backgroundAlpha})`;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const step = cssWidth / energies.length;

    ctx.beginPath();
    for (let i = 0; i < energies.length; i += 1) {
      const target = clamp01(energies[i] ?? 0);
      const smoothed = state.smoothedEnergies[i] + (target - state.smoothedEnergies[i]) * ENERGY_SMOOTHING;
      state.smoothedEnergies[i] = smoothed;

      const x = i * step;
      const barHeight = smoothed * spectrumHeight;
      if (barHeight <= 0.4) continue;
      ctx.rect(x, baselineY - barHeight, Math.max(1, step - 0.5), barHeight);
    }

    ctx.fillStyle = hsvToRgbCss(state.palette.hueOffsetDeg + 210, state.palette.saturation, state.palette.value, state.palette.barAlpha);
    ctx.fill();

    ctx.strokeStyle = hsvToRgbCss(state.palette.hueOffsetDeg + 165, state.palette.saturation, state.palette.value, state.palette.lineAlpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < state.smoothedEnergies.length; i += 1) {
      const x = i * step + step * 0.5;
      const y = baselineY - state.smoothedEnergies[i] * spectrumHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const dominant = snapshot.dominant || { index: 0, name: '(none)', hzRangeText: '' };
    const dominantRange = dominant.hzRangeText || formatHzRange(snapshot.lowHz?.[dominant.index], snapshot.highHz?.[dominant.index]);
    const minRange = formatHzRange(snapshot.lowHz?.[0], snapshot.highHz?.[snapshot.highHz.length - 1]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`Dominant: [${dominant.index}] ${dominant.name}${dominantRange ? ` — ${dominantRange}` : ''}`, 8, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
    ctx.fillText(`Range: ${minRange}`, 8, cssHeight - 15);

    if (Number.isFinite(dominant.index) && dominant.index >= 0 && dominant.index < state.smoothedEnergies.length) {
      const x = dominant.index * step;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 12, Math.max(1, step - 0.5), spectrumHeight);
    }

    state.lastRenderMs = nowMs;
  }

  return {
    refreshIntervalMs: SPECTRUM_REFRESH_INTERVAL_MS,
    configure,
    present,
  };
}
