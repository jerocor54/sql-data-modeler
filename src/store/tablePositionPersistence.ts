import type { Position } from '../types/erd';

const TABLE_POSITION_STORAGE_KEY = 'sql-data-modeler-table-positions-v1';
const LEGACY_APP_STORAGE_KEY = 'sql-data-modeler-store-v1';
const FLUSH_DEBOUNCE_MS = 200;

type PersistedTablePositions = Record<string, Position>;

interface TablePositionPersistence {
  load(): PersistedTablePositions;
  schedule(snapshot: PersistedTablePositions): void;
  flushNow(): void;
  dispose(): void;
}

type IdleHandle = number;
type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: IdleRequestCallback) => IdleHandle;
  cancelIdleCallback?: (handle: IdleHandle) => void;
};

function cloneSnapshot(snapshot: PersistedTablePositions): PersistedTablePositions {
  return Object.fromEntries(Object.entries(snapshot).map(([tableKey, position]) => [tableKey, { x: position.x, y: position.y }]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function isFinitePosition(value: unknown): value is Position {
  return isPlainObject(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function parseTablePositions(value: unknown): PersistedTablePositions {
  if (!isPlainObject(value)) return {};

  const positions: PersistedTablePositions = {};

  for (const [tableKey, position] of Object.entries(value)) {
    if (!isFinitePosition(position)) return {};
    positions[tableKey] = { x: position.x, y: position.y };
  }

  return positions;
}

function areSnapshotsEqual(left: PersistedTablePositions, right: PersistedTablePositions): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => {
    const leftPosition = left[key];
    const rightPosition = right[key];

    return leftPosition?.x === rightPosition?.x && leftPosition?.y === rightPosition?.y;
  });
}

function readDedicatedTablePositions(storage: Storage): PersistedTablePositions | null {
  const raw = storage.getItem(TABLE_POSITION_STORAGE_KEY);
  if (raw === null) return null;

  try {
    return parseTablePositions(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readLegacyTablePositions(storage: Storage): PersistedTablePositions {
  const raw = storage.getItem(LEGACY_APP_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parseTablePositions(parsed?.state?.tablePositions);
  } catch {
    return {};
  }
}

export function createTablePositionPersistence(): TablePositionPersistence {
  let lastFlushedSnapshot: PersistedTablePositions = {};
  let pendingSnapshot: PersistedTablePositions | null = null;
  let debounceTimer: number | null = null;
  let idleHandle: IdleHandle | null = null;
  let disposed = false;

  const cancelIdleFlush = () => {
    if (idleHandle === null || typeof window === 'undefined') return;

    const idleWindow = window as IdleWindow;

    if (typeof idleWindow.cancelIdleCallback === 'function') {
      idleWindow.cancelIdleCallback(idleHandle);
    } else {
      window.clearTimeout(idleHandle);
    }

    idleHandle = null;
  };

  const cancelScheduledFlush = () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    cancelIdleFlush();
  };

  const flushNow = () => {
    if (disposed || typeof window === 'undefined' || pendingSnapshot === null) return;

    cancelScheduledFlush();

    if (areSnapshotsEqual(pendingSnapshot, lastFlushedSnapshot)) {
      pendingSnapshot = null;
      return;
    }

    if (Object.keys(pendingSnapshot).length === 0) {
      window.localStorage.removeItem(TABLE_POSITION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TABLE_POSITION_STORAGE_KEY, JSON.stringify(pendingSnapshot));
    }

    lastFlushedSnapshot = cloneSnapshot(pendingSnapshot);
    pendingSnapshot = null;
  };

  const scheduleDeferredFlush = () => {
    cancelIdleFlush();

    if (typeof window === 'undefined') return;

    const idleWindow = window as IdleWindow;

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(() => {
        idleHandle = null;
        flushNow();
      });
      return;
    }

    idleHandle = window.setTimeout(() => {
      idleHandle = null;
      flushNow();
    }, 0);
  };

  return {
    load() {
      if (typeof window === 'undefined') {
        lastFlushedSnapshot = {};
        pendingSnapshot = null;
        return {};
      }

      const dedicatedSnapshot = readDedicatedTablePositions(window.localStorage);
      const loadedSnapshot = dedicatedSnapshot ?? readLegacyTablePositions(window.localStorage);

      lastFlushedSnapshot = cloneSnapshot(loadedSnapshot);
      pendingSnapshot = null;
      cancelScheduledFlush();

      return cloneSnapshot(loadedSnapshot);
    },
    schedule(snapshot) {
      if (disposed || typeof window === 'undefined') return;

      const nextSnapshot = cloneSnapshot(snapshot);

      if (areSnapshotsEqual(nextSnapshot, lastFlushedSnapshot)) {
        pendingSnapshot = null;
        cancelScheduledFlush();
        return;
      }

      if (pendingSnapshot && areSnapshotsEqual(nextSnapshot, pendingSnapshot)) return;

      pendingSnapshot = nextSnapshot;

      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        scheduleDeferredFlush();
      }, FLUSH_DEBOUNCE_MS);
    },
    flushNow,
    dispose() {
      disposed = true;
      pendingSnapshot = null;
      cancelScheduledFlush();
    },
  };
}

export {
  FLUSH_DEBOUNCE_MS,
  TABLE_POSITION_STORAGE_KEY,
  type PersistedTablePositions,
  type TablePositionPersistence,
};
