# Baseline de performance · Fase 0

Este baseline existe para medir el costo real de parse + layout **antes** de entrar en workers o refactors más profundos.

La Fase 0 ya no depende solo de clicks manuales en navegador:

- hay una ruta `/benchmark` para medir “total usable” dentro de la app real;
- y ahora hay un CLI reproducible para medir parse + ELK desde repo root, sin build previo.

## Artefactos de Fase 0

- `src/features/performance/benchmarkDatasets.ts` — datasets sintéticos determinísticos versionados (`phase-0-v1`)
- `src/features/performance/diagramPerformance.ts` — instrumentación reusable con `performance.mark` / `performance.measure`
- `src/features/performance/BenchmarkPanel.tsx` — UI explícita para baseline manual
- `src/pages/benchmark.astro` — ruta dedicada para benchmark manual
- `scripts/performance/runPhase0Baseline.ts` — CLI reproducible para baseline automatizado
- `scripts/performance/runPhase3CanvasSmoke.ts` — smoke controlado para estimar presión de rerender por zoom en Fase 3
- `docs/performance-baseline-results.phase-0.full.json` — corrida base full (parse + ELK) para S/M y evidencia de falla en L/XL
- `docs/performance-baseline-results.phase-0.parse-only.json` — corrida base parse-only para S/M/L/XL/XXL

## Presets disponibles

| Preset | Tablas | Relaciones | Notas |
| --- | ---: | ---: | --- |
| S | 50 | 78 | Smoke benchmark para validar instrumentación |
| M | 200 | 326 | Primer tamaño donde el layout ya duele de verdad |
| L | 500 | 824 | Escala donde ELK full deja de ser confiable en este baseline automatizado |
| XL | 1000 | 1653 | Escala extrema previa a workers |
| XXL | 3000 | 4969 | Estrés máximo; parse-only sí, ELK full no quedó viable en esta fase |

## Cómo correr el baseline automatizado

### Full mode — parse + ELK

```bash
npm run benchmark:phase0 -- --presets=s,m,l,xl --iterations=3 --warmups=1 --output=docs/performance-baseline-results.phase-0.full.json
```

Esto mide:

- parse time
- layout time con ELK
- total CPU (`parse + layout`)

### Parse-only mode — cuando querés comparar el parser aunque ELK ya no sea viable

```bash
npm run benchmark:phase0 -- --mode=parse-only --presets=s,m,l,xl,xxl --iterations=3 --warmups=0 --output=docs/performance-baseline-results.phase-0.parse-only.json
```

Esto mide:

- parse time
- total CPU de parse-only
- cantidad de tablas y relaciones

### Smoke de canvas — presión de rerender por zoom

```bash
npm run benchmark:phase3-canvas
```

Esto NO mide FPS real en browser.

Sí mide algo útil y honesto para Fase 3: cuántas invalidaciones potenciales por zoom generan los nodos/edges si se suscriben a zoom crudo vs buckets de LOD.

## Cómo correr el baseline manual en navegador

1. Levantá la app local con `npm run dev`.
2. Abrí `http://localhost:4321/benchmark`.
3. Elegí un preset.
4. Tocá **Cargar dataset en la app**.
5. Esperá a que termine el layout y mirá la tarjeta **Última medición**.
6. Si querés repetir exactamente el mismo caso, usá **Repetir baseline actual**.
7. Si querés guardar resultados, usá **Copiar resultados JSON**.

## Definición honesta de “diagrama usable”

En la ruta `/benchmark`, en esta fase se considera “usable” cuando:

1. terminó el parseo,
2. terminó el layout (ELK o fallback),
3. `nodes` y `edges` ya fueron seteados,
4. pasaron dos `requestAnimationFrame` después de ese commit.

No es una métrica perfecta de UX final, pero SÍ es una aproximación repetible y honesta para comparar antes/después dentro del estado actual de la app.

## Baseline capturado en esta rama

Ambiente de referencia:

- fecha UTC de captura: `2026-04-21T02:42Z`
- máquina: `Apple M3 Pro`
- runtime: `Node v22.14.0`
- plataforma: `darwin`
- relation grouping: `bundled`

### Resultados full mode (parse + ELK)

| Preset | Parse avg | Layout avg | Total avg | Estado |
| --- | ---: | ---: | ---: | --- |
| S | 5.64 ms | 334.29 ms | 339.92 ms | OK |
| M | 37.23 ms | 26637.56 ms | 26674.80 ms | ELK tarda ~10.7x más que el timeout actual de la app |
| L | 206.97 ms | n/a | n/a | `Maximum call stack size exceeded` en ELK |
| XL | 862.44 ms | n/a | n/a | `Maximum call stack size exceeded` en ELK |
| XXL | n/a | n/a | n/a | corrida full no completó en 300000 ms con `npm run benchmark:phase0 -- --presets=xxl --iterations=1 --warmups=0` |

### Resultados parse-only

| Preset | Parse avg | Estado |
| --- | ---: | --- |
| S | 4.31 ms | OK |
| M | 36.54 ms | OK |
| L | 216.93 ms | OK |
| XL | 825.39 ms | OK |
| XXL | 7943.08 ms | OK |

## Budgets iniciales de Fase 0

Estos budgets NO son objetivos de UX final.

Son guardrails iniciales para detectar regresiones del baseline actual mientras abrimos seams en Fase 1.

| Preset | Parse budget | Layout budget | Total CPU budget | Nota |
| --- | ---: | ---: | ---: | --- |
| S | 10 ms | 400 ms | 450 ms | Basado en full mode actual con margen chico |
| M | 50 ms | 30000 ms | 31000 ms | Basado en full mode actual; sigue siendo UX inviable |
| L | 300 ms | n/a | n/a | Parse sí es medible; ELK full falla con stack overflow |
| XL | 1000 ms | n/a | n/a | Parse sí es medible; ELK full falla con stack overflow |
| XXL | 8500 ms | n/a | n/a | Parse-only reproducible; full mode no fue viable en esta fase |

## Lectura técnica honesta

- El parser NO es el cuello principal en S ni M; el costo dominante ya es layout.
- En `M`, ELK promedio queda en ~26.6 s. O sea: con el timeout actual de `2500 ms` de la app, ese preset ya está claramente fuera de rango.
- En `L` y `XL`, el CLI full pega `Maximum call stack size exceeded` dentro de ELK antes de poder cerrar una corrida completa.
- En `XXL`, parse-only sigue siendo reproducible (~7.94 s), pero ELK full no terminó ni en 5 minutos bajo esta estrategia automatizada.

## Caveats abiertos

- El baseline automatizado captura bien parse + ELK, pero NO reemplaza la medición manual de “total usable” en navegador.
- La primera tanda documentada acá está tomada en Node, no en browser real.
- Esta fase NO cubre todavía memoria, FPS, latencia de edición ni bloqueo fino del main thread.
- Los datasets siguen siendo sintéticos: excelentes para comparar regresiones, no para representar todos los esquemas reales.

## Slice de validación pendiente: Phase 5 next slice

Para cerrar el warning archivado sobre payload metrics en superficies reales de benchmark, usar el paquete de evidencia preparado en:

- `docs/performance-artifacts/phase-5-next-slice/README.md`
- `docs/performance-artifacts/phase-5-next-slice/evidence-checklist.md`
- `docs/performance-artifacts/phase-5-next-slice/benchmark-run-context.template.json`

Reglas de esta validación:

1. No hacer build; usar `npm run dev`.
2. Validar sobre `http://localhost:4321/benchmark`.
3. Capturar la UI del panel, JSON copiado y JSON exportado para la MISMA corrida.
4. Registrar si preset `m` completa o cae en fallback/timeout, porque la referencia CLI sigue en ~26.6-26.8s frente a un budget in-app de `2500 ms`.
5. Si falta algún campo de payload en UI o JSON, documentarlo como evidencia y NO abrir refactors fuera de este slice.

## Punto exacto de arranque para Fase 1

Arrancá por estos hechos, no por intuición:

1. `M` ya demuestra que el layout actual es el hotspot dominante.
2. `L+` demuestra que ELK full ni siquiera escala de forma confiable en la estrategia actual.
3. Entonces Fase 1 tiene que abrir seams mínimos alrededor de parse/layout/orquestación en `ERDApp.tsx`, SIN meter todavía workers.

En otras palabras: la próxima fase no empieza “optimizando un poquito”. Empieza separando ownership para poder mover el trabajo pesado después.

## Snapshot actualizado al cierre de Fase 3

Captura local de esta rama (`2026-04-21`, `Apple M3 Pro`) sin build:

### `npm run benchmark:phase0 -- --presets=s,m --iterations=1 --warmups=0`

| Preset | Parse | Layout | Total CPU | Lectura honesta |
| --- | ---: | ---: | ---: | --- |
| S | 6.11 ms | 518.01 ms | 524.12 ms | sigue sano para smoke chico |
| M | 35.08 ms | 25252.47 ms | 25287.55 ms | layout sigue siendo el cuello dominante; Phase 3 NO cambia este costo |

### `npm run benchmark:phase3-canvas`

Supuesto del smoke: barrido continuo de zoom `0.12 → 1.80` con `180` muestras.

| Preset | Invalidaciones potenciales antes | Invalidaciones potenciales después | Reducción |
| --- | ---: | ---: | ---: |
| S | 22912 | 462 | 97.98% |
| M | 94154 | 1904 | 97.98% |

### Qué significan realmente estos números

- El benchmark de Fase 0 sigue siendo válido para parse + layout.
- El smoke de Fase 3 NO reemplaza medición de FPS real en navegador.
- Sí demuestra algo importante: el canvas dejó de invalidar nodos y edges por cada delta de zoom cuando el bucket visual no cambió.
- Con esto, Fase 3 queda medible de forma razonable con la infraestructura actual, pero el próximo salto serio de UX ya pertenece a Fase 4.
