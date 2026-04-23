## Exploration: phase-5-next-slice

### Current State
El slice archivado de payload ya dejó el boundary correcto para layout: `useAutoLayout.ts` proyecta `LayoutGraphModel`, mide `payloadBytes/serialize/postMessage/roundTrip`, y `BenchmarkPanel.tsx` YA tiene UI para mostrar esos campos. Pero el verify quedó en **PASS WITH WARNINGS** porque este entorno no puede confirmar comportamiento real de navegador para render del panel ni `navigator.clipboard.writeText(...)` en la ruta `/benchmark`.

La evidencia de priorización sigue apuntando a layout, no a parse/render como próximo cambio grande: el plan maestro y el verify mantienen que preset `m` ronda ~26.6-26.8s frente a un budget in-app de 2500ms. Al mismo tiempo, Fase 3 ya dejó evidencia específica de reducción fuerte de churn de zoom en canvas, así que abrir ahora un slice grande de model-shape/render sería saltar de hotspot sin cerrar la validación pendiente del slice anterior.

También hay deuda real en store/subscriptions: `appStore.ts` persiste `sqlText`, `diagramViewport`, `tableConfig` y `tablePositions`, y `ERDApp.tsx` sigue desestructurando el store completo desde `useAppStore()`. Eso puede amplificar invalidación y churn, pero hoy sigue siendo una **hipótesis de follow-up**, no el siguiente paso automático mejor soportado por evidencia.

### Affected Areas
- `src/pages/benchmark.astro` — superficie real para validación browser-capable del benchmark.
- `src/features/performance/BenchmarkPanel.tsx` — renderiza payload metrics y el flujo de copy JSON.
- `src/features/performance/diagramPerformance.ts` — define los campos serializados que deberían aparecer en el JSON copiado/exportado.
- `src/components/ERDApp.tsx` — conecta `BenchmarkPanel`, historial local y `navigator.clipboard.writeText(...)`.
- `src/store/appStore.ts` — hotspot candidato para slice posterior de persistencia/subscription churn.
- `src/features/parse-sql/useDiagramModel.ts` — mantiene `ParseResult` rico y derivados en main thread; relevante para un slice posterior de model-shape.
- `src/features/diagram-canvas/buildDiagramCanvasGraph.ts` — sigue embebiendo `table` completo en `TableNodeData`; relevante solo si luego se confirma que render/model shape vuelve a ser hotspot principal.
- `PERFORMANCE_OPTIMIZATION_PLAN.md` — debe seguir guiando orden secuencial: no abrir fase nueva sin cerrar criterio de salida de la anterior.

### Approaches
1. **Short validation slice first** — confirmar en navegador la ruta `/benchmark`, el render de payload metrics y el JSON copiado/exportado; después elegir el próximo hotspot real.
   - Pros: cierra el warning pendiente del slice archivado; mantiene secuencia del plan; evita abrir un cambio estructural sin validar evidencia final; scope chico y ownership claro en performance/benchmark.
   - Cons: no mejora performance por sí mismo; requiere ambiente browser-capable que este executor no tiene.
   - Effort: Low.

2. **Direct store persistence/subscription churn slice** — atacar persistencia amplia de Zustand y la suscripción global de `ERDApp.tsx`.
   - Pros: apunta a un sospechoso creíble (`partialize` amplio + `useAppStore()` completo); puede reducir invalidación, hidratación y serialización de localStorage.
   - Cons: hoy falta confirmación de que sea el siguiente cuello dominante; mezcla persistencia, selectors y wiring del composition root; scope más riesgoso que la validación pendiente.
   - Effort: Medium.

3. **Parse/render model-shape optimization slice** — revisar `ParseResult`, `TableNodeData` y shapes duplicados entre parse/layout/render.
   - Pros: podría reducir memoria total y duplicación estructural a largo plazo.
   - Cons: radio de cambio alto entre parser, canvas y presentación; contradice la regla de slice angosto; llega demasiado pronto mientras el costo dominante documentado sigue siendo ELK y la validación browser del slice previo sigue abierta.
   - Effort: High.

### Recommendation
La mejor siguiente etapa en automático es **Option 1: short validation slice**.

WHY: el archivo de archive-report ya deja esta instrucción explícita, el plan maestro exige no abrir una etapa nueva sin cumplir salida de la anterior, y en el código ya existe casi toda la superficie necesaria para validar: `BenchmarkPanel.tsx` muestra `payloadBytes`, `serializeMs`, `postMessageMs`, `roundTripMs`, `workerComputeMs` y `estimatedTransferMs`; `ERDApp.tsx` copia `serializeBenchmarkResults(history)` vía `navigator.clipboard`. Lo que falta NO es diseño nuevo sino evidencia browser-level real.

Después de esa validación, la decisión más probable para el siguiente slice técnico queda entre store/subscription churn y otro hotspot, pero esa elección debe hacerse con evidencia fresca. Si el panel/browser confirma que los payload metrics son chicos o marginales frente al tiempo total, entonces el candidato natural siguiente pasa a ser **store persistence/subscription churn**. El slice de parse/render model-shape debería quedar tercero porque hoy sería demasiado transversal.

### Risks
- Este entorno no puede validar DOM real, clipboard real ni interacción visual de `/benchmark`; solo puede verificar código y contratos estáticos.
- Si se omite la validación browser y se salta directo al store, se corre riesgo de optimizar el sospechoso equivocado.
- El preset `m` sigue muy por encima del timeout de app; una corrida interactiva puede caer en fallback y sesgar lectura si no se documenta explícitamente durante la validación.
- `ERDApp.tsx` sigue con suscripción amplia al store; si luego se abre Option 2, hay que mantenerlo como composition root y extraer selectors/boundaries sin scope creep cross-feature.

### Ready for Proposal
Yes — con recomendación concreta: proponer un slice angosto de validación browser-capable para `/benchmark` que confirme render de payload metrics y flujo de copy/export JSON, registre evidencia, y cierre el warning del verify archivado antes de decidir el siguiente hotspot estructural.
