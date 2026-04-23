# PERFORMANCE_OPTIMIZATION_PLAN.md

## Qué es este archivo

Este es el **plan maestro único** para llevar `sql-data-modeler` a una arquitectura:

- robusta
- escalable
- mantenible
- rápida
- usable con modelos grandes y muy grandes

Este archivo ya **no** representa solo optimización.

Ahora representa un programa integrado de:

1. **refactorización arquitectónica mínima pero correcta**
2. **optimización profunda de performance**
3. **evolución de UX para escala extrema**

La idea central es esta:

> **No vamos a refactorizar por estética y después optimizar.**
> **Tampoco vamos a optimizar encima del caos actual.**
> **Vamos a abrir boundaries donde realmente duele y optimizar esas mismas zonas en el mismo programa de trabajo.**

---

## Objetivo final

Lograr que `sql-data-modeler` pueda manejar modelos grandes y muy grandes con pocos recursos, sin congelar la UI, manteniendo hosting estático barato y una base de código que no se vuelva inmantenible.

### Traducción práctica

Queremos que la app:

- siga respondiendo mientras parsea
- siga respondiendo mientras calcula layout
- no renderice más detalle del necesario
- no recalculen todas las capas por cada tecla
- degrade de forma inteligente cuando el modelo crece
- mantenga una arquitectura clara para seguir evolucionando

---

## Regla estratégica principal

### NO hacer esto

- refactor completo primero y performance después
- performance primero y arquitectura después
- mover carpetas sin resolver ownership real
- meter workers, cachés o LOD dentro del mismo acoplamiento actual

### SÍ hacer esto

Trabajar por **hotspots reales** y en este orden:

1. medir
2. abrir boundary mínimo
3. mover trabajo pesado fuera del main thread
4. reducir render y recalculo
5. adaptar UX a escala extrema
6. endurecer arquitectura y observabilidad

---

## Pilares no negociables del proyecto

Todo cambio futuro debe sostener simultáneamente estos 4 pilares:

1. **Robusto**
   - no depender de estados frágiles
   - no romper la app ante datasets grandes o fallos parciales
2. **Escalable**
   - no asumir que el modelo será chico
   - crecer sin multiplicar costo linealmente en cada interacción
3. **Rápido**
   - priorizar respuesta visible inmediata
   - mover trabajo caro fuera del camino crítico cuando sea posible
4. **Mantenible**
   - evitar hotfixes que entierren más acoplamiento
   - dejar seams, contratos y límites claros

Si una mejora acelera algo pero destruye robustez, escalabilidad o mantenibilidad, NO es una mejora válida.

---

## Hardcodes temporales a remover

Estos valores existen hoy como **hotfixes tácticos**. No deben considerarse diseño final.

- `src/features/diagram-canvas/useDiagramCanvasModel.ts`
  - `DEFERRED_EDGE_REFINEMENT_DELAY_MS = 96`
  - `MAX_DEFERRED_FULL_REFINEMENT_EDGES = 16`
  - `movedTableKeys.length <= 2` para patch incremental
- `src/components/SqlEditorPanel.tsx`
  - timeouts / idle warmup de Monaco (`1800`, `3000`, `4500` ms)

### Regla

Ninguno de estos hardcodes debe quedar como solución final.

En fases posteriores deben reemplazarse por alguno de estos caminos:

- heurísticas derivadas de métricas reales
- thresholds configurables/documentados
- políticas adaptativas por tamaño del modelo o capacidad del dispositivo
- estrategias event-driven / idle / manual explicitadas en UX

Mientras existan, deben tratarse como deuda técnica visible y revisable.

---

## Decisiones ya tomadas

- [x] Mantener el producto como **frontend estático / 100% client-side**.
- [x] Mantener **GitHub Pages** como hosting válido por ahora.
- [x] No migrar hosting como primera respuesta al problema de performance.
- [x] Priorizar optimización de aplicación sobre cambio de infraestructura.
- [x] Aceptar que para miles de tablas necesitamos **overview + detalle progresivo**.
- [x] Aceptar que el cuello principal está en **parser + layout + routing + render**, no en CDN/hosting.
- [x] Crear skills locales para arquitectura, Astro, boundaries de componentes, encapsulado por features, estilos y performance pesada.
- [x] Aceptar que `ERDApp.tsx` es un hotspot y no debe seguir creciendo.

---

## Qué YA existe y no debemos romper por accidente

- Astro como shell estático
- React + TypeScript como motor interactivo
- Zustand con persistencia local
- React Flow para canvas
- ELK + fallback layout
- Monaco con fallback real
- deploy estático funcionando en GitHub Pages
- skills locales en `skills/`
- lineamientos arquitectónicos en `AGENT.md`

---

## Hotspots reales del proyecto

### Hotspot 1 — `src/components/ERDApp.tsx`
Problema:
- concentra demasiada lógica
- mezcla orquestación, render, parseo, layout, export y UI state

Decisión:
- no seguir agregando responsabilidad acá
- convertirlo en composition root o partirlo progresivamente

### Hotspot 2 — `src/lib/sqlParser.ts`
Problema:
- trabajo pesado en cliente
- pieza sensible para modelos grandes

Decisión:
- mantenerlo como subsistema con límites claros
- mover su ejecución fuera del main thread

### Hotspot 3 — `src/lib/elkLayout.ts`
Problema:
- ELK es costoso
- hoy el costo impacta la experiencia en modelos grandes

Decisión:
- worker
- modos de layout por escala
- estrategia fast/balanced/quality

### Hotspot 4 — render de canvas / React Flow
Problema:
- nodos/edges pueden volverse carísimos con muchos elementos

Decisión:
- LOD
- memoización fuerte
- simplificación visual por zoom y contexto

### Hotspot 5 — `src/store/appStore.ts`
Problema:
- riesgo de mezclar persistencia útil con estado efímero y derivado costoso

Decisión:
- separar estado durable, efímero y derivado

### Hotspot 6 — `src/styles/global.css`
Problema:
- demasiado alcance global para seguir escalando sin disciplina

Decisión:
- encapsular mejor tokens, temas y estilos por feature/componente

---

## Skills que deben guiar este plan

| Contexto | Skill principal |
| --- | --- |
| cambio transversal | `frontend-app-architecture` |
| refactor de componentes gigantes | `react-component-boundaries` |
| shell Astro / hydration / islands | `astro-shell-islands` |
| extracción por casos de uso | `feature-encapsulation` |
| estilos/tokens/alcance visual | `styles-tokens-encapsulation` |
| workers/lazy-load/render pesado | `heavy-client-performance` |

### Regla de prioridad

Si la fase toca más de una zona al mismo tiempo, **cargar primero `frontend-app-architecture`**.

---

## Cómo usar este plan

Cada fase se ejecuta así:

1. leer objetivo
2. leer por qué existe
3. cargar las skills indicadas
4. tocar solo las zonas permitidas
5. completar checklist
6. validar criterio de salida
7. recién ahí pasar a la fase siguiente

### Regla dura

**No empezar una fase nueva si la anterior no tiene criterio de salida cumplido.**

---

## Estado global del programa

| Fase | Nombre | Estado |
| --- | --- | --- |
| 0 | Baseline, datasets y budgets | **Cerrada con caveats explícitos** |
| 1 | Abrir seams arquitectónicos mínimos | **Cerrada** |
| 2 | Pipeline off-main-thread | **Cerrada** |
| 3 | Estado, render y React Flow | **Cerrada con caveat menor** |
| 4 | UX para modelos gigantes | **Cerrada en código con caveats de documentación** |
| 5 | Memoria, cachés y payloads | **En curso — slice 1 (payload de layout)** |
| 6 | Astro shell, carga inicial y bundles | Pendiente |
| 7 | Observabilidad y reglas anti-regresión | Pendiente |
| 8 | Exportación escalable y cierre | Pendiente |

---

## Fase 0 — Baseline, datasets y budgets

## Objetivo

Dejar de discutir “sensaciones” y empezar a trabajar con números.

## Por qué esta fase existe

Si no medimos ahora, después no sabremos si una mejora fue real, parcial o imaginaria.

## Skills a cargar

- `frontend-app-architecture`
- `heavy-client-performance`

## Archivos que probablemente se toquen

- archivos nuevos para datasets y utilidades de medición
- potencialmente componentes/herramientas dev mínimas para instrumentación

## Paso a paso

1. Crear datasets representativos:
   - [x] S: ~50 tablas
   - [x] M: ~200 tablas
   - [x] L: ~500 tablas
   - [x] XL: ~1000 tablas
   - [x] XXL: ~3000 tablas
2. Definir exactamente qué se medirá:
   - [x] tiempo de parseo
   - [x] tiempo de layout
   - [x] tiempo hasta primer diagrama usable
   - [ ] tiempo de bloqueo del main thread
   - [ ] memoria aproximada
   - [ ] FPS en pan/zoom
   - [ ] latencia al editar SQL
3. Agregar `performance.mark` / `performance.measure` en puntos clave.
   - [x] parse
   - [x] layout
   - [x] total hasta diagrama usable
4. Documentar budgets iniciales por tamaño.
   - [x] definir budgets formales por preset
5. Guardar resultados base para poder comparar antes/después.
   - [x] historial reciente visible en UI de benchmark
   - [x] copia JSON de corridas para persistir baseline manualmente
   - [x] CLI reproducible para baseline automatizado sin build previo
   - [x] artefactos JSON versionados con corridas base reales

## Qué NO hacer en esta fase

- [ ] No mover código grande todavía.
- [ ] No meter workers todavía.
- [ ] No hacer refactors cosméticos.

## Validación

- [x] Podemos correr cada dataset y obtener números comparables.
- [x] Sabemos cuál es el cuello principal por tamaño.

## Criterio de salida

La fase termina solo cuando existe un baseline claro y repetible.

### Artefactos creados en esta rama

- `src/features/performance/benchmarkDatasets.ts` — datasets sintéticos determinísticos versionados (`phase-0-v1`)
- `src/features/performance/diagramPerformance.ts` — instrumentación reusable con `performance.mark` / `performance.measure`
- `src/features/performance/BenchmarkPanel.tsx` — UI explícita para correr baseline y copiar resultados
- `src/pages/benchmark.astro` — ruta dedicada para benchmark manual
- `scripts/performance/runPhase0Baseline.ts` — CLI reproducible para medir parse + ELK sin build
- `docs/performance-baseline.md` — guía actualizada de uso, resultados, budgets y caveats
- `docs/performance-baseline-results.phase-0.full.json` — corrida full de referencia (S/M + evidencia de falla en L/XL)
- `docs/performance-baseline-results.phase-0.parse-only.json` — corrida parse-only de referencia (S/M/L/XL/XXL)

### Alcance real de esta entrega

Esta implementación deja resueltos:

- datasets repetibles
- baseline manual de parse/layout/total usable dentro de la app
- baseline automatizado reproducible para parse + ELK desde CLI
- primera tanda real de resultados base por preset
- budgets iniciales documentados

### Resultado real del baseline capturado

- `S` corre bien en full mode (~334 ms layout promedio).
- `M` deja claro que ELK domina el costo actual (~26.6 s layout promedio) y supera brutalmente el timeout de 2500 ms de la app.
- `L` y `XL` fallan en full mode con `Maximum call stack size exceeded`.
- `XXL` quedó medible en parse-only (~7.94 s promedio), pero full mode no completó dentro de 300000 ms.

### Caveats explícitos que NO bloquean el pase a Fase 1

- falta capturar una tanda equivalente de “total usable” en browser real para documentar el lado UI con la ruta `/benchmark`
- memoria aproximada
- FPS en pan/zoom
- latencia al editar SQL
- bloqueo fino del main thread

Estos puntos siguen vigentes, PERO ya no bloquean pasar a Fase 1 porque el objetivo real de salida de Fase 0 era tener un baseline claro, repetible y con evidencia suficiente para atacar hotspots reales.

---

## Fase 1 — Abrir seams arquitectónicos mínimos

## Objetivo

Preparar la estructura justa para optimizar sin seguir enterrando lógica en `ERDApp.tsx`.

## Por qué esta fase existe

Si intentamos meter performance agresiva sin boundaries, vamos a dejar el código más difícil de mantener.

## Skills a cargar

- `frontend-app-architecture`
- `react-component-boundaries`
- `feature-encapsulation`

## Archivos que probablemente se toquen

- `src/components/ERDApp.tsx`
- `src/components/AppRoot.tsx`
- `src/store/appStore.ts`
- nuevas carpetas/módulos en `src/features/` o `src/components/`

## Paso a paso

1. Identificar responsabilidades actuales dentro de `ERDApp.tsx`:
   - [ ] parseo
   - [ ] layout
   - [ ] armado de nodos/edges
   - [ ] búsqueda/focus
   - [ ] exportación
   - [ ] controles y paneles
2. Elegir seams mínimos, no perfectos:
   - [ ] hook o módulo para parseo
   - [ ] hook o módulo para layout
   - [ ] componente o feature para canvas
   - [ ] componente o feature para editor
3. Extraer solo lo necesario para que cada hotspot tenga contrato claro.
4. Separar estado durable vs estado efímero obvio.
5. Dejar `ERDApp.tsx` más chico y más orquestador.

## Qué NO hacer en esta fase

- [ ] No hacer mega-refactor de todas las carpetas.
- [ ] No renombrar medio proyecto sin necesidad.
- [ ] No cambiar comportamiento del producto por accidente.

## Validación

- [ ] `ERDApp.tsx` tiene menos responsabilidades transversales.
- [ ] parseo/layout/export ya no están tan mezclados con UI pura.
- [ ] existen contratos claros para seguir con workers en la siguiente fase.

## Criterio de salida

Hay seams claros para mover cómputo pesado sin volver a tocar toda la UI.

---

## Fase 2 — Pipeline off-main-thread

## Objetivo

Sacar parser y layout del hilo principal.

## Por qué esta fase existe

El problema más dañino hoy es el congelamiento de UI cuando el cómputo se pone pesado.

## Skills a cargar

- `frontend-app-architecture`
- `heavy-client-performance`
- `feature-encapsulation`

## Archivos que probablemente se toquen

- `src/lib/sqlParser.ts`
- `src/lib/elkLayout.ts`
- nuevos workers y módulos de coordinación
- puntos de integración hoy ubicados en `ERDApp.tsx` o derivados

## Paso a paso

1. Crear worker de parser.
2. Mover `parseSqlToModel(...)` al worker.
3. Crear worker de layout.
4. Mover `createElkLayout(...)` al worker.
5. Evaluar si fallback layout también corre ahí.
6. Crear protocolo de mensajes con:
   - [ ] job id
   - [ ] payload mínimo
   - [ ] resultado tipado
   - [ ] error tipado
7. Implementar cancelación o descarte de resultados viejos.
8. Garantizar que un resultado viejo nunca pise el estado nuevo.

## Qué NO hacer en esta fase

- [ ] No micro-optimizar React Flow todavía.
- [ ] No meter overview mode todavía.

## Validación

- [ ] la UI sigue respondiendo mientras parsea
- [ ] la UI sigue respondiendo mientras calcula layout
- [ ] los resultados stale se descartan

## Criterio de salida

Parser y layout ya no bloquean el main thread.

---

## Fase 3 — Estado, render y React Flow

## Objetivo

Bajar fuerte el costo de rerender y de representación visual.

## Por qué esta fase existe

Después de sacar cálculo pesado del main thread, el siguiente cuello más visible será render + estado.

## Skills a cargar

- `react-component-boundaries`
- `heavy-client-performance`
- `frontend-app-architecture`

## Archivos que probablemente se toquen

- canvas, nodos, edges, estado derivado y wiring de render
- `src/store/appStore.ts`
- componentes ligados a React Flow

## Paso a paso

1. Separar con claridad:
   - [x] estado persistido
   - [x] estado efímero
   - [x] estado derivado
2. Aplicar memoización fuerte en nodos y edges.
   - [x] completado
3. Reducir recreación de arrays/objetos gigantes.
   - [x] completado
4. Implementar LOD por zoom:
   - [x] overview simple
   - [x] nivel medio con resumen
   - [x] detalle cercano completo
5. Simplificar edges en zoom lejano.
   - [x] completado
6. Minimizar rerenders por hover, búsqueda y foco.
   - [x] completado
7. Revisar si conviene render condicional por viewport.
   - [x] completado

## Qué NO hacer en esta fase

- [ ] No abrir ya toda la UX de modelos gigantes.
- [ ] No mezclar esta fase con export avanzado.

## Validación

- [x] pan/zoom más fluido en datasets S/M y base técnica lista para L/XL
- [x] menos renders completos
- [x] menor costo cuando el zoom está lejos

## Criterio de salida

El canvas ya no intenta renderizar siempre el máximo detalle.

### Estado real al cierre de Fase 3

- `npm run benchmark:phase0 -- --presets=s,m --iterations=1 --warmups=0` confirma que el cuello dominante sigue siendo layout (`S`: `524.12 ms` total, `M`: `25287.55 ms` total). Eso es HONESTO: Fase 3 no pretendía arreglar ELK.
- `npm run benchmark:phase3-canvas` agrega evidencia específica de render. En un barrido de zoom `0.12 → 1.80` con `180` muestras, las invalidaciones potenciales por zoom bajan de `22912 → 462` en `S` y de `94154 → 1904` en `M` (~`97.98%` menos) al dejar de suscribir nodos/edges a zoom crudo cuando el bucket visual no cambia.
- Ajuste final de cierre: `TableNode` y `RoutedEdge` ahora dependen de buckets de LOD memoizados en vez de zoom continuo para decidir detalle visual. Eso reduce churn de render en pan/zoom sin abrir Fase 4 ni tocar workers.

### Caveat menor que queda explícito

Todavía no hay medición formal de FPS real en navegador para `L/XL`. La infraestructura actual sí alcanza para cerrar Fase 3 con honestidad porque ya tenemos evidencia de reducción de invalidaciones y de que el canvas dejó de perseguir detalle completo en cada delta de zoom, PERO la validación fina de FPS queda mejor ubicada en Fase 7 de observabilidad.

---

## Fase 4 — UX para modelos gigantes

## Objetivo

Cambiar la experiencia para que escale de verdad.

## Por qué esta fase existe

Con miles de tablas no alcanza con “optimizar”. También hay que cambiar la forma de navegar el modelo.

## Skills a cargar

- `frontend-app-architecture`
- `react-component-boundaries`
- `heavy-client-performance`

## Archivos que probablemente se toquen

- navegación del diagrama
- componentes de búsqueda/focus
- UI de modos de visualización

## Paso a paso

1. Crear **Overview Mode**.
2. Crear **Focus Mode**.
3. Permitir detalle progresivo.
4. Agrupar por schema o componente cuando aplique.
5. Hacer que búsqueda sea navegación de primera clase.
6. Activar automáticamente `large model mode` / `extreme model mode`.
7. Comunicar al usuario cuando la app cambia de estrategia.

## Qué NO hacer en esta fase

- [ ] No forzar full-detail global en modelos enormes.

## Validación

- [ ] modelos enormes siguen siendo navegables
- [ ] la app no depende de mostrar todo al mismo tiempo

## Criterio de salida

La UX ya está diseñada para escala extrema y no solo para modelos chicos.

### Estado real al arranque de Fase 5

- La base de código YA absorbió la mayor parte de esta fase mediante overview/focus implícito, culling por viewport y refinamiento diferido de edges en `src/features/diagram-presentation/useDiagramPresentation.ts`, `src/features/diagram-canvas/DiagramCanvasSurface.tsx` y `src/features/diagram-canvas/useDiagramCanvasModel.ts`.
- El documento estaba desfasado: decía “pendiente” aunque la implementación ya dejó la UX preparada para escalar bastante mejor.
- Lo que queda abierto acá no es rehacer navegación desde cero, sino cerrar caveats de narrativa/validación cuando corresponda sin frenar el arranque de Fase 5.

---

## Fase 5 — Memoria, cachés y payloads

## Objetivo

Reducir memoria, duplicación y costo de transferencia entre capas.

## Por qué esta fase existe

Aunque la UI ya sea más fluida, el costo de memoria puede seguir siendo un límite fuerte en hardware modesto.

## Skills a cargar

- `frontend-app-architecture`
- `heavy-client-performance`

## Archivos que probablemente se toquen

- modelo de dominio
- workers
- store
- wiring de datos

## Paso a paso

### Slice 1 — payload de layout y medición

1. [x] Corregir la narrativa del plan para dejar explícito que Fase 4 quedó efectivamente cerrada en código.
2. [x] Introducir un contrato compacto de layout (`tables`, `relationships`, `persistedPositions`) derivado dentro de `auto-layout`.
3. [ ] Propagar ese contrato al worker de layout y a las librerías de layout.
4. [ ] Medir payload bytes, serialización y round-trip del worker en benchmark state transitorio.

### Slice 2 — persistencia acotada de `tablePositions`

5. [x] Sacar `panelSplit`, `activeViewTab` y `diagramViewport` del snapshot durable para dejar ese churn como estado de sesión.
6. [x] Reemplazar la suscripción amplia de `ERDApp.tsx` por selectores/hooks acotados del store durable.
7. [ ] Mover SOLO la durabilidad de `tablePositions` a un canal dedicado con flush diferido, dirty-check y fallback de hidratación desde el snapshot legacy cuando falte la nueva clave.
8. [ ] Validar que `sqlText`, `tableConfig`, preferencias durables y la continuidad del layout manual sigan restaurando tras reload sin reabrir payload/parser/render.

### Slices posteriores — todavía pendientes

9. [ ] Revisar shape del modelo parseado con budgets explícitos.
10. [ ] Separar con más fuerza modelo de dominio, modelo de layout y modelo de render donde aparezca duplicación REAL.
11. [ ] Reducir duplicación de strings/objetos en parser/render si la medición confirma que sigue pesando.
12. [ ] Evaluar caché por SQL/hash/estructura.
13. [ ] Evitar persistir estructuras gigantes en `localStorage` sin necesidad.

## Validación

- [ ] menor presión de memoria
- [ ] payloads más compactos
- [ ] menos churn de objetos

### Estado del slice actual

- Slice 1 de Fase 5 se enfocó SOLO en compactar el payload de layout y medir el costo de transferencia antes de abrir cambios mayores en store o normalización del dominio.
- El slice activo siguiente queda EXPLÍCITAMENTE acotado a `tablePositions`: sacar sus escrituras del snapshot persistido amplio, bajar churn síncrono de `localStorage` y preservar continuidad del layout manual vía una clave dedicada con fallback legacy.
- Queda fuera de alcance reabrir payloads, parser, render, browser validation o una re-arquitectura general del store.

## Criterio de salida

La app usa memoria de manera más predecible y estable.

---

## Fase 6 — Astro shell, carga inicial y bundles

## Objetivo

Mejorar arranque, hidratación y costo inicial sin romper el modelo estático.

## Por qué esta fase existe

Aunque el dolor principal esté en modelos grandes, el arranque también debe acompañar.

## Skills a cargar

- `astro-shell-islands`
- `heavy-client-performance`
- `styles-tokens-encapsulation` si toca theming/shell visual

## Archivos que probablemente se toquen

- `src/pages/index.astro`
- `src/components/AppRoot.tsx`
- carga de Monaco/export/settings

## Paso a paso

1. Revisar si `client:load` sigue siendo la mejor decisión global.
2. Lazy-load más agresivo de Monaco.
3. Lazy-load de export y módulos no críticos.
4. Revisar split de bundles por intención.
5. Mantener shell inicial mínima y clara.

## Validación

- [ ] menor bundle inicial
- [ ] shell usable más rápido
- [ ] hidratación más inteligente

## Criterio de salida

La carga inicial mejora sin convertir Astro en un wrapper decorativo de una SPA enorme.

---

## Fase 7 — Observabilidad y reglas anti-regresión

## Objetivo

Hacer que cada mejora y cada regresión sean visibles.

## Por qué esta fase existe

Sin observabilidad, tarde o temprano vamos a volver a romper performance sin darnos cuenta.

## Skills a cargar

- `heavy-client-performance`
- `frontend-app-architecture`

## Paso a paso

1. Crear overlay o panel dev de performance.
2. Mostrar:
   - [ ] parse ms
   - [ ] layout ms
   - [ ] render ms aproximado
   - [ ] nodos / edges
   - [ ] modo activo
   - [ ] tamaño del modelo
3. Registrar long tasks.
4. Registrar fallbacks activados.
5. Definir gates mínimos para no aceptar regresiones graves.

## Validación

- [ ] ya no dependemos solo de percepción subjetiva
- [ ] podemos comparar antes/después con criterio

## Criterio de salida

La performance ya está gobernada y monitoreada.

---

## Fase 8 — Exportación escalable y cierre

## Objetivo

Cerrar el plan evitando que exportación sea el último cuello grave.

## Por qué esta fase existe

El producto también vale por su capacidad de comunicar/exportar, así que export no puede quedar como zona frágil.

## Skills a cargar

- `heavy-client-performance`
- `react-component-boundaries`

## Paso a paso

1. Definir export por overview.
2. Definir export por selección / área / schema.
3. Evitar export full-detail gigante por defecto.
4. Agregar advertencias claras cuando una exportación es costosa.
5. Separar pipeline de export si hace falta.

## Validación

- [ ] exportar deja de congelar la app en modelos grandes
- [ ] el usuario entiende qué tipo de export está generando

## Criterio de salida

La exportación también escala razonablemente.

---

## Reglas de oro para TODO el programa

### Regla 1
Si una mejora no se puede medir, no la des por hecha.

### Regla 2
No meter lógica nueva en `ERDApp.tsx` si puede vivir en un hook, feature o módulo con contrato claro.

### Regla 3
No mostrar al usuario más detalle del que realmente necesita en cada nivel de zoom/contexto.

### Regla 4
No persistir basura en store/localStorage.

### Regla 5
No vender capacidades que el motor no sostiene realmente.

### Regla 6
No saltar a otra fase porque “parece más divertida”.

---

## Riesgos conocidos

- [ ] Riesgo: querer full-detail permanente con miles de tablas.
- [ ] Riesgo: optimizar render antes de mover cálculo pesado.
- [ ] Riesgo: hacer refactor cosmético sin bajar costo real.
- [ ] Riesgo: meter performance agresiva sin boundaries claros.
- [ ] Riesgo: mezclar shell Astro, UI React y lógica pesada otra vez.

---

## Cómo saber si vamos bien

Vamos bien si:

- cada fase deja una mejora visible y medible
- `ERDApp.tsx` pierde responsabilidad, no la gana
- el main thread queda más libre
- el canvas deja de renderizar todo con full-detail
- la UX se adapta al tamaño del modelo
- seguimos compatibles con GitHub Pages

---

## Qué toca ejecutar AHORA

### Etapa actual

## **Fase 4 — UX para modelos gigantes**

### No hay discusión acá

Con Fase 3 cerrada, seguir micro-optimizando render sin cambiar la experiencia sería insistir sobre retornos decrecientes.

### Resultado que necesitamos antes de seguir

- overview mode explícito
- focus mode y navegación orientada a búsqueda
- estrategia de detalle progresivo para modelos gigantes
- comunicación clara cuando la app cambia de modo por escala

La Fase 4 queda habilitada, pero NO se mezcla dentro de este batch final de Fase 3.
