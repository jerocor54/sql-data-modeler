# Phase 5 Next Slice · Browser validation evidence

Este directorio existe para cerrar el warning pendiente de `phase-5-memory-caches-payloads` con evidencia reproducible sobre la ruta real de DEV `http://localhost:4321/sql-data-modeler/benchmark`.

## Objetivo

Validar en navegador real que la UI de benchmark y los flujos de copy/export exponen el mismo set de payload metrics:

- `payloadBytes`
- `serializeMs`
- `postMessageMs`
- `roundTripMs`
- `workerComputeMs`
- `estimatedTransferMs`

## Comando y ruta exactos

Desde repo root, sin build:

```bash
npm run dev
```

Abrir:

```text
http://localhost:4321/sql-data-modeler/benchmark
```

## Preset recomendado para evidencia

- Preset primario: `s`
- Preset secundario opcional: `m`

### Expectativa de timeout / fallback

- `s` debería completar con ELK sin fallback en un ambiente local sano.
- `m` puede completar o caer en fallback/timeout; la referencia archivada dejó evidencia de ~26.6-26.8s en CLI frente a un budget in-app de `2500 ms`.
- Si `m` cae en fallback, ESO NO invalida el slice: solo hay que registrarlo explícitamente en `benchmark-run-context.json` y `evidence-checklist.md`.

## Captura mínima requerida

Guardar estos archivos con nombres estables en este directorio:

- `benchmark-panel-ui.png` — screenshot del panel **Última medición** mostrando los seis campos.
- `benchmark-copy-results.json` — contenido pegado luego de **Copiar resultados JSON**.
- `benchmark-export-results.json` — JSON exportado del mismo resultado usado para la captura UI.
- `benchmark-run-context.json` — contexto exacto de la corrida usando la plantilla versionada.
- `benchmark-notes.md` — notas libres si hubo fallback, timeout, ausencia de métricas o diferencias.

## Flujo de captura

1. Levantar la app con `npm run dev`.
2. Abrir `/sql-data-modeler/benchmark`.
3. Cargar preset `s`.
4. Esperar a que termine la corrida y sacar `benchmark-panel-ui.png`.
5. Copiar resultados JSON y guardarlos en `benchmark-copy-results.json`.
6. Exportar el mismo resultado y guardarlo en `benchmark-export-results.json`.
7. Completar `benchmark-run-context.json` con timestamp, browser/runtime, commit/worktree state, preset, engine y fallback state.
8. Actualizar `evidence-checklist.md` con pass/fail por escenario y links a los archivos reales.

## Regla de stop

Si en la UI falta cualquiera de estos campos:

- `payloadBytes`
- `serializeMs`
- `postMessageMs`
- `roundTripMs`
- `workerComputeMs`
- `estimatedTransferMs`

NO abras refactors nuevos. Guardá screenshot, anotá el campo faltante en `benchmark-notes.md` y marcá el escenario como `FAIL` en `evidence-checklist.md`.

## Paridad esperada

La screenshot de UI, el JSON copiado y el JSON exportado deben corresponder a la misma corrida y exponer exactamente los mismos seis campos con los mismos valores.

## Estado actual en este entorno

Este executor dejó preparado el folder, la checklist y la plantilla de contexto, pero NO pudo ejecutar la validación browser-only desde este entorno. Hasta capturar los archivos reales, el warning previo sigue abierto como pendiente de evidencia.
