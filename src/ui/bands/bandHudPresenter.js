const DEFAULT_REFRESH_INTERVAL_MS = 100;
const DEFAULT_VISIBLE_ROW_COUNT = 12;

function formatEnergy(value) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `${pct}%`;
}

function formatMeta(metadata) {
  return `${metadata.sampleRate} Hz sample rate · Nyquist ${Math.round(metadata.nyquistHz)} Hz · ceiling ${Math.round(metadata.effectiveCeilingHz)} Hz`;
}

function isElementVisible(element) {
  return Boolean(element) && !element.hidden && element.offsetParent !== null;
}

export function createBandHudPresenter({
  panelElement,
  dominantElement,
  metaElement,
  tableBodyElement,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  visibleRowCount = DEFAULT_VISIBLE_ROW_COUNT,
} = {}) {
  const rowCount = Math.max(1, Math.floor(visibleRowCount));
  const state = {
    latestSnapshot: null,
    lastRenderAtMs: 0,
    rows: [],
  };

  function ensureRows() {
    if (!tableBodyElement || state.rows.length === rowCount) {
      return;
    }

    tableBodyElement.replaceChildren();
    state.rows = [];

    for (let i = 0; i < rowCount; i += 1) {
      const row = document.createElement('tr');

      const indexCell = document.createElement('td');
      const nameCell = document.createElement('td');
      const rangeCell = document.createElement('td');
      const energyCell = document.createElement('td');

      row.append(indexCell, nameCell, rangeCell, energyCell);
      tableBodyElement.append(row);
      state.rows.push({ row, indexCell, nameCell, rangeCell, energyCell });
    }
  }

  function ingest(snapshot) {
    state.latestSnapshot = snapshot ?? null;
  }

  function render(nowMs = performance.now()) {
    if (!state.latestSnapshot || !isElementVisible(panelElement)) {
      return null;
    }

    if (nowMs - state.lastRenderAtMs < refreshIntervalMs) {
      return null;
    }

    const snapshot = state.latestSnapshot;
    ensureRows();

    if (dominantElement) {
      dominantElement.textContent = `Dominant: [${snapshot.dominant.index}] ${snapshot.dominant.name} — ${snapshot.dominant.hzRangeText}`;
    }

    if (metaElement) {
      metaElement.textContent = formatMeta(snapshot.metadata);
    }

    const rankedBandIndexes = Array.from(snapshot.energies01, (_, index) => index)
      .sort((left, right) => snapshot.energies01[right] - snapshot.energies01[left]);

    for (let rowIndex = 0; rowIndex < state.rows.length; rowIndex += 1) {
      const cells = state.rows[rowIndex];
      const bandIndex = rankedBandIndexes[rowIndex] ?? rowIndex;

      cells.indexCell.textContent = String(bandIndex);
      cells.nameCell.textContent = snapshot.names[bandIndex] ?? `Band ${bandIndex}`;
      cells.rangeCell.textContent = `${Math.round(snapshot.lowHz[bandIndex])}–${Math.round(snapshot.highHz[bandIndex])} Hz`;
      cells.energyCell.textContent = formatEnergy(snapshot.energies01[bandIndex] ?? 0);
      cells.row.dataset.dominant = String(snapshot.dominant.index === bandIndex);
    }

    state.lastRenderAtMs = nowMs;
    return snapshot;
  }

  return {
    ingest,
    render,
  };
}
