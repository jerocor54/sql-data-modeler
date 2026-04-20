---
name: frontend-app-architecture
description: >
  Define la arquitectura transversal de sql-data-modeler para refactors grandes,
  extracción de módulos desde ERDApp.tsx y decisiones de ownership entre shell,
  features, lib, store y UI. Trigger: cambios cross-cutting, reordenamiento de
  carpetas, definición de capas, contratos entre módulos y criterios de escalabilidad.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- Cuando un cambio toca `src/components/ERDApp.tsx` y además afecta store, parser, layout o UI.
- Cuando hay que decidir si algo vive en `components/`, `features/`, `lib/`, `store/` o `styles/`.
- Cuando el refactor es transversal y puede crear deuda si se resuelve archivo por archivo.
- Cuando necesitás definir el target structure antes de mover código.

## Critical Patterns

- **Prioridad absoluta**: si el cambio es transversal, esta skill se carga primero.
- **Astro queda como shell**. Nada de meter lógica de negocio en `.astro`.
- **`ERDApp.tsx` no debe seguir creciendo**. Su destino es quedar como composition root o desaparecer detrás de features más chicas.
- **Capas recomendadas para este repo**:

  | Capa | Responsabilidad | Ejemplos actuales |
  | --- | --- | --- |
  | shell | bootstrap, hydration, error boundaries, theme temprano | `src/pages/index.astro`, `src/components/AppRoot.tsx`, `src/components/AppErrorBoundary.tsx` |
  | domain/lib | parseo, layout, routing, geometría, tipos | `src/lib/sqlParser.ts`, `src/lib/elkLayout.ts`, `src/lib/edgeRouting.ts`, `src/types/erd.ts` |
  | state | preferencias persistidas y estado compartido durable | `src/store/appStore.ts` |
  | features | casos de uso orquestados con contratos explícitos | futuro `src/features/parse-sql`, `src/features/auto-layout`, `src/features/export-diagram` |
  | ui/components | piezas de interfaz, sin orquestación transversal | `src/components/SqlEditorPanel.tsx`, nodos, edges |

- **Regla de ownership**:
  - `lib/` = lógica reutilizable sin dependencia de rendering.
  - `features/` = coordina múltiples módulos para entregar un caso de uso.
  - `components/` = presenta y emite eventos, no decide flujos globales.
  - `store/` = preferencias persistidas y estado compartido; NO cálculos pesados ni derivados complejos.
- **No mezclar estado persistido con estado efímero de interacción** si eso obliga a re-renderizar toda la app.
- **Toda extracción desde `ERDApp.tsx` debe dejar un contrato**: props, hook, selector de store o servicio de feature.
- **Primero mover responsabilidades, después embellecer carpetas**. Cambiar nombres sin aislar dependencias es maquillaje.

## Code Examples

```text
src/
  components/
    app/
      AppShell.tsx
    diagram/
      DiagramCanvas.tsx
    editor/
      SqlEditorWorkspace.tsx
  features/
    parse-sql/
      useParsedModel.ts
    auto-layout/
      useAutoLayout.ts
    export-diagram/
      exportDiagram.ts
```

```ts
// composition root liviano
export function AppShell() {
  const theme = useAppStore((state) => state.theme);

  return (
    <AppErrorBoundary>
      <SqlWorkspace theme={theme} />
      <DiagramWorkspace />
    </AppErrorBoundary>
  );
}
```

```ts
// lib: puro y testeable
export function buildDiagramModel(sqlText: string, dialect: Dialect) {
  const parsed = parseSqlToModel(sqlText, dialect);
  return {
    parsed,
    tableMap: new Map(parsed.tables.map((table) => [table.key, table] as const)),
  };
}
```

## Commands

```bash
mkdir -p src/features src/components/app src/components/diagram src/components/editor
npx tsc --noEmit
```

## Resources

- **Documentación local**: ver [references/sources.md](references/sources.md)
