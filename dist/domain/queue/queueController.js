/** Runtime-only queue state and navigation behavior for Build 112. */
export function createQueueController() {
  const state = {
    items: [],
    activeIndex: -1,
    shuffleEnabled: false,
  };

  function clampIndex(index) {
    if (!state.items.length) return -1;
    return Math.max(0, Math.min(state.items.length - 1, index));
  }

  function setItems(items = [], { activeIndex = 0 } = {}) {
    state.items = Array.isArray(items) ? items.slice() : [];
    state.activeIndex = state.items.length ? clampIndex(activeIndex) : -1;
    return getQueueState();
  }

  function addItems(items = []) {
    if (!Array.isArray(items) || !items.length) {
      return getQueueState();
    }

    state.items.push(...items);
    if (state.activeIndex === -1) {
      state.activeIndex = 0;
    }

    return getQueueState();
  }

  function setShuffleEnabled(enabled) {
    state.shuffleEnabled = Boolean(enabled);
    return getQueueState();
  }

  function clear() {
    state.items = [];
    state.activeIndex = -1;
    return getQueueState();
  }

  function jumpTo(index) {
    if (!state.items.length) {
      state.activeIndex = -1;
      return null;
    }
    state.activeIndex = clampIndex(index);
    return state.items[state.activeIndex] ?? null;
  }

  function removeAt(index) {
    if (!state.items.length) return null;
    if (!Number.isInteger(index) || index < 0 || index >= state.items.length) return null;

    const [removedItem] = state.items.splice(index, 1);
    if (!state.items.length) {
      state.activeIndex = -1;
      return removedItem;
    }

    if (state.activeIndex > index) {
      state.activeIndex -= 1;
    } else if (state.activeIndex >= state.items.length) {
      state.activeIndex = state.items.length - 1;
    }

    return removedItem;
  }

  function getRandomNextIndex() {
    if (state.items.length <= 1) return state.activeIndex;
    let nextIndex = state.activeIndex;
    while (nextIndex === state.activeIndex) {
      nextIndex = Math.floor(Math.random() * state.items.length);
    }
    return nextIndex;
  }

  function next() {
    if (!state.items.length) return null;
    if (state.activeIndex === -1) {
      state.activeIndex = 0;
      return state.items[state.activeIndex];
    }

    state.activeIndex = state.shuffleEnabled
      ? getRandomNextIndex()
      : (state.activeIndex + 1) % state.items.length;
    return state.items[state.activeIndex] ?? null;
  }

  function previous() {
    if (!state.items.length) return null;
    if (state.activeIndex === -1) {
      state.activeIndex = 0;
      return state.items[state.activeIndex];
    }

    state.activeIndex = state.shuffleEnabled
      ? getRandomNextIndex()
      : (state.activeIndex - 1 + state.items.length) % state.items.length;
    return state.items[state.activeIndex] ?? null;
  }

  function getQueueState() {
    return {
      items: state.items.slice(),
      length: state.items.length,
      activeIndex: state.activeIndex,
      shuffleEnabled: state.shuffleEnabled,
    };
  }

  return {
    setItems,
    addItems,
    next,
    previous,
    clear,
    jumpTo,
    removeAt,
    setShuffleEnabled,
    getQueueState,
  };
}
