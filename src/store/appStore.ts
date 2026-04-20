import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Dialect,
  DiagramViewport,
  Position,
  RelationGroupingMode,
  RelationLinePattern,
  RelationLineStyle,
  TableDesignTheme,
  TableVisualConfig,
  ThemeMode,
  TypeDisplayMode,
  ViewTab,
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

interface AppState {
  sqlText: string;
  theme: ThemeMode;
  hasHydrated: boolean;
  globalTypeMode: TypeDisplayMode;
  exportScale: 1 | 2 | 3 | 4;
  lineStyle: RelationLineStyle;
  linePattern: RelationLinePattern;
  relationGrouping: RelationGroupingMode;
  tableDesignTheme: TableDesignTheme;
  dialect: Dialect;
  viewMode: ViewMode;
  activeViewTab: ViewTab;
  diagramViewport: DiagramViewport | null;
  panelSplit: number;
  tableConfig: Record<string, TableVisualConfig>;
  tablePositions: Record<string, Position>;
  setHasHydrated: (value: boolean) => void;
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
  setActiveViewTab: (tab: ViewTab) => void;
  setDiagramViewport: (viewport: DiagramViewport) => void;
  setPanelSplit: (value: number) => void;
  setTableConfig: (tableKey: string, patch: Partial<TableVisualConfig>) => void;
  resetAllTableColorsToTheme: () => void;
  setTablePosition: (tableKey: string, position: Position) => void;
  resetTablePositions: () => void;
  ensureTableConfig: (tableKey: string) => TableVisualConfig;
}

function readInitialViewPreferences(): Pick<AppState, 'viewMode' | 'activeViewTab'> {
  if (typeof window === 'undefined') {
    return {
      viewMode: 'split',
      activeViewTab: 'editor',
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        viewMode: 'split',
        activeViewTab: 'editor',
      };
    }

    const parsed = JSON.parse(raw);
    const persistedViewMode = parsed?.state?.viewMode;
    const persistedActiveViewTab = parsed?.state?.activeViewTab;

    return {
      viewMode: persistedViewMode === 'tabs' ? 'tabs' : 'split',
      activeViewTab: persistedActiveViewTab === 'diagram' ? 'diagram' : 'editor',
    };
  } catch {
    return {
      viewMode: 'split',
      activeViewTab: 'editor',
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
      globalTypeMode: 'text',
      exportScale: 2,
      lineStyle: 'orthogonal',
      linePattern: 'solid',
      relationGrouping: 'separate',
      tableDesignTheme: 'modern',
      dialect: 'auto',
      viewMode: initialViewPreferences.viewMode,
      activeViewTab: initialViewPreferences.activeViewTab,
      diagramViewport: null,
      panelSplit: 42,
      tableConfig: {},
      tablePositions: {},
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
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
      setActiveViewTab: (activeViewTab) => set({ activeViewTab }),
      setDiagramViewport: (diagramViewport) => set({ diagramViewport }),
      setPanelSplit: (panelSplit) => set({ panelSplit: Math.max(22, Math.min(78, panelSplit)) }),
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
      setTablePosition: (tableKey, position) =>
        set((state) => ({
          tablePositions: {
            ...state.tablePositions,
            [tableKey]: position,
          },
        })),
      resetTablePositions: () => set({ tablePositions: {} }),
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
        state?.setHasHydrated(true);
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
        activeViewTab: state.activeViewTab,
        diagramViewport: state.diagramViewport,
        panelSplit: state.panelSplit,
        tableConfig: state.tableConfig,
        tablePositions: state.tablePositions,
      }),
    },
  ),
);
