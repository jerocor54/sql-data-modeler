---
name: astro-shell-islands
description: >
  Protege el rol de Astro como shell liviano en sql-data-modeler y define cómo
  hidratar islas React sin meter lógica extra en pages ni romper el arranque
  client-side. Trigger: cambios en index.astro, AppRoot, hydration, theming temprano,
  carga inicial y límites entre shell Astro y app React.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- Cuando un cambio toca `src/pages/index.astro` o `src/components/AppRoot.tsx`.
- Cuando hay que decidir qué se resuelve antes de hidratar y qué queda dentro de React.
- Cuando aparece una nueva isla o se cuestiona `client:load`.
- Cuando se toca theme inicial, favicons, meta tags o base path de Astro.

## Critical Patterns

- **Astro es shell, no coordinador de negocio**.
- `index.astro` puede hacer bootstrap mínimo: CSS global, metadata, theme temprano y montaje.
- `AppRoot.tsx` debe quedar chico: boundary global + composición de la app.
- **No mover parseo SQL, layout ni exportación a `.astro`**.
- Si el proyecto sigue siendo una app única, mantener una sola isla grande es válido; si aparecen zonas claramente diferibles, recién ahí evaluar split de islas.
- **Hydration rule**:

  | Caso | Directiva sugerida |
  | --- | --- |
  | App principal interactiva desde el arranque | `client:load` |
  | Panel secundario no crítico | `client:idle` o lazy interno |
  | Contenido estático de shell | sin hidratación |

- **Theme temprano**: la lógica inline de `index.astro` existe para evitar flash de tema incorrecto. Si se toca, hay que preservar ese objetivo.
- **Base path awareness**: assets, navegación y export helpers no deben asumir raíz `/` cuando Astro está configurado para GitHub Pages.

## Code Examples

```astro
---
import '../styles/global.css';
import AppRoot from '../components/AppRoot';
---

<html lang="es" data-theme="deepblue">
  <body>
    <AppRoot client:load />
  </body>
</html>
```

```tsx
// AppRoot.tsx
export default function AppRoot() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
```

```tsx
// lazy interno dentro de React, no en Astro, para zonas pesadas
const ExportDialog = lazy(() => import('./ExportDialog'));
```

## Commands

```bash
npx astro check
npx tsc --noEmit
```

## Resources

- **Documentación local**: ver [references/sources.md](references/sources.md)
