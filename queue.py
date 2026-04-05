"""Queue — ordered list of audio files with a cursor.

Interface (stable):
    add(filepath) -> int
    remove(index) -> str | None
    clear()
    go_to(index) -> str | None
    next() -> str | None
    prev() -> str | None
    current() -> str | None
    shuffle() -> bool
    snapshot() -> QueueSnapshot
    can_next, can_prev, length, current_index
    pick_auto_advance(repeat_mode) -> str | None
    pick_manual_next(repeat_mode) -> str | None
    pick_manual_prev(repeat_mode) -> str | None
"""

import os
import random


REPEAT_MODES = ("none", "one", "all")


class QueueSnapshot:
    """Read-only view of the queue state for UI rendering."""

    __slots__ = ("items", "cursor", "length")

    def __init__(self, items, cursor, length):
        self.items = items      # list of {index, name, active}
        self.cursor = cursor    # int
        self.length = length    # int


class Queue:

    def __init__(self):
        self._items = []    # list of {filepath: str, name: str}
        self._cursor = -1

    # ── Add / Remove / Clear ──────────────────────────────────

    def add(self, filepath):
        """Add a file to the end of the queue. Returns the new item index."""
        name = os.path.basename(filepath)
        self._items.append({"filepath": filepath, "name": name})
        return len(self._items) - 1

    def remove(self, index):
        """Remove item at index. Returns the new current filepath, or None if empty.

        Cursor adjustment:
          - Removing before cursor: cursor decrements to stay on same track.
          - Removing current track: cursor stays (now points to next), clamped.
          - Removing after cursor: cursor unchanged.
        """
        if index < 0 or index >= len(self._items):
            return self.current()
        self._items.pop(index)

        if len(self._items) == 0:
            self._cursor = -1
            return None

        if index < self._cursor:
            self._cursor -= 1
        elif index == self._cursor:
            self._cursor = min(self._cursor, len(self._items) - 1)

        return self.current()

    def clear(self):
        """Remove all items and reset cursor."""
        self._items.clear()
        self._cursor = -1

    # ── Navigation ────────────────────────────────────────────

    def go_to(self, index):
        """Move cursor to index and return that filepath, or None if out of range."""
        if index < 0 or index >= len(self._items):
            return None
        self._cursor = index
        return self._items[self._cursor]["filepath"]

    def next(self):
        """Advance cursor. Returns filepath, or None if at end."""
        if not self.can_next:
            return None
        self._cursor += 1
        return self._items[self._cursor]["filepath"]

    def prev(self):
        """Move cursor back. Returns filepath, or None if at start."""
        if not self.can_prev:
            return None
        self._cursor -= 1
        return self._items[self._cursor]["filepath"]

    def current(self):
        """The filepath at the cursor, or None."""
        if self._cursor < 0 or self._cursor >= len(self._items):
            return None
        return self._items[self._cursor]["filepath"]

    @property
    def can_next(self):
        return len(self._items) > 0 and self._cursor < len(self._items) - 1

    @property
    def can_prev(self):
        return len(self._items) > 0 and self._cursor > 0

    @property
    def length(self):
        return len(self._items)

    @property
    def current_index(self):
        return self._cursor

    def set_cursor(self, index):
        """Direct cursor write. Used when add() triggers first auto-play."""
        if 0 <= index < len(self._items):
            self._cursor = index

    # ── Repeat-aware navigation ───────────────────────────────

    def pick_auto_advance(self, repeat_mode):
        """Choose the next file on track end. Returns filepath or None.

        Modes:
          "none" — play next if available, otherwise stop.
          "one"  — replay the current track.
          "all"  — next track, wrapping to first at end.
        """
        if repeat_mode == "one":
            return self.current()

        if self.can_next:
            return self.next()

        if repeat_mode == "all" and self.length > 0:
            return self.go_to(0)

        return None

    def pick_manual_next(self, repeat_mode):
        """Choose next file for manual Next button/key. Wraps on Repeat=All."""
        if self.can_next:
            return self.next()
        if repeat_mode == "all" and self.length > 1:
            return self.go_to(0)
        return None

    def pick_manual_prev(self, repeat_mode):
        """Choose prev file for manual Prev button/key. Wraps on Repeat=All."""
        if self.can_prev:
            return self.prev()
        if repeat_mode == "all" and self.length > 1:
            return self.go_to(self.length - 1)
        return None

    # ── Shuffle ───────────────────────────────────────────────

    def shuffle(self):
        """Fisher-Yates shuffle preserving the current track. Returns True if shuffled."""
        if self.length < 3:
            return False

        current_item = self._items[self._cursor] if self._cursor >= 0 else None

        for i in range(self.length - 1, 0, -1):
            j = random.randint(0, i)
            self._items[i], self._items[j] = self._items[j], self._items[i]

        if current_item is not None:
            self._cursor = self._items.index(current_item)

        return True

    # ── Snapshot ──────────────────────────────────────────────

    def snapshot(self):
        """Read-only snapshot for UI rendering."""
        items = [
            {"index": i, "name": it["name"], "active": i == self._cursor}
            for i, it in enumerate(self._items)
        ]
        return QueueSnapshot(items, self._cursor, self.length)
