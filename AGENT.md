# AGENT.md

## 1. Propósito

Este documento define **cómo conviene arrancar y evolucionar `sql-data-modeler` desde el día 1** si hoy empezáramos de cero, pero aprovechando lo que ya aprendimos construyéndolo.

No es un inventario del presente ni un changelog. Es una guía operativa para tomar mejores decisiones iniciales, evitar trampas conocidas y preservar lo que ya sabemos que sí funciona.

## Skills locales del proyecto

Este repo ahora tiene un set de skills locales para guiar refactors y decisiones de arquitectura frontend/Astro con criterios consistentes y accionables.

### Para qué existen

- bajar ambigüedad cuando haya que cortar `ERDApp.tsx`
- evitar refactors cosméticos sin mejorar boundaries reales
- mantener a Astro como shell y a React como motor interactivo
- encapsular performance, estilos y features sin mezclar todo otra vez

### Regla de prioridad

**Si el cambio es transversal, cargá primero `frontend-app-architecture`.**

Eso incluye cualquier intervención que toque más de una de estas zonas al mismo tiempo:

- shell Astro
- componentes React
- features
- store
- `lib/`
- estilos/tokens

### Mapeo: contexto detectado → skill a cargar

| Contexto detectado | Skill |
| --- | --- |
| Refactor transversal, reordenamiento de carpetas, ownership entre módulos, extracción grande desde `ERDApp.tsx` | `frontend-app-architecture` |
| Cambios en `src/pages/index.astro`, `AppRoot`, hydration, theme temprano, límites shell/islas | `astro-shell-islands` |
| Corte de componentes React, extracción de hooks, separación entre orquestación y presentación | `react-component-boundaries` |
| Creación o extracción de casos de uso como parseo, auto-layout, exportación, búsqueda | `feature-encapsulation` |
| Reordenamiento de `global.css`, theming, tokens, variables CSS, estilo por componente o feature | `styles-tokens-encapsulation` |
| Hotspots de CPU, render pesado, lazy loading, workers, optimización de parse/layout/export | `heavy-client-performance` |

### Combinaciones útiles

| Situación | Skills recomendadas |
| --- | --- |
| Cortar `ERDApp.tsx` en piezas mantenibles | `frontend-app-architecture` + `react-component-boundaries` |
| Extraer parseo/layout/export a módulos con contratos claros | `frontend-app-architecture` + `feature-encapsulation` |
| Replantear shell Astro y diferir UI pesada | `astro-shell-islands` + `heavy-client-performance` |
| Separar toolbar/overlays del canvas y bajar rerenders | `react-component-boundaries` + `heavy-client-performance` |
| Ordenar tema global y estilos de features nuevas | `frontend-app-architecture` + `styles-tokens-encapsulation` |
| Refactor completo de arquitectura visual + funcional | `frontend-app-architecture` + `react-component-boundaries` + `feature-encapsulation` |

### Ubicación

- índice: `skills/README.md`
- skills: `skills/*/SKILL.md`
- referencias compiladas: `skills/*/references/sources.md`

---

## 2. Qué es este repositorio

`sql-data-modeler` debe nacer y mantenerse como una herramienta **100% client-side** para transformar **SQL DDL en un ERD interactivo** dentro del navegador.

### Naturaleza del producto

- frontend estático
- sin backend
- sin API propia
- sin autenticación
- sin persistencia remota
- sin conexión en vivo a bases de datos
- sin SSR de negocio

Todo lo importante pasa en el navegador del usuario.

---

## 3. Decisiones técnicas que conviene tomar desde el inicio

Estas son decisiones que YA sabemos que valen la pena conservar:

- **Astro** como shell y punto de entrada estático
- **React + TypeScript** para la app interactiva
- **Zustand** para estado global con persistencia local
- **React Flow** para el canvas ERD
- **ELK** como layout principal
- **fallback layout** adicional para resiliencia
- **Monaco** como editor principal con fallback real a `textarea`

### Principio rector

La base debe optimizar tres cosas antes que nada:

1. **comprensión del esquema**
2. **exploración visual fluida**
3. **exportación útil para comunicación**

Si una decisión técnica no mejora eso, probablemente no sea prioritaria.

---

## 4. Principios de arquitectura desde el día 1

### 4.1 Separar responsabilidades temprano

La principal lección técnica es esta: **no volver a concentrar demasiada lógica en un único componente coordinador**.

Si hoy arrancáramos de cero, evitaríamos repetir el patrón de `ERDApp.tsx` como contenedor de:

- parseo
- layout
- routing de edges
- estado derivado
- exportación
- foco visual
- interacción del editor
- preferencias de UI

### 4.2 Capas recomendadas

Organizar el proyecto en estas áreas, con límites claros:

- **shell**: bootstrap, entrypoints, theming temprano, error boundary
- **domain**: tipos ERD, parser, reglas de transformación
- **application**: orquestación de casos de uso, adaptación parser → layout → canvas
- **diagram**: layout, routing, geometría, nodos y edges
- **editor**: ingreso SQL, warnings, navegación a líneas, import/export del SQL
- **state**: store persistido y preferencias del usuario
- **ui**: paneles, toolbar, controles visuales

### 4.3 Resiliencia como requisito, no como parche

Desde el inicio hay que diseñar fallbacks explícitos para:

- editor (`Monaco` → `textarea`)
- layout (`ELK` → fallback alternativo)
- errores de runtime (`ErrorBoundary`)

Acá no hay magia: si la app es client-side pura, la resiliencia de frontend ES el producto.

---

## 5. Invariantes del sistema

Estas reglas no deberían romperse sin una decisión consciente:

1. **El producto sigue siendo frontend estático.**
2. **El input principal es SQL DDL pegado o cargado por archivo.**
3. **El valor principal está en entender, explorar y exportar.**
4. **La persistencia temprana debe ser local y útil para UX.**
5. **El parser no debe prometer cobertura SQL total.**
6. **La UI no debe mostrar capacidades que el motor no sostiene de verdad.**
7. **Layout y edge routing deben priorizar legibilidad visual antes que sofisticación aparente.**
8. **El deploy debe seguir siendo compatible con hosting estático y base path.**

---

## 6. Anti-patrones y caminos que ya sabemos que NO conviene tomar

### 6.1 No vender dialectos antes de implementarlos

Un selector de dialecto visible sin comportamiento real genera expectativa falsa. Si no hay diferencias efectivas en parsing, validación o comportamiento, entonces:

- no se expone la opción, o
- se comunica explícitamente como futura / experimental

### 6.2 No exponer controles de UI sin impacto real

Cada opción visible que no modifica verdaderamente la experiencia se convierte en deuda de producto, deuda de diseño y deuda de confianza.

Regla práctica: **si el usuario puede elegirlo, el sistema debe honrarlo de manera observable**.

### 6.3 No meter más lógica transversal en el componente principal

Si una feature nueva necesita tocar demasiados `useMemo`, `useEffect`, handlers y estado derivado en el coordinador principal, hay olor a mala arquitectura.

### 6.4 No tocar layout de forma ingenua

Layout, handles, geometría y routing están acoplados por resultado visual. Un cambio “local” puede destruir:

- espaciado
- lectura de relaciones
- cruces evitables
- legibilidad exportada

### 6.5 No presentar el parser como si fuera un compilador SQL completo

El parser es una zona delicada. Debe tratarse como un subsistema con límites claros, cobertura incremental y validación manual fuerte.

---

## 7. Estructura de código recomendada

Si hoy reordenáramos el proyecto desde el comienzo, convendría apuntar a algo así:

```text
src/
  pages/
  components/
    app/
    editor/
    diagram/
    nodes/
    edges/
  features/
    parse-sql/
    auto-layout/
    export-diagram/
    search-diagram/
  lib/
    parser/
    layout/
    routing/
    geometry/
  store/
  types/
  styles/
```

### Criterio

- separar por responsabilidad real, no por conveniencia momentánea
- mantener parser/layout/routing como dominios reconocibles
- evitar que el archivo principal se vuelva “la app entera”

---

## 8. Criterios para tocar cada zona crítica

### 8.1 Parser

Antes de cambiar parser:

- definir qué subconjunto SQL entra realmente
- aclarar qué casos quedan fuera
- verificar impacto en warnings, errores y referencias ambiguas
- evitar claims de compatibilidad por dialecto sin cobertura real

Al tocar parser hay que revisar siempre:

- normalización de identificadores
- resolución de referencias con/sin schema
- heurísticas de columnas target
- reporting de errores y líneas
- comportamiento con DDL incompleto o ambiguo

### 8.2 Layout y routing

Antes de cambiar layout o edges:

- asumir que es una zona de alta sensibilidad visual
- validar diagramas chicos, medianos y casos con muchas relaciones
- revisar exportación además de canvas interactivo

Nunca evaluar layout solo por “que compile”. Hay que mirarlo.

### 8.3 Store y persistencia

Persistencia local aporta mucho valor desde temprano. Por eso:

- conservar compatibilidad de shape cuando sea posible
- versionar cambios de persistencia con criterio
- no guardar estado efímero inútil
- priorizar continuidad de trabajo real del usuario

Persistir temprano sí. Persistir cualquier cosa, no.

### 8.4 UI y controles

Toda opción visible debe pasar esta prueba:

- ¿está implementada de verdad?
- ¿cambia comportamiento o solo apariencia superficial?
- ¿genera expectativa que hoy no podemos cumplir?

Si falla alguna, no debería entrar al MVP.

---

## 9. Alcance técnico recomendado para el arranque

### Sí conviene tener desde el inicio

- edición y pegado de SQL
- importación/exportación de `.sql`
- parseo acotado de DDL útil
- warnings y errores comprensibles
- ERD interactivo
- auto-layout resiliente
- búsqueda básica de tablas/columnas
- persistencia local
- exportación visual
- theming y preferencias mínimas de alto impacto

### No conviene meter en etapa inicial

- colaboración multiusuario
- backend “por las dudas”
- sincronización remota
- edición visual avanzada del modelo
- claims de soporte completo multi-dialecto
- opciones cosméticas cuya implementación real no exista

---

## 10. Validación manual obligatoria

Como hoy no hay una suite visible de tests que cubra parser/layout/UI, toda intervención en zonas críticas debe pasar validación manual.

### Checklist mínimo

#### Parser
- pegar SQL válido simple
- pegar SQL con FK inline
- pegar `ALTER TABLE` soportado
- verificar warnings por referencias ambiguas
- verificar errores por referencias inválidas

#### Editor
- probar carga de archivo `.sql`
- probar descarga del SQL actual
- verificar fallback del editor si Monaco no carga
- verificar navegación a líneas desde warnings/errores

#### Diagrama
- confirmar que no haya solapamientos graves
- revisar legibilidad de relaciones
- mover tablas manualmente
- refrescar y confirmar persistencia local
- probar búsqueda de tabla/columna

#### Exportación
- exportar SVG
- exportar PNG/JPEG
- confirmar que el diagrama exportado mantenga legibilidad básica

#### Deploy estático
- validar que paths y assets respeten `base`
- evitar asumir raíz `/`

---

## 11. Reglas prácticas para evolucionar bien el proyecto

1. **Primero honestidad de producto, después amplitud aparente.**
2. **Primero modularidad, después velocidad falsa de iteración.**
3. **Primero legibilidad del diagrama, después complejidad algorítmica vistosa.**
4. **Primero persistencia útil, después features accesorias.**
5. **Primero expectativas realistas del parser, después marketing técnico.**
6. **Primero compatibilidad con deploy estático, después supuestos de entorno local.**
7. **Primero controles verdaderos, después opciones decorativas.**

---

## 12. Qué conservaríamos sí o sí si arrancáramos de nuevo

- base **Astro + React + TypeScript**
- store con **Zustand** y persistencia local
- canvas con **React Flow**
- layout principal con **ELK**
- diseño con fallbacks reales
- exportación como parte central del valor
- hosting estático tipo **GitHub Pages** contemplado desde el inicio

Eso ya mostró ser una base válida. Lo que cambiaríamos no es la esencia, sino la disciplina arquitectónica y de alcance.

---

## 13. Regla final

Si hoy empezáramos `sql-data-modeler` desde cero, lo construiríamos para ser:

- simple en infraestructura
- honesto en capacidades
- modular en arquitectura
- resiliente en experiencia
- fuerte en comprensión, exploración y exportación

Todo cambio futuro debería proteger esas cinco cosas.
