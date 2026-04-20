---
name: react-component-boundaries
description: >
  Define límites de componentes y hooks en sql-data-modeler para cortar ERDApp.tsx,
  separar presentación de orquestación y evitar componentes que concentren render,
  efectos, estado derivado y acciones pesadas. Trigger: refactors en React, extracción
  de subárboles UI, custom hooks y reducción de complejidad del componente principal.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- Cuando un componente supera claramente una sola responsabilidad, especialmente `ERDApp.tsx`.
- Cuando hay demasiados `useMemo`, `useEffect`, handlers y JSX en el mismo archivo.
- Cuando necesitás decidir si extraer un subcomponente, un custom hook o una utilidad pura.
- Cuando una feature nueva amenaza con meter más branches y más estado derivado en el coordinador principal.

## Critical Patterns

- **Regla brutal**: si un componente orquesta parseo, layout, export, búsqueda, theming y canvas, está mal cortado.
- **Separación sugerida para `ERDApp.tsx`**:

  | Pieza | Qué debería contener |
  | --- | --- |
  | `useDiagramModel` | parseo, table map, warnings, estado derivado puro |
  | `useAutoLayout` | layout ELK/fallback, timeouts, cancelación |
  | `useDiagramExport` | SVG/PNG/JPEG y preparación del viewport |
  | `EditorWorkspace` | panel editor, archivos, navegación a líneas |
  | `DiagramWorkspace` | React Flow, minimap, controls, overlays del canvas |
  | `Toolbar/Overlays` | controles visuales desacoplados del motor |

- **Decisión hook vs componente vs util**:

  | Si tiene... | Extraer a... |
  | --- | --- |
  | lógica de estado/efectos reutilizable | custom hook |
  | cálculo puro sin React | función en `lib/` o `features/` |
  | JSX con responsabilidades visuales claras | componente |

- **Pureza**: nada de side effects dentro de `useMemo` o render.
- **Props chicas, contratos claros**. Si pasás media app por props, no resolviste el problema.
- **Store selectors**: leer solo lo necesario para no rerenderizar el árbol completo.
- **Nunca crear subcomponentes “presentacionales” que dependan del store global en silencio**. Eso rompe boundaries.

## Code Examples

```tsx
function ERDApp() {
  const diagramModel = useDiagramModel();
  const autoLayout = useAutoLayout(diagramModel);
  const exportDiagram = useDiagramExport();

  return (
    <AppLayout
      editor={<EditorWorkspace model={diagramModel} />}
      diagram={<DiagramWorkspace model={diagramModel} layout={autoLayout} onExport={exportDiagram.run} />}
    />
  );
}
```

```ts
function useDiagramModel() {
  const sqlText = useAppStore((state) => state.sqlText);
  const dialect = useAppStore((state) => state.dialect);

  return useMemo(() => buildDiagramModel(sqlText, dialect), [sqlText, dialect]);
}
```

## Commands

```bash
npx tsc --noEmit
```

## Resources

- **Documentación local**: ver [references/sources.md](references/sources.md)
