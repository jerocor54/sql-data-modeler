# Browser harness evidence artifacts

Este directorio guarda la evidencia JSON estable del harness browser-backed mínimo de Phase 7.

## Scope actual

- ruta: `/sql-data-modeler/benchmark` en DEV
- presets soportados: `s` y `m`
- reporte: el mismo JSON estructurado que el harness imprime a stdout

## Archivos estables por default

- `browser-benchmark-report.s.json`
- `browser-benchmark-report.m.json`

Cada corrida sobreescribe el archivo del preset correspondiente. Eso es INTENCIONAL: deja una ubicación repetible para evidencia local sin inventar versionado nuevo dentro del harness.

## Cómo generar evidencia

Desde repo root:

```bash
npm run benchmark:browser -- --preset=s
```

Workflow repo-level para dejar ambos archivos estables actualizados de una sola vez:

```bash
npm run benchmark:browser:assert
```

Ese comando corre el harness existente primero para `s` y después para `m`. Si cualquiera de las dos corridas falla, el workflow completo falla.

O para el borde honesto actual:

```bash
npm run benchmark:browser -- --preset=m
```

## Override opcional

Si necesitás guardar el JSON en otra ruta:

```bash
npm run benchmark:browser -- --preset=s --output=docs/performance-artifacts/browser-harness/custom-s.json
```

## Importante

- no agrega métricas nuevas;
- no cambia el shape del reporte;
- no reemplaza el gate CLI;
- no convierte este directorio en historial oficial de corridas: para evidencia archivada/versionada, copiá el archivo estable a un paquete de artefactos específico del slice correspondiente.
