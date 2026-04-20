---
name: feature-encapsulation
description: >
  Encapsula casos de uso de sql-data-modeler en features con contratos explícitos,
  minimizando acoplamiento entre editor, parser, layout, export y canvas. Trigger:
  extracción de casos de uso, creación de carpetas por feature y control de dependencias.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- Cuando un flujo combina store + lib + UI y ya no alcanza con un solo componente.
- Cuando querés extraer una capacidad completa: parsear SQL, auto-layout, exportar, buscar, resaltar, persistir preferencias.
- Cuando hay riesgo de que varios componentes dependan directamente entre sí en vez de hacerlo a través de un contrato.

## Critical Patterns

- **Feature = caso de uso con frontera propia**, no carpeta cosmética.
- **Candidatas obvias en este repo**:

  | Feature | Inputs | Outputs |
  | --- | --- | --- |
  | `parse-sql` | `sqlText`, `dialect` | modelo parseado, warnings, errores |
  | `auto-layout` | tablas, relaciones, preferencias | nodos posicionados, metadata del engine |
  | `export-diagram` | viewport, formato, escala | archivo exportable |
  | `search-diagram` | modelo, query | resultados de tabla/columna y foco |
  | `diagram-preferences` | store persistido | selectors y acciones de UI durables |

- **Regla de dependencias**:
  - feature puede usar `lib/`, `types/`, `store/` y componentes propios.
  - feature no debe depender de detalles internos de otra feature.
  - compartir código común en `lib/` o `shared/` si aparece duplicación real.
- **Cada feature debe exponer una API chica**: hook, servicio, adapter o componente root.
- **No esconder side effects críticos** en helpers sueltos sin dueño.
- **Si una feature necesita estado persistido**, preferí selectors/acciones dedicadas del store en vez de leer el store entero desde cualquier lado.

## Code Examples

```text
src/features/export-diagram/
  exportDiagram.ts
  useDiagramExport.ts
  components/
    ExportActions.tsx
```

```ts
// API pública de la feature
export interface DiagramExportRequest {
  format: 'svg' | 'png' | 'jpeg';
  scale: 1 | 2 | 3 | 4;
}

export function useDiagramExport() {
  return {
    run: async (request: DiagramExportRequest) => {
      // coordina viewport + html-to-image + download
    },
  };
}
```

## Commands

```bash
mkdir -p src/features/parse-sql src/features/auto-layout src/features/export-diagram src/features/search-diagram
npx tsc --noEmit
```

## Resources

- **Documentación local**: ver [references/sources.md](references/sources.md)
