# Skills locales de `sql-data-modeler`

Este proyecto define skills locales para refactorizar y evolucionar la app con criterio arquitectónico, no a los ponchazos.

## Índice

| Skill | Para qué sirve |
| --- | --- |
| `frontend-app-architecture` | Gobernar decisiones transversales de arquitectura, capas y ownership del código. |
| `astro-shell-islands` | Mantener a Astro como shell liviano y delimitar correctamente las islas hidratadas. |
| `react-component-boundaries` | Cortar componentes grandes, especialmente `ERDApp.tsx`, con límites claros. |
| `feature-encapsulation` | Extraer features con contratos explícitos y dependencias controladas. |
| `styles-tokens-encapsulation` | Ordenar tokens, temas y estilos sin seguir mezclando reglas globales sin dueño. |
| `heavy-client-performance` | Optimizar trabajo pesado en cliente: parseo, layout, export y rendering. |

## Regla de uso rápido

- Si el cambio toca varias zonas a la vez, cargá primero `frontend-app-architecture`.
- Si el cambio nace en `src/pages/index.astro` o `src/components/AppRoot.tsx`, combiná con `astro-shell-islands`.
- Si el cambio nace en `src/components/ERDApp.tsx`, casi seguro necesitás `react-component-boundaries` y alguna skill complementaria.
