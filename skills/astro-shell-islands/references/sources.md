# Fuentes resumidas

## Astro docs

- **Islands architecture**: define el principio central de Astro; hidratar solo lo que necesita JavaScript real.
- **Project structure**: ayuda a no mezclar responsabilidades entre `pages`, `components` y lógica de aplicación.
- **Front-end frameworks**: explica cómo conviven componentes React dentro del shell Astro.
- **Styles and CSS**: relevante para decidir qué estilos quedan globales y cuáles deben encapsularse.

## Por qué importan para este repo

- `src/pages/index.astro` hoy resuelve el theme antes de hidratar.
- `src/components/AppRoot.tsx` ya funciona como root React mínimo.
- La app completa es client-side, pero eso NO justifica convertir Astro en un dumping ground de lógica.

## Links de referencia

- Astro Islands: https://docs.astro.build/en/concepts/islands/
- Astro Project Structure: https://docs.astro.build/en/basics/project-structure/
- Astro Framework Components: https://docs.astro.build/en/guides/framework-components/
- Astro Styling: https://docs.astro.build/en/guides/styling/
