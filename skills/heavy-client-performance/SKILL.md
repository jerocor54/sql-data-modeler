---
name: heavy-client-performance
description: >
  Optimiza trabajo pesado en cliente dentro de sql-data-modeler: parseo, layout,
  routing, exportación y rendering de React Flow sin bloquear la UX. Trigger:
  hotspots de CPU, interacciones lentas, cálculos pesados, lazy loading y uso de workers.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- Cuando parsear SQL grande, recalcular layout o exportar empieza a congelar la UI.
- Cuando aparecen renders repetidos por selectors amplios o cálculos en render.
- Cuando se evalúa mover trabajo a `Web Worker` o dividir bundles pesados.
- Cuando se toca `ERDApp.tsx`, `sqlParser.ts`, `elkLayout.ts`, `orthogonalRouter.ts` o export helpers por razones de performance.

## Critical Patterns

- **Primero medir el hotspot real**. No optimizar por intuición.
- **Hotspots esperables en este repo**:

  | Zona | Riesgo |
  | --- | --- |
  | `parseSqlToModel` | CPU síncrona en cada cambio de SQL |
  | `createElkLayout` / fallback layout | trabajo pesado y potenciales timeouts |
  | routing ortogonal | geometría costosa con muchos edges |
  | export con `html-to-image` | costo alto de serialización y rasterización |
  | store global | rerenders si se consumen demasiados campos a la vez |

- **Orden recomendado de optimización**:
  1. aislar cálculos puros y memoizarlos bien;
  2. reducir subscriptions del store;
  3. lazy-load de UI o librerías pesadas no críticas;
  4. si sigue pesado, evaluar `Web Worker` para parseo/layout.
- **Web Worker sí, pero con criterio**: mover trabajo puro y serializable; no APIs del DOM.
- **Suspense/lazy** sirven para bundle y arranque, NO para arreglar CPU pesada por sí solos.
- **No persistir ni recalcular de más**. Persistencia útil no significa guardar todo ni recomputar todo en cada input.

## Code Examples

```ts
const parsedModel = useMemo(() => parseSqlToModel(sqlText, dialect), [sqlText, dialect]);
```

```ts
const ExportDialog = lazy(() => import('./ExportDialog'));
```

```ts
// candidato a worker: cálculo puro y serializable
self.onmessage = (event) => {
  const { sqlText, dialect } = event.data;
  const result = parseSqlToModel(sqlText, dialect);
  self.postMessage(result);
};
```

## Commands

```bash
npx tsc --noEmit
npm run dev
```

## Resources

- **Documentación local**: ver [references/sources.md](references/sources.md)
