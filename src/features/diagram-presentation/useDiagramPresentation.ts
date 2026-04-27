import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';

import type { Relationship } from '../../types/erd';

export type DiagramPresentationStrategy = 'normal' | 'large' | 'extreme';
export type DiagramPresentationMode = 'full' | 'overview' | 'focus';
export type DiagramFocusDepth = 0 | 1 | 2;

export interface DiagramPresentationNodeMembership {
  ids: string[];
  key: string;
  count: number;
}

interface UseDiagramPresentationInput {
  ambiguousFocusTableIds: Set<string>;
  edges: Edge[];
  highlightedEdgeIds: Set<string>;
  membership: DiagramPresentationNodeMembership;
  previewTableId: string | null;
  relationships: Relationship[];
  searchQuery: string;
  searchFocusedTableIds: Set<string>;
  searchResultTableIds: Set<string>;
  selectedRelationshipId: string | null;
  selectedTableId: string | null;
  tableNameById: Map<string, string>;
}

export type DiagramFocusContextKind =
  | 'selected-table'
  | 'preview-table'
  | 'selected-relationship'
  | 'ambiguous-focus'
  | 'search-focus'
  | 'search-results';

export interface DiagramFocusContext {
  id: string;
  kind: DiagramFocusContextKind;
  label: string;
  originLabel: string;
  seedNodeIds: Set<string>;
}

interface DiagramPresentationResult {
  activeFocusContext: DiagramFocusContext | null;
  activeFocusContextId: string | null;
  activeFocusContextIndex: number;
  activeFocusContextViewportNodeIds: Set<string>;
  automaticMode: DiagramPresentationMode;
  automaticReason: string;
  canDecreaseFocusDepth: boolean;
  canIncreaseFocusDepth: boolean;
  currentAutomaticStrategy: DiagramPresentationStrategy;
  effectiveMode: DiagramPresentationMode;
  effectiveReason: string;
  effectiveFocusDepth: DiagramFocusDepth | null;
  focusContextCount: number;
  focusContexts: DiagramFocusContext[];
  focusViewportRequestToken: number;
  focusSignalCount: number;
  focusVisibilityLabel: string | null;
  focusVisibleEdgeCount: number | null;
  focusVisibleNodeCount: number | null;
  overviewPriorityNodeIds: Set<string>;
  goToNextFocusContext: () => void;
  goToPreviousFocusContext: () => void;
  isAutomaticMode: boolean;
  isAutomaticFocusDepth: boolean;
  requestedMode: DiagramPresentationMode | 'auto';
  reduceFocusDepth: () => void;
  requestCenterActiveFocusContext: () => void;
  resetToAutomaticMode: () => void;
  searchMatchCount: number;
  setFocusDepth: (depth: DiagramFocusDepth) => void;
  setManualMode: (mode: DiagramPresentationMode) => void;
  expandFocusDepth: () => void;
  visibleEdgeIds: Set<string>;
  visibleNodeIds: Set<string>;
}

const STRATEGY_LIMITS: Record<DiagramPresentationStrategy, { maxFocusNodes: number; maxOverviewEdges: number }> = {
  normal: { maxFocusNodes: Number.POSITIVE_INFINITY, maxOverviewEdges: Number.POSITIVE_INFINITY },
  large: { maxFocusNodes: 24, maxOverviewEdges: 180 },
  extreme: { maxFocusNodes: 14, maxOverviewEdges: 96 },
};

const SEARCH_AUTO_FOCUS_LIMITS: Record<DiagramPresentationStrategy, number> = {
  normal: Number.POSITIVE_INFINITY,
  large: 3,
  extreme: 2,
};

const STRATEGY_DEFAULT_FOCUS_DEPTH: Record<DiagramPresentationStrategy, DiagramFocusDepth> = {
  normal: 2,
  large: 1,
  extreme: 0,
};

function getAutomaticStrategy(nodeCount: number, relationshipCount: number): DiagramPresentationStrategy {
  if (nodeCount <= 80 && relationshipCount <= 160) return 'normal';
  if (nodeCount <= 220 && relationshipCount <= 520) return 'large';
  return 'extreme';
}

function getStableSortedNodeIds(seedNodeIds: Set<string>): string[] {
  return Array.from(seedNodeIds).sort((left, right) => left.localeCompare(right));
}

function formatTableLabel(tableId: string, tableNameById: Map<string, string>): string {
  const rawLabel = tableNameById.get(tableId) ?? tableId;
  const parts = rawLabel.split('.').filter(Boolean);
  if (parts.length <= 1) return rawLabel;

  return `${parts[parts.length - 1]} (${parts.slice(0, -1).join('.')})`;
}

function buildContextLabel(kind: DiagramFocusContextKind, ids: string[], tableNameById: Map<string, string>, searchQuery: string): string {
  if (kind === 'selected-table') return `Tabla seleccionada · ${formatTableLabel(ids[0] ?? '', tableNameById)}`;
  if (kind === 'preview-table') return `Vista previa · ${formatTableLabel(ids[0] ?? '', tableNameById)}`;
  if (kind === 'selected-relationship') {
    return `Relación · ${formatTableLabel(ids[0] ?? '', tableNameById)} → ${formatTableLabel(ids[1] ?? '', tableNameById)}`;
  }
  if (kind === 'ambiguous-focus') {
    return ids.length === 1
      ? `Referencia ambigua · ${formatTableLabel(ids[0] ?? '', tableNameById)}`
      : `Referencia ambigua · ${ids.length} tablas candidatas`;
  }
  if (kind === 'search-focus') {
    return ids.length === 1
      ? `Resultado elegido · ${formatTableLabel(ids[0] ?? '', tableNameById)}`
      : `Resultados elegidos · ${ids.length} tablas`;
  }

  return `Coincidencias para “${searchQuery.trim()}” · ${ids.length} tabla${ids.length === 1 ? '' : 's'}`;
}

function getContextOriginLabel(kind: DiagramFocusContextKind): string {
  if (kind === 'selected-table') return 'por selección actual';
  if (kind === 'preview-table') return 'por vista previa';
  if (kind === 'selected-relationship') return 'por relación seleccionada';
  if (kind === 'ambiguous-focus') return 'por ambigüedad detectada';
  if (kind === 'search-focus') return 'por resultado elegido en búsqueda';
  return 'por búsqueda abierta';
}

const FOCUS_CONTEXT_PRIORITY: Record<DiagramFocusContextKind, number> = {
  'selected-table': 0,
  'selected-relationship': 1,
  'preview-table': 2,
  'search-focus': 3,
  'ambiguous-focus': 4,
  'search-results': 5,
};

function buildFocusContexts({
  ambiguousFocusTableIds,
  canUseSearchAsFocus,
  previewTableId,
  relationships,
  searchFocusedTableIds,
  searchQuery,
  searchResultTableIds,
  selectedRelationshipId,
  selectedTableId,
  tableNameById,
}: {
  ambiguousFocusTableIds: Set<string>;
  canUseSearchAsFocus: boolean;
  previewTableId: string | null;
  relationships: Relationship[];
  searchFocusedTableIds: Set<string>;
  searchQuery: string;
  searchResultTableIds: Set<string>;
  selectedRelationshipId: string | null;
  selectedTableId: string | null;
  tableNameById: Map<string, string>;
}): DiagramFocusContext[] {
  const contexts: DiagramFocusContext[] = [];

  if (selectedTableId) {
    const ids = [selectedTableId];
    contexts.push({
      id: `selected-table:${selectedTableId}`,
      kind: 'selected-table',
      label: buildContextLabel('selected-table', ids, tableNameById, searchQuery),
      originLabel: getContextOriginLabel('selected-table'),
      seedNodeIds: new Set([selectedTableId]),
    });
  }

  if (previewTableId) {
    const ids = [previewTableId];
    contexts.push({
      id: `preview-table:${previewTableId}`,
      kind: 'preview-table',
      label: buildContextLabel('preview-table', ids, tableNameById, searchQuery),
      originLabel: getContextOriginLabel('preview-table'),
      seedNodeIds: new Set([previewTableId]),
    });
  }

  if (selectedRelationshipId) {
    const relationship = relationships.find((candidate) => candidate.id === selectedRelationshipId);
    if (relationship) {
      const ids = [relationship.sourceTable, relationship.targetTable];
      contexts.push({
        id: `selected-relationship:${relationship.id}`,
        kind: 'selected-relationship',
        label: buildContextLabel('selected-relationship', ids, tableNameById, searchQuery),
        originLabel: getContextOriginLabel('selected-relationship'),
        seedNodeIds: new Set([relationship.sourceTable, relationship.targetTable]),
      });
    }
  }

  if (ambiguousFocusTableIds.size > 0) {
    const sortedIds = getStableSortedNodeIds(ambiguousFocusTableIds);
    contexts.push({
      id: `ambiguous-focus:${sortedIds.join('|')}`,
      kind: 'ambiguous-focus',
      label: buildContextLabel('ambiguous-focus', sortedIds, tableNameById, searchQuery),
      originLabel: getContextOriginLabel('ambiguous-focus'),
      seedNodeIds: new Set(sortedIds),
    });
  }

  if (searchFocusedTableIds.size > 0) {
    const sortedIds = getStableSortedNodeIds(searchFocusedTableIds);
    contexts.push({
      id: `search-focus:${sortedIds.join('|')}`,
      kind: 'search-focus',
      label: buildContextLabel('search-focus', sortedIds, tableNameById, searchQuery),
      originLabel: getContextOriginLabel('search-focus'),
      seedNodeIds: new Set(sortedIds),
    });
  }

  if (canUseSearchAsFocus && searchResultTableIds.size > 0) {
    const sortedIds = getStableSortedNodeIds(searchResultTableIds);
    contexts.push({
      id: `search-results:${searchQuery.trim().toLowerCase()}`,
      kind: 'search-results',
      label: buildContextLabel('search-results', sortedIds, tableNameById, searchQuery),
      originLabel: getContextOriginLabel('search-results'),
      seedNodeIds: new Set(sortedIds),
    });
  }

  return contexts.sort((left, right) => {
    const priorityDiff = FOCUS_CONTEXT_PRIORITY[left.kind] - FOCUS_CONTEXT_PRIORITY[right.kind];
    if (priorityDiff !== 0) return priorityDiff;

    const seedDiff = left.seedNodeIds.size - right.seedNodeIds.size;
    if (seedDiff !== 0) return seedDiff;

    return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
  });
}

function buildNeighborMap(edges: Edge[]): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();

  for (const edge of edges) {
    const sourceNeighbors = neighbors.get(edge.source) ?? new Set<string>();
    sourceNeighbors.add(edge.target);
    neighbors.set(edge.source, sourceNeighbors);

    const targetNeighbors = neighbors.get(edge.target) ?? new Set<string>();
    targetNeighbors.add(edge.source);
    neighbors.set(edge.target, targetNeighbors);
  }

  return neighbors;
}

function getFocusVisibleNodeIds(
  allNodeIds: Set<string>,
  focusSeedNodeIds: Set<string>,
  neighborMap: Map<string, Set<string>>,
  strategy: DiagramPresentationStrategy,
  focusDepth: DiagramFocusDepth,
): Set<string> {
  if (focusSeedNodeIds.size === 0) return allNodeIds;

  const visibleNodeIds = new Set<string>();
  const queue = Array.from(focusSeedNodeIds)
    .filter((id) => allNodeIds.has(id))
    .map((id) => ({ id, depth: 0 }));
  const maxFocusNodes = STRATEGY_LIMITS[strategy].maxFocusNodes;

  while (queue.length > 0 && visibleNodeIds.size < maxFocusNodes) {
    const current = queue.shift();
    if (!current || visibleNodeIds.has(current.id)) continue;

    visibleNodeIds.add(current.id);

    if (current.depth >= focusDepth) continue;

    const neighbors = neighborMap.get(current.id);
    if (!neighbors) continue;

    for (const neighborId of neighbors) {
      if (visibleNodeIds.has(neighborId) || !allNodeIds.has(neighborId)) continue;
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }

  return visibleNodeIds.size > 0 ? visibleNodeIds : allNodeIds;
}

export function getOverviewVisibleEdgeIds(
  edges: Edge[],
  visibleNodeIds: Set<string>,
  highlightedEdgeIds: Set<string>,
  focusSeedNodeIds: Set<string>,
  strategy: DiagramPresentationStrategy,
): Set<string> {
  if (strategy === 'normal') return new Set(edges.map((edge) => edge.id));

  const maxOverviewEdges = STRATEGY_LIMITS[strategy].maxOverviewEdges;
  const edgeCandidatesByPair = new Map<string, { edge: Edge; priority: number; index: number }>();

  for (const [index, edge] of edges.entries()) {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue;

    const pairKey = `${edge.source}→${edge.target}`;
    const priority = highlightedEdgeIds.has(edge.id)
      ? 0
      : focusSeedNodeIds.has(edge.source) || focusSeedNodeIds.has(edge.target)
        ? 1
        : 2;
    const current = edgeCandidatesByPair.get(pairKey);

    if (!current || priority < current.priority || (priority === current.priority && index < current.index)) {
      edgeCandidatesByPair.set(pairKey, { edge, priority, index });
    }
  }

  const prioritizedEdges = Array.from(edgeCandidatesByPair.values()).sort(
    (left, right) => left.priority - right.priority || left.index - right.index,
  );
  const visibleEdgeIds = new Set<string>();

  for (const item of prioritizedEdges) {
    if (item.priority > 0 && visibleEdgeIds.size >= maxOverviewEdges) break;
    visibleEdgeIds.add(item.edge.id);
  }

  return visibleEdgeIds;
}

function getFocusVisibleEdgeIds(edges: Edge[], visibleNodeIds: Set<string>, highlightedEdgeIds: Set<string>): Set<string> {
  return new Set(
    edges
      .filter(
        (edge) =>
          highlightedEdgeIds.has(edge.id) || (visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
      )
      .map((edge) => edge.id),
  );
}

function describeSignalCount(count: number, label: string): string {
  if (count <= 0) return '';
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function joinReasonParts(parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}

function clampFocusDepth(depth: number): DiagramFocusDepth {
  if (depth <= 0) return 0;
  if (depth >= 2) return 2;
  return 1;
}

function describeFocusDepth(depth: DiagramFocusDepth): string {
  if (depth === 0) return 'Seeds puros';
  if (depth === 1) return 'Contexto directo';
  return 'Contexto ampliado';
}

export function useDiagramPresentation({
  ambiguousFocusTableIds,
  edges,
  highlightedEdgeIds,
  membership,
  previewTableId,
  relationships,
  searchQuery,
  searchFocusedTableIds,
  searchResultTableIds,
  selectedRelationshipId,
  selectedTableId,
  tableNameById,
}: UseDiagramPresentationInput): DiagramPresentationResult {
  const [manualMode, setManualModeState] = useState<DiagramPresentationMode | null>(null);
  const [manualFocusDepth, setManualFocusDepthState] = useState<DiagramFocusDepth | null>(null);
  const [manualActiveFocusContextId, setManualActiveFocusContextId] = useState<string | null>(null);
  const [focusViewportRequestToken, setFocusViewportRequestToken] = useState(0);

  const allNodeIds = useMemo(() => new Set(membership.ids), [membership.ids, membership.key]);
  const currentAutomaticStrategy = useMemo(
    () => getAutomaticStrategy(membership.count, relationships.length),
    [membership.count, relationships.length],
  );
  const trimmedSearchQuery = searchQuery.trim();
  const searchMatchCount = searchResultTableIds.size;
  const canUseSearchAsFocus =
    trimmedSearchQuery.length > 0 &&
    searchMatchCount > 0 &&
    searchMatchCount <= SEARCH_AUTO_FOCUS_LIMITS[currentAutomaticStrategy];
  const focusContexts = useMemo(
    () =>
      buildFocusContexts({
        ambiguousFocusTableIds,
        canUseSearchAsFocus,
        previewTableId,
        relationships,
        searchFocusedTableIds,
        searchQuery,
        searchResultTableIds,
        selectedRelationshipId,
        selectedTableId,
        tableNameById,
      }),
    [
      ambiguousFocusTableIds,
      canUseSearchAsFocus,
      previewTableId,
      relationships,
      searchFocusedTableIds,
      searchQuery,
      searchResultTableIds,
      selectedRelationshipId,
      selectedTableId,
      tableNameById,
    ],
  );
  const preferredFocusContextId = focusContexts[0]?.id ?? null;
  const activeFocusContextId =
    manualActiveFocusContextId && focusContexts.some((context) => context.id === manualActiveFocusContextId)
      ? manualActiveFocusContextId
      : preferredFocusContextId;
  const activeFocusContext = focusContexts.find((context) => context.id === activeFocusContextId) ?? null;
  const activeFocusContextIndex = activeFocusContextId
    ? Math.max(
        0,
        focusContexts.findIndex((context) => context.id === activeFocusContextId),
      )
    : -1;
  const allFocusSeedNodeIds = useMemo(
    () => new Set(focusContexts.flatMap((context) => Array.from(context.seedNodeIds))),
    [focusContexts],
  );
  const focusModeSeedNodeIds = activeFocusContext?.seedNodeIds ?? allFocusSeedNodeIds;
  const hasExplicitFocusContext = focusContexts.some((context) => context.kind !== 'search-results');
  const hasFocusSignals = focusContexts.length > 0;
  const automaticMode: DiagramPresentationMode = currentAutomaticStrategy === 'normal'
    ? 'full'
    : hasFocusSignals
      ? 'focus'
      : 'overview';
  const automaticFocusDepth = STRATEGY_DEFAULT_FOCUS_DEPTH[currentAutomaticStrategy];
  const requestedMode = manualMode ?? 'auto';
  const effectiveMode: DiagramPresentationMode =
    manualMode === 'focus' && !hasFocusSignals ? automaticMode : manualMode ?? automaticMode;
  const effectiveFocusDepth = effectiveMode === 'focus'
    ? (manualFocusDepth ?? automaticFocusDepth)
    : null;
  const neighborMap = useMemo(() => buildNeighborMap(edges), [edges]);

  useEffect(() => {
    if (!manualActiveFocusContextId) return;
    if (focusContexts.some((context) => context.id === manualActiveFocusContextId)) return;
    setManualActiveFocusContextId(null);
  }, [focusContexts, manualActiveFocusContextId]);

  const automaticReason = useMemo(() => {
    if (currentAutomaticStrategy === 'normal') {
      return 'Modelo normal: se muestra full detail sin recortes automáticos.';
    }

    if (hasExplicitFocusContext) {
      const relationshipSignalCount = selectedRelationshipId ? 1 : 0;
      const reasonParts = [
        describeSignalCount(selectedTableId ? 1 : 0, 'tabla seleccionada'),
        describeSignalCount(previewTableId ? 1 : 0, 'vista previa activa'),
        describeSignalCount(ambiguousFocusTableIds.size, 'referencia ambigua activa'),
        describeSignalCount(searchFocusedTableIds.size, 'resultado elegido de búsqueda'),
        describeSignalCount(relationshipSignalCount, 'relación seleccionada'),
      ];

      return `Auto → focus porque hay contexto puntual activo. ${joinReasonParts(reasonParts)}`;
    }

    if (canUseSearchAsFocus) {
      return `Auto → focus porque la búsqueda "${trimmedSearchQuery}" dejó ${searchMatchCount} tabla${searchMatchCount === 1 ? '' : 's'} relevantes.`;
    }

    if (trimmedSearchQuery.length > 0 && searchMatchCount > 0) {
      return `Auto → overview porque la búsqueda sigue abierta, pero ${searchMatchCount} tablas coinciden y conviene mantener contexto.`;
    }

    return `Auto → overview para bajar ruido visual en estrategia ${currentAutomaticStrategy}.`;
  }, [
    ambiguousFocusTableIds.size,
    canUseSearchAsFocus,
    currentAutomaticStrategy,
    hasExplicitFocusContext,
    previewTableId,
    searchMatchCount,
    searchFocusedTableIds.size,
    selectedRelationshipId,
    selectedTableId,
    trimmedSearchQuery,
  ]);
  const effectiveReason = useMemo(() => {
    if (manualMode === null) return automaticReason;

    if (manualMode === 'focus' && !hasFocusSignals) {
      return `Focus manual volvió a ${automaticMode} porque ya no hay señales activas para sostenerlo.`;
    }

    return `Modo fijado manualmente en ${manualMode}.`;
  }, [automaticMode, automaticReason, hasFocusSignals, manualMode]);

  const visibleNodeIds = useMemo(() => {
    if (effectiveMode !== 'focus') return allNodeIds;

    return getFocusVisibleNodeIds(
      allNodeIds,
      focusModeSeedNodeIds,
      neighborMap,
      currentAutomaticStrategy,
      effectiveFocusDepth ?? automaticFocusDepth,
    );
  }, [
    allNodeIds,
    automaticFocusDepth,
    focusModeSeedNodeIds,
    currentAutomaticStrategy,
    effectiveFocusDepth,
    effectiveMode,
    neighborMap,
  ]);
  const activeFocusContextViewportNodeIds = useMemo(() => {
    if (!activeFocusContext) return new Set<string>();
    if (effectiveMode !== 'focus') return activeFocusContext.seedNodeIds;

    return getFocusVisibleNodeIds(
      allNodeIds,
      activeFocusContext.seedNodeIds,
      neighborMap,
      currentAutomaticStrategy,
      effectiveFocusDepth ?? automaticFocusDepth,
    );
  }, [
    activeFocusContext,
    allNodeIds,
    automaticFocusDepth,
    currentAutomaticStrategy,
    effectiveFocusDepth,
    effectiveMode,
    neighborMap,
  ]);

  const visibleEdgeIds = useMemo(() => {
    if (effectiveMode === 'full') return new Set(edges.map((edge) => edge.id));
    if (effectiveMode === 'focus') return getFocusVisibleEdgeIds(edges, visibleNodeIds, highlightedEdgeIds);

    return getOverviewVisibleEdgeIds(edges, visibleNodeIds, highlightedEdgeIds, allFocusSeedNodeIds, currentAutomaticStrategy);
  }, [currentAutomaticStrategy, edges, effectiveMode, allFocusSeedNodeIds, highlightedEdgeIds, visibleNodeIds]);

  const setManualMode = useCallback((mode: DiagramPresentationMode) => {
    setManualModeState(mode);
  }, []);

  const requestCenterActiveFocusContext = useCallback(() => {
    setFocusViewportRequestToken((current) => current + 1);
  }, []);

  const moveToFocusContext = useCallback(
    (direction: -1 | 1) => {
      if (focusContexts.length === 0) return;

      const focusContextIds = focusContexts.map((context) => context.id);
      const currentIndex = activeFocusContextId ? focusContextIds.indexOf(activeFocusContextId) : -1;
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (baseIndex + direction + focusContextIds.length) % focusContextIds.length;

      setManualModeState('focus');
      setManualActiveFocusContextId(focusContextIds[nextIndex] ?? focusContextIds[0] ?? null);
      setFocusViewportRequestToken((current) => current + 1);
    },
    [activeFocusContextId, focusContexts],
  );

  const goToPreviousFocusContext = useCallback(() => {
    moveToFocusContext(-1);
  }, [moveToFocusContext]);

  const goToNextFocusContext = useCallback(() => {
    moveToFocusContext(1);
  }, [moveToFocusContext]);

  const setFocusDepth = useCallback((depth: DiagramFocusDepth) => {
    setManualFocusDepthState(clampFocusDepth(depth));
    setManualModeState((currentMode) => currentMode ?? 'focus');
  }, []);

  const expandFocusDepth = useCallback(() => {
    setManualFocusDepthState((currentDepth) => clampFocusDepth((currentDepth ?? automaticFocusDepth) + 1));
    setManualModeState((currentMode) => currentMode ?? 'focus');
  }, [automaticFocusDepth]);

  const reduceFocusDepth = useCallback(() => {
    setManualFocusDepthState((currentDepth) => clampFocusDepth((currentDepth ?? automaticFocusDepth) - 1));
    setManualModeState((currentMode) => currentMode ?? 'focus');
  }, [automaticFocusDepth]);

  const resetToAutomaticMode = useCallback(() => {
    setManualModeState(null);
    setManualFocusDepthState(null);
    setManualActiveFocusContextId(null);
  }, []);

  return {
    activeFocusContext,
    activeFocusContextId,
    activeFocusContextIndex,
    activeFocusContextViewportNodeIds,
    automaticMode,
    automaticReason,
    canDecreaseFocusDepth: effectiveMode === 'focus' && (effectiveFocusDepth ?? automaticFocusDepth) > 0,
    canIncreaseFocusDepth: effectiveMode === 'focus' && (effectiveFocusDepth ?? automaticFocusDepth) < 2,
    currentAutomaticStrategy,
    effectiveMode,
    effectiveReason,
    effectiveFocusDepth,
    focusContextCount: focusContexts.length,
    focusContexts,
    focusViewportRequestToken,
    focusSignalCount: allFocusSeedNodeIds.size,
    focusVisibilityLabel: effectiveFocusDepth === null ? null : describeFocusDepth(effectiveFocusDepth),
    focusVisibleEdgeCount: effectiveFocusDepth === null ? null : visibleEdgeIds.size,
    focusVisibleNodeCount: effectiveFocusDepth === null ? null : visibleNodeIds.size,
    overviewPriorityNodeIds: allFocusSeedNodeIds,
    goToNextFocusContext,
    goToPreviousFocusContext,
    isAutomaticMode: manualMode === null,
    isAutomaticFocusDepth: manualFocusDepth === null,
    requestedMode,
    reduceFocusDepth,
    requestCenterActiveFocusContext,
    resetToAutomaticMode,
    searchMatchCount,
    setFocusDepth,
    setManualMode,
    expandFocusDepth,
    visibleEdgeIds,
    visibleNodeIds,
  };
}
