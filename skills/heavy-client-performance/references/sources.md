# Fuentes resumidas

## React docs

- **lazy** y **Suspense**: ayudan a diferir código pesado no crítico y bajar costo inicial.
- **Purity**: si render y hooks no son puros, optimizar después se vuelve una pesadilla.

## web.dev

- **Off-main-thread / Web Workers**: referencia clave para mover parseo o layout si el main thread queda saturado.

## Por qué importan para este repo

- El producto vive entero en el navegador.
- Parseo, layout, routing y export compiten por CPU en el mismo thread.
- Si la UX se bloquea, no hay backend que la rescate: el problema ES la app.

## Links de referencia

- React lazy: https://react.dev/reference/react/lazy
- React Suspense: https://react.dev/reference/react/Suspense
- React Purity: https://react.dev/reference/rules/components-and-hooks-must-be-pure
- web.dev Off-main-thread: https://web.dev/articles/off-main-thread
- MDN Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
