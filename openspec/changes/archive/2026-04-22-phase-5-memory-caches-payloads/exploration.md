## Exploration: phase-5-memory-caches-payloads

### Current State
La base técnica cambió bastante más de lo que el plan maestro refleja. `PERFORMANCE_OPTIMIZATION_PLAN.md` todavía muestra Fase 4 como pendiente, pero el código ya introdujo piezas claras de UX para escala (`src/features/diagram-presentation/useDiagramPresentation.ts`) junto con culling por viewport (`src/features/diagram-canvas/DiagramCanvasSurface.tsx`) y refinamiento diferido de edges durante drag (`src/features/diagram-canvas/useDiagramCanvasModel.ts`). O sea: Fase 4 no está “virgen”; está efectivamente cerrada con caveats, aunque el plan no fue actualizado.

Para Fase 5, el problema real no está en un único hotspot sino en la duplicación de shapes a través del pipeline:

- **Modelo parseado**: `ParseResult` replica strings por tabla/columna/relación (`src/types/erd.ts`, `src/lib/sqlParser.ts`).
- **Modelo de layout**: el worker recibe otra copia completa de `tables`, `relationships` y `tablePositions` (`src/features/auto-layout/layoutWorkerProtocol.ts`, `src/features/auto-layout/useAutoLayout.ts`).
- **Modelo de render**: React Flow vuelve a envolver cada tabla y relación en `nodes`/`edges`, embebiendo `TableModel` completo dentro de `TableNodeData` y arrays de puntos/path strings por edge (`src/features/diagram-canvas/buildDiagramCanvasGraph.ts`, `src/features/diagram-canvas/diagramCanvasTypes.ts`).

Además, el store persiste estructuras potencialmente grandes sin budget explícito: `sqlText`, `diagramViewport`, `tableConfig` y sobre todo `tablePositions` se serializan siempre a localStorage (`src/store/appStore.ts`). `ERDApp.tsx` sigue leyendo el store completo de una sola vez, así que cualquier cambio persistido mantiene un radio de invalidación alto (`src/components/ERDApp.tsx`).

### Affected Areas
- `PERFORMANCE_OPTIMIZATION_PLAN.md` — debe corregirse para reflejar el cierre efectivo de Fase 4 y abrir Fase 5 con evidencia real.
- `src/types/erd.ts` — hoy mezcla shape de dominio parseado con necesidades de render/layout.
- `src/lib/sqlParser.ts` — genera objetos ricos con fuerte duplicación de strings y arrays por tabla/relación.
- `src/features/parse-sql/useDiagramModel.ts` — conserva `ParseResult` completo y crea derivados (`tableMap`, búsqueda, sets) en main thread.
- `src/features/auto-layout/layoutWorkerProtocol.ts` — manda payload completo al worker para cada layout.
- `src/features/auto-layout/useAutoLayout.ts` — recrea worker/request con `tables`, `relationships` y `tablePositions` completos.
- `src/lib/elkLayout.ts` / `src/lib/layout.ts` — consumen `TableModel[]` completos aunque layout realmente necesita una proyección más chica.
- `src/features/diagram-canvas/buildDiagramCanvasGraph.ts` — rehace `nodes` y `edges` ricos con `table` completo, callbacks y geometría serializada.
- `src/features/diagram-canvas/useDiagramCanvasModel.ts` — hace patching fino, pero sigue dependiendo de graph snapshots grandes en memoria.
- `src/store/appStore.ts` — persiste estructuras grandes sin límites ni estrategia de compactación.
- `src/components/ERDApp.tsx` — suscripción global al store y wiring que arrastra objetos grandes por toda la composición.

### Approaches
1. **Compactar primero el contrato de layout** — introducir un `LayoutModel` mínimo derivado del parseo (`tableKey`, `columnCount`/`height`, relaciones mínimas, persisted positions saneadas) y usarlo como payload único hacia el worker.
   - Pros: baja el costo de structured clone sin tocar todavía parser ni UI final; deja boundary claro entre dominio y layout; slice seguro y medible.
   - Cons: todavía deja duplicación entre parseo y render; no resuelve persistencia gigante en store por sí solo.
   - Effort: Medium.

2. **Normalizar todo el modelo end-to-end** — separar `DomainModel`, `LayoutModel` y `RenderModel` con tablas/columnas/relaciones indexadas y posibles intern pools.
   - Pros: ataca la raíz de duplicación y churn; prepara caches más serias por hash/estructura.
   - Cons: radio de cambio alto; riesgo fuerte sobre parser, layout, canvas y búsqueda al mismo tiempo; demasiado grande como primer slice.
   - Effort: High.

3. **Reducir persistencia antes que contratos** — sacar o compactar `tablePositions`/`tableConfig` del persist principal y pasar a persistencia acotada o lazy.
   - Pros: impacto rápido en localStorage, hidratación y serialización del store.
   - Cons: no reduce payload worker ni reconstrucción de graph; puede romper expectativas de UX si se hace sin política clara.
   - Effort: Low/Medium.

### Recommendation
El primer slice seguro para Fase 5 debería ser **Approach 1: compactar primero el contrato de layout**.

Concretamente: definir una proyección mínima entre `ParseResult` y layout worker, sin tocar todavía la semántica del parser ni reescribir React Flow. Hoy `createElkLayout`/`createSafeFallbackLayout` necesitan bastante menos de lo que les manda `LayoutWorkerPayload`: para layout importan keys, alturas/metadata geométrica mínima, relaciones entre tablas y posiciones persistidas válidas. Ese boundary se puede introducir detrás de `useDiagramModel`/`useAutoLayout` y medirlo con marks alrededor del `postMessage` + respuesta.

Después de eso, recién conviene abrir el segundo slice: **dejar de persistir indiscriminadamente estructuras grandes** — especialmente revisar `tablePositions` y `tableConfig` en `src/store/appStore.ts`, con budgets, partialización más agresiva o persistencia separada por necesidad real.

### Risks
- Cambiar shapes demasiado pronto puede romper los contratos implícitos entre parser, layout fallback, edge routing y nodos.
- Si se persigue “memoria” tocando React Flow completo de entrada, el cambio se vuelve transversal e inmanejable.
- Sin medir payload real de workers y tamaño de localStorage, Fase 5 corre riesgo de optimizar intuiciones.
- `ERDApp.tsx` sigue siendo composition root útil, pero su suscripción completa al store puede enmascarar ganancias si no se acotan selectors después.
- El plan maestro está desfasado: si no se corrige antes, se puede seguir priorizando mal el trabajo.

### Ready for Proposal
Yes — pero con dos condiciones explícitas para el próximo paso:

1. **Actualizar primero `PERFORMANCE_OPTIMIZATION_PLAN.md`** para decir la verdad: Fase 4 quedó efectivamente cerrada con caveats/documentación pendiente, y la etapa actual pasa a ser Fase 5.
2. **Limitar el proposal al primer slice**: contrato mínimo de layout + medición de payload/serialización. No mezclar todavía normalización integral del dominio ni rediseño total del store.
