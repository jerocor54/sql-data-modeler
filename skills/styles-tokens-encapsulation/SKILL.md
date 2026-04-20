---
name: styles-tokens-encapsulation
description: >
  Ordena estilos y tokens de sql-data-modeler para separar theme global, tokens
  semánticos y estilos de feature/componente sin seguir engordando global.css.
  Trigger: refactors de CSS, theming, design tokens, variables globales y encapsulación visual.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- Cuando `src/styles/global.css` vuelve a crecer con reglas sin dueño.
- Cuando se agregan colores, radios, spacing o variantes de tema.
- Cuando una feature necesita estilos propios y no corresponde meterlos en global.
- Cuando hay que distinguir token global, token semántico y override por componente.

## Critical Patterns

- **No usar `global.css` como cajón de sastre**.
- **Jerarquía recomendada de tokens**:

  | Nivel | Rol | Ejemplos del repo |
  | --- | --- | --- |
  | base | valores primitivos | azules, grises, sombras, radios |
  | semantic | intención de UI | `--color-surface`, `--color-text-muted`, `--shadow-panel` |
  | component/feature | override local | tabla, toolbar, overlay, panel editor |

- Los tokens actuales `--bg`, `--surface`, `--text`, etc. sirven, pero conviene migrarlos gradualmente a nombres más semánticos si se empieza a escalar diseño.
- **Temas viven arriba** (`:root`, `[data-theme=...]`), no dispersos por componentes.
- **Feature o componente con estilo específico**: usar CSS Module o archivo local; dejar global solo para reset, layout macro y tokens compartidos.
- **No hardcodear colores nuevos** en JSX o TS si ya existe intención equivalente en tokens.
- **Config visual persistida** como `tableConfig` no reemplaza design tokens; son niveles distintos.

## Code Examples

```css
/* src/styles/tokens.css */
:root {
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --shadow-panel: 0 14px 35px rgba(37, 99, 235, 0.1);
}

:root[data-theme='deepblue'] {
  --color-surface: #0c1636;
  --color-text: #d8e7ff;
}
```

```css
/* src/components/diagram/DiagramToolbar.module.css */
.root {
  background: color-mix(in srgb, var(--color-surface) 86%, transparent);
  color: var(--color-text);
}
```

## Commands

```bash
mkdir -p src/styles
npx tsc --noEmit
```

## Resources

- **Documentación local**: ver [references/sources.md](references/sources.md)
