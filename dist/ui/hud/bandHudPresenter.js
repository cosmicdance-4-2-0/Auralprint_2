const HUD_REFRESH_INTERVAL_MS = 100;

function formatEnergyPercent(value01) {
  return `${Math.round((value01 || 0) * 100)}%`;
}

export function createBandHudPresenter({ tableBodyElement, dominantElement } = {}) {
  const state = {
    lastRenderMs: 0,
    cachedSignature: '',
  };

  function present(snapshot, nowMs = performance.now()) {
    if (!snapshot || !tableBodyElement) return;
    if (nowMs - state.lastRenderMs < HUD_REFRESH_INTERVAL_MS) return;

    const dominant = snapshot.dominant || { index: 0, name: '(none)', hzRangeText: '' };
    const energies = snapshot.energies01;
    const names = snapshot.names;
    const lowHz = snapshot.lowHz;
    const highHz = snapshot.highHz;

    const topIndices = [];
    for (let i = 0; i < energies.length; i += 1) {
      topIndices.push(i);
    }
    topIndices.sort((a, b) => energies[b] - energies[a]);
    const visibleIndices = topIndices.slice(0, 8);

    const signature = `${dominant.index}|${visibleIndices.map((index) => `${index}:${energies[index].toFixed(3)}`).join(',')}`;
    if (signature === state.cachedSignature) {
      state.lastRenderMs = nowMs;
      return;
    }

    tableBodyElement.innerHTML = visibleIndices
      .map((index) => {
        const isDominant = index === dominant.index;
        const rangeText = `${Math.round(lowHz[index])}–${Math.round(highHz[index])} Hz`;
        return `<tr${isDominant ? ' class="is-dominant"' : ''}><td>[${index}] ${names[index]}</td><td>${rangeText}</td><td>${formatEnergyPercent(energies[index])}</td></tr>`;
      })
      .join('');

    if (dominantElement) {
      dominantElement.textContent = `Dominant: [${dominant.index}] ${dominant.name}${dominant.hzRangeText ? ` — ${dominant.hzRangeText}` : ''}`;
    }

    state.cachedSignature = signature;
    state.lastRenderMs = nowMs;
  }

  return {
    refreshIntervalMs: HUD_REFRESH_INTERVAL_MS,
    present,
  };
}
