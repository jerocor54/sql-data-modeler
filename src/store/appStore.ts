import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type {
  Dialect,
  Position,
  RelationGroupingMode,
  RelationLinePattern,
  RelationLineStyle,
  TableDesignTheme,
  TableVisualConfig,
  ThemeMode,
  TypeDisplayMode,
  ViewMode,
} from '../types/erd';

const DEFAULT_SQL = `CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sku VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  total_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);`;

const DEFAULT_TABLE_CONFIG: TableVisualConfig = {
  bgColor: '#1E293B',
  textColor: '#E2E8F0',
  useThemeDefaults: true,
};

const STORAGE_KEY = 'sql-data-modeler-store-v1';
type LegacyTablePositionSnapshot = Record<string, Position>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function isFinitePosition(value: unknown): value is Position {
  return isPlainObject(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function parseLegacyTablePositions(value: unknown): LegacyTablePositionSnapshot {
  if (!isPlainObject(value)) return {};

  const snapshot: LegacyTablePositionSnapshot = {};

  for (const [tableKey, position] of Object.entries(value)) {
    if (!isFinitePosition(position)) return {};
    snapshot[tableKey] = { x: position.x, y: position.y };
  }

  return snapshot;
}

function cloneLegacyTablePositionSnapshot(snapshot: LegacyTablePositionSnapshot): LegacyTablePositionSnapshot {
  return Object.fromEntries(Object.entries(snapshot).map(([tableKey, position]) => [tableKey, { x: position.x, y: position.y }]));
}

function readPreHydrationLegacyTablePositionSnapshot(): LegacyTablePositionSnapshot {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parseLegacyTablePositions(parsed?.state?.tablePositions);
  } catch {
    return {};
  }
}

const preHydrationLegacyTablePositionSnapshot = readPreHydrationLegacyTablePositionSnapshot();

export function getPreHydrationLegacyTablePositionSnapshot(): LegacyTablePositionSnapshot {
  return cloneLegacyTablePositionSnapshot(preHydrationLegacyTablePositionSnapshot);
}

export interface AppState {
  sqlText: string;
  theme: ThemeMode;
  hasHydrated: boolean;
  hasStoreHydrated: boolean;
  globalTypeMode: TypeDisplayMode;
  exportScale: 1 | 2 | 3 | 4;
  lineStyle: RelationLineStyle;
  linePattern: RelationLinePattern;
  relationGrouping: RelationGroupingMode;
  tableDesignTheme: TableDesignTheme;
  dialect: Dialect;
  viewMode: ViewMode;
  tableConfig: Record<string, TableVisualConfig>;
  setHasHydrated: (value: boolean) => void;
  setHasStoreHydrated: (value: boolean) => void;
  setSqlText: (value: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setGlobalTypeMode: (mode: TypeDisplayMode) => void;
  setExportScale: (scale: 1 | 2 | 3 | 4) => void;
  setLineStyle: (style: RelationLineStyle) => void;
  setLinePattern: (pattern: RelationLinePattern) => void;
  setRelationGrouping: (mode: RelationGroupingMode) => void;
  setTableDesignTheme: (theme: TableDesignTheme) => void;
  setDialect: (dialect: Dialect) => void;
  setViewMode: (mode: ViewMode) => void;
  setTableConfig: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
  resetAllTableColorsToTheme: () => void;
  ensureTableConfig: (tableKey: string) => TableVisualConfig;
}

export type DurableAppState = Pick<
  AppState,
  | 'sqlText'
  | 'theme'
  | 'globalTypeMode'
  | 'exportScale'
  | 'lineStyle'
  | 'linePattern'
  | 'relationGrouping'
  | 'tableDesignTheme'
  | 'dialect'
  | 'viewMode'
  | 'tableConfig'
>;

function readInitialViewPreferences(): Pick<AppState, 'viewMode'> {
  if (typeof window === 'undefined') {
    return {
      viewMode: 'split',
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        viewMode: 'split',
      };
    }

    const parsed = JSON.parse(raw);
    const persistedViewMode = parsed?.state?.viewMode;

    return {
      viewMode: persistedViewMode === 'tabs' ? 'tabs' : 'split',
    };
  } catch {
    return {
      viewMode: 'split',
    };
  }
}

const initialViewPreferences = readInitialViewPreferences();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sqlText: DEFAULT_SQL,
      theme: 'deepblue',
      hasHydrated: false,
      hasStoreHydrated: false,
      globalTypeMode: 'text',
      exportScale: 2,
      lineStyle: 'orthogonal',
      linePattern: 'solid',
      relationGrouping: 'separate',
      tableDesignTheme: 'modern',
      dialect: 'auto',
      viewMode: initialViewPreferences.viewMode,
      tableConfig: {},
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setHasStoreHydrated: (hasStoreHydrated) => set({ hasStoreHydrated }),
      setSqlText: (value) => set({ sqlText: value }),
      setTheme: (theme) => set({ theme }),
      setGlobalTypeMode: (globalTypeMode) => set({ globalTypeMode }),
      setExportScale: (exportScale) => set({ exportScale }),
      setLineStyle: (lineStyle) => set({ lineStyle }),
      setLinePattern: (linePattern) => set({ linePattern }),
      setRelationGrouping: (relationGrouping) => set({ relationGrouping }),
      setTableDesignTheme: (tableDesignTheme) => set({ tableDesignTheme }),
      setDialect: (dialect) => set({ dialect }),
      setViewMode: (viewMode) => set({ viewMode }),
      setTableConfig: (tableKey, patch) =>
        set((state) => ({
          tableConfig: {
            ...state.tableConfig,
            [tableKey]: {
              ...DEFAULT_TABLE_CONFIG,
              ...(state.tableConfig[tableKey] ?? {}),
              ...patch,
            },
          },
        })),
      resetAllTableColorsToTheme: () =>
        set((state) => ({
          tableConfig: Object.fromEntries(
            Object.entries(state.tableConfig).map(([tableKey, config]) => [
              tableKey,
              {
                ...config,
                useThemeDefaults: true,
              },
            ]),
          ),
        })),
      ensureTableConfig: (tableKey) => {
        const existing = get().tableConfig[tableKey];
        if (existing) return existing;
        get().setTableConfig(tableKey, DEFAULT_TABLE_CONFIG);
        return DEFAULT_TABLE_CONFIG;
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        state?.setHasStoreHydrated(true);
      },
      partialize: (state) => ({
        sqlText: state.sqlText,
        theme: state.theme,
        globalTypeMode: state.globalTypeMode,
        exportScale: state.exportScale,
        lineStyle: state.lineStyle,
        linePattern: state.linePattern,
        relationGrouping: state.relationGrouping,
        tableDesignTheme: state.tableDesignTheme,
        dialect: state.dialect,
        viewMode: state.viewMode,
        tableConfig: state.tableConfig,
      }),
    },
  ),
);

export function useAppStoreHasHydrated(): boolean {
  return useAppStore((state) => state.hasHydrated);
}

export function useAppStoreHasStoreHydrated(): boolean {
  return useAppStore((state) => state.hasStoreHydrated);
}

export function useAppStoreHydrationActions() {
  return useAppStore(
    useShallow((state) => ({
      setHasHydrated: state.setHasHydrated,
    })),
  );
}

export function useAppStoreSqlState() {
  return useAppStore(
    useShallow((state) => ({
      sqlText: state.sqlText,
      setSqlText: state.setSqlText,
    })),
  );
}

export function useAppStoreDurablePreferences() {
  return useAppStore(
    useShallow((state) => ({
      theme: state.theme,
      setTheme: state.setTheme,
      globalTypeMode: state.globalTypeMode,
      setGlobalTypeMode: state.setGlobalTypeMode,
      exportScale: state.exportScale,
      setExportScale: state.setExportScale,
      linePattern: state.linePattern,
      setLinePattern: state.setLinePattern,
      relationGrouping: state.relationGrouping,
      setRelationGrouping: state.setRelationGrouping,
      tableDesignTheme: state.tableDesignTheme,
      setTableDesignTheme: state.setTableDesignTheme,
      dialect: state.dialect,
      setDialect: state.setDialect,
      viewMode: state.viewMode,
      setViewMode: state.setViewMode,
    })),
  );
}

export function useAppStoreTableConfigState() {
  return useAppStore(
    useShallow((state) => ({
      tableConfig: state.tableConfig,
      setTableConfig: state.setTableConfig,
      resetAllTableColorsToTheme: state.resetAllTableColorsToTheme,
    })),
  );
}
