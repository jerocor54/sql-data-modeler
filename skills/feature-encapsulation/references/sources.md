# Fuentes resumidas

## React docs

- **Thinking in React** y **Custom Hooks** ayudan a traducir casos de uso a piezas reusables.

## Feature-Sliced Design

- **Overview + Layers**: referencia útil para separar feature, shared logic y app shell.
- De nuevo: se usa como guía fuerte, NO como contrato rígido ni estándar oficial.

## Por qué importan para este repo

- Hoy editor, diagrama, layout, export y búsqueda están demasiado cerca dentro de `ERDApp.tsx`.
- Si no se encapsulan como features, cada mejora futura va a seguir tocando el mismo archivo monstruo.

## Links de referencia

- React Thinking in React: https://react.dev/learn/thinking-in-react
- React Reusing Logic with Custom Hooks: https://react.dev/learn/reusing-logic-with-custom-hooks
- Feature-Sliced Design Overview: https://feature-sliced.design/
- Feature-Sliced Design Layers: https://feature-sliced.design/docs/reference/layers
