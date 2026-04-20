# Fuentes resumidas

## Astro docs

- **Project structure**: ayuda a mantener claro qué vive en `src/pages`, qué vive en `components` y qué debe quedar fuera del shell.
- **Front-end frameworks**: confirma que Astro puede hostear React sin convertir todo el sitio en una SPA descontrolada.
- **Islands architecture**: importante porque el repo es 100% client-side, pero igual conviene conservar un shell mínimo y explícito.

## React docs

- **Thinking in React**: obliga a separar datos, jerarquía visual y ownership de estado antes de cortar componentes.
- **Reusing Logic with Custom Hooks**: clave para extraer lógica hoy pegada en `ERDApp.tsx`.
- **Components and Hooks must be pure**: importante para no meter efectos, cálculos y side effects mezclados en el render.

## Feature-Sliced Design

- **Overview + Layers**: sirve como marco conceptual para encapsular features y limitar dependencias.
- Ojo: **no es estándar oficial del ecosistema**, sino una metodología fuerte para ordenar frontend grande. Se toma como referencia pragmática, no como dogma.

## Por qué importan para este repo

- `ERDApp.tsx` hoy concentra parseo, layout, export, búsquedas, visualización y estado derivado.
- Sin una skill transversal, cada refactor corre el riesgo de mover código sin mejorar límites reales.

## Links de referencia

- Astro Islands: https://docs.astro.build/en/concepts/islands/
- Astro Project Structure: https://docs.astro.build/en/basics/project-structure/
- Astro Framework Components: https://docs.astro.build/en/guides/framework-components/
- React Thinking in React: https://react.dev/learn/thinking-in-react
- React Reusing Logic with Custom Hooks: https://react.dev/learn/reusing-logic-with-custom-hooks
- React Purity: https://react.dev/reference/rules/components-and-hooks-must-be-pure
- Feature-Sliced Design Overview: https://feature-sliced.design/
- Feature-Sliced Design Layers: https://feature-sliced.design/docs/reference/layers
