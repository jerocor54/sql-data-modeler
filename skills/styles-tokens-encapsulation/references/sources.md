# Fuentes resumidas

## Astro docs

- **Styles and CSS**: explica opciones de estilos globales, scoped y modulares dentro del ecosistema Astro.

## MDN

- **CSS custom properties**: base técnica para tokens de tema y composición de estilos sin hardcodes repetidos.

## Design Tokens Community Group

- Sirve como referencia prudente para diferenciar tokens base, semánticos y de componente.
- Importante: **no se toma como contrato rígido**; se usa para ordenar mejor decisiones de naming y ownership visual.

## Por qué importan para este repo

- `src/styles/global.css` ya concentra tokens, reset, componentes compartidos y muchas reglas visuales.
- Si sigue creciendo sin criterio, cualquier refactor visual va a tener blast radius innecesario.

## Links de referencia

- Astro Styling: https://docs.astro.build/en/guides/styling/
- MDN CSS custom properties: https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
- Design Tokens Community Group: https://www.designtokens.org/
