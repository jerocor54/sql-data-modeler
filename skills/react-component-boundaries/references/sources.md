# Fuentes resumidas

## React docs

- **Thinking in React**: ayuda a separar jerarquía visual, ownership de estado y responsabilidades.
- **Reusing Logic with Custom Hooks**: fundamental para sacar lógica de `ERDApp.tsx` sin duplicarla.
- **Components and Hooks must be pure**: evita efectos escondidos en render y memorias mal usadas.
- **lazy / Suspense**: útil para partir UI pesada sin bloquear render inicial.

## Por qué importan para este repo

- `ERDApp.tsx` supera ampliamente el tamaño razonable y mezcla motor + UI + side effects.
- React Flow, exportación y layout ya generan suficiente complejidad como para seguir agregando todo ahí sería una mala idea.

## Links de referencia

- React Thinking in React: https://react.dev/learn/thinking-in-react
- React Reusing Logic with Custom Hooks: https://react.dev/learn/reusing-logic-with-custom-hooks
- React Purity: https://react.dev/reference/rules/components-and-hooks-must-be-pure
- React lazy: https://react.dev/reference/react/lazy
- React Suspense: https://react.dev/reference/react/Suspense
