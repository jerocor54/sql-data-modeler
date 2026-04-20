# PRD.md

## 1. Visión del producto

Si hoy empezáramos `sql-data-modeler` desde cero, lo definiríamos así:

> una herramienta web estática, inmediata y confiable para convertir SQL DDL en un ERD comprensible, explorable y exportable, directamente en el navegador.

La idea no es competir de entrada con suites de modelado enterprise ni con plataformas colaborativas. El objetivo inicial es resolver MUY bien el problema de **entender y comunicar esquemas**.

---

## 2. Problema

Cuando un esquema existe solo como SQL DDL, leerlo y explicarlo cuesta demasiado.

Los problemas más comunes son:

- entender relaciones entre tablas lleva tiempo
- el texto plano dificulta ver estructura global
- onboarding de esquemas heredados se vuelve lento
- comunicar el modelo a otras personas exige trabajo extra
- exportar documentación visual rápida no siempre es trivial

La oportunidad es clara: transformar DDL en una representación visual útil, rápida y sin fricción de infraestructura.

---

## 3. Usuario objetivo

### Primarios

- developers que reciben o escriben DDL y necesitan entenderlo rápido
- líderes técnicos o arquitectos que quieren revisar estructura y relaciones
- DBAs o perfiles técnicos que necesitan explicar el modelo a terceros

### Secundarios

- docentes, consultores o formadores que necesitan material visual exportable
- equipos pequeños que quieren documentación rápida sin montar tooling pesado

---

## 4. Propuesta de valor

`sql-data-modeler` debe ofrecer valor inmediato en tres pasos:

1. pegar o cargar SQL
2. obtener un diagrama legible en segundos
3. explorar y exportar el resultado

### Diferenciadores que sí conviene sostener desde el inicio

- **100% client-side**
- **deploy estático**
- **sin cuentas ni backend**
- **time-to-value corto**
- **persistencia local útil**
- **resiliencia UX** con fallback de editor y de layout

---

## 5. Principios de producto

### 5.1 Honestidad antes que amplitud aparente

No se deben prometer dialectos, modos visuales o capacidades que no estén implementadas de verdad.

### 5.2 Comprensión y exploración primero

El valor principal del producto está en:

- comprender el esquema
- explorar relaciones
- exportar resultados

No en colaboración, modelado visual complejo o integración empresarial en la primera etapa.

### 5.3 Menos opciones, pero reales

Ya sabemos que exponer controles no implementados genera deuda y confusión. El MVP debe priorizar menos superficie, pero más confiable.

### 5.4 Resiliencia visible

Si el editor principal falla, debe haber fallback. Si el layout principal falla, debe haber fallback. Si no hay tests visibles, debe haber validación manual exigente.

### 5.5 Simplicidad operativa

El producto debe seguir siendo fácil de hostear, mantener y usar. Frontend estático primero.

---

## 6. Alcance recomendado para MVP

Este es el alcance con el que conviene arrancar, informado por experiencia real.

### 6.1 Sí entra en MVP

#### Ingreso de SQL
- pegar y editar SQL DDL
- cargar archivo `.sql`
- descargar el SQL actual

#### Transformación a modelo
- parsear un subconjunto útil y explícito de SQL DDL
- soportar al menos `CREATE TABLE` y relaciones frecuentes
- mostrar errores y warnings comprensibles
- detectar referencias inválidas y ambiguas en casos soportados

#### Visualización
- renderizar ERD interactivo
- zoom, pan y exploración básica
- búsqueda de tablas y columnas
- foco o resaltado contextual de relaciones

#### Layout y resiliencia
- layout automático con motor principal
- fallback de layout si el principal falla o demora
- routing orientado a legibilidad visual

#### Persistencia y continuidad
- guardar localmente SQL y preferencias esenciales
- recuperar continuidad tras refresh

#### Exportación
- exportar el diagrama en formatos visuales útiles

### 6.2 No entra en MVP

- backend
- autenticación
- colaboración en tiempo real
- guardado remoto
- sincronización entre dispositivos
- conexión a bases vivas
- introspección automática de bases
- edición visual avanzada del esquema
- soporte real multi-dialecto amplio

---

## 7. Decisiones de alcance informadas por experiencia

### 7.1 El parser debe empezar con expectativas realistas

El parser SQL es delicado. No conviene arrancar prometiendo compatibilidad completa con PostgreSQL, Oracle u otros dialectos.

Desde el día 1 hay que declarar que:

- se soporta un subconjunto útil
- la cobertura crecerá por casos reales priorizados
- el soporte de dialectos solo se comunica cuando haya implementación verificable

### 7.2 El selector de dialecto no debe aparecer por estética

Si no modifica realmente el comportamiento del parser, no debe formar parte del MVP.

### 7.3 Las opciones de UI deben corresponder a capacidades reales

No conviene lanzar controles que sugieran funcionalidades inexistentes. Cada opción visible debe tener efecto observable.

### 7.4 Persistencia local sí entra temprano

La persistencia local aporta mucho valor real incluso sin backend. Debe considerarse parte de la UX inicial, no un extra tardío.

### 7.5 Exportación sí es core

La exportación no es accesorio. Forma parte del valor principal porque el producto sirve para comunicar y documentar esquemas.

---

## 8. Requisitos funcionales

### RF-01 — Edición e ingreso
El sistema debe permitir pegar, editar e importar SQL DDL desde el navegador.

### RF-02 — Parseo acotado y explícito
El sistema debe transformar un subconjunto definido de SQL DDL en tablas, columnas y relaciones utilizables para visualización.

### RF-03 — Feedback de parsing
El sistema debe informar errores y warnings de forma comprensible, incluyendo referencias inválidas o ambiguas en casos soportados.

### RF-04 — Diagrama interactivo
El sistema debe mostrar el resultado como un ERD navegable con zoom, pan y foco contextual.

### RF-05 — Búsqueda básica
El sistema debe permitir ubicar tablas y columnas relevantes dentro del diagrama.

### RF-06 — Auto-layout resiliente
El sistema debe resolver un layout automático y contar con fallback si el motor principal falla o excede tiempos razonables.

### RF-07 — Persistencia local
El sistema debe recordar localmente SQL y preferencias críticas de uso.

### RF-08 — Exportación visual
El sistema debe permitir exportar el diagrama en formatos visuales útiles para compartir.

### RF-09 — Fallback de editor
El sistema debe seguir siendo utilizable si el editor enriquecido no carga correctamente.

---

## 9. Requisitos no funcionales

### RNF-01 — 100% client-side
La lógica principal debe ejecutarse íntegramente en el navegador.

### RNF-02 — Deploy estático
La aplicación debe poder desplegarse en hosting estático, incluyendo escenarios con `base path` como GitHub Pages.

### RNF-03 — Adopción inmediata
El usuario debe obtener valor sin configuración previa ni infraestructura adicional.

### RNF-04 — Resiliencia operativa
La app debe seguir siendo útil aun cuando fallen componentes secundarios como Monaco o el layout principal.

### RNF-05 — Legibilidad visual
La representación del diagrama debe priorizar claridad sobre complejidad técnica aparente.

### RNF-06 — Mantenibilidad razonable
La arquitectura debe evitar concentración excesiva de lógica en un único componente o módulo.

### RNF-07 — Compatibilidad de persistencia
Los cambios de estado persistido deben considerar migración o compatibilidad cuando corresponda.

---

## 10. Stack base recomendado

Si arrancáramos hoy, esta base sigue siendo válida:

- **Astro**
- **React**
- **TypeScript**
- **Zustand**
- **React Flow**
- **ELK**
- **Monaco**

Esto NO implica que todas las capacidades posibles deban exponerse desde el día 1. Implica que la base técnica es adecuada para construir el producto correcto.

---

## 11. Riesgos conocidos desde el día 1

### Riesgo 1 — Expectativa falsa de parser
Si se comunica soporte SQL demasiado amplio, la confianza del producto cae rápido.

### Riesgo 2 — Deuda por UI no implementada
Controles visibles sin comportamiento real erosionan claridad y foco del roadmap.

### Riesgo 3 — Acoplamiento excesivo en la orquestación principal
Ya sabemos que concentrar demasiada lógica en un solo componente vuelve costosa la evolución.

### Riesgo 4 — Regresiones visuales de layout y routing
Cambios ingenuos pueden romper legibilidad, spacing y exportación.

### Riesgo 5 — Fragilidad por falta de tests visibles
Hasta que exista una estrategia de testing clara, hay que compensar con validación manual fuerte.

### Riesgo 6 — Problemas de deploy por base path
Si se asume raíz `/`, el deploy estático puede romper assets o navegación.

---

## 12. Qué conviene dejar explícitamente fuera del mensaje inicial del producto

No presentar como capacidad inicial:

- compatibilidad plena con dialectos
- colaboración
- edición visual tipo modelador enterprise
- sincronización remota
- integración con bases reales

Eso puede existir en roadmap. NO debe confundirse con el MVP.

---

## 13. Roadmap sugerido

## Fase 1 — MVP

Objetivo: resolver muy bien el caso de **DDL → comprensión visual → exportación**.

Incluye:

- editor SQL con fallback
- parser acotado y explícito
- warnings/errores comprensibles
- ERD interactivo
- búsqueda básica
- layout resiliente
- persistencia local
- exportación
- deploy estático correcto con `base path`

### Éxito del MVP

El usuario puede pegar un DDL razonablemente soportado, entender el esquema, explorar relaciones y exportar un diagrama sin fricción.

---

## Fase 2 — Consolidación técnica

Objetivo: reducir riesgo de evolución y mejorar confianza del producto.

Incluye:

- modularización más estricta de responsabilidades
- reducción del acoplamiento del coordinador principal
- mejoras de testing sobre parser, layout y flujos críticos
- endurecimiento de persistencia y compatibilidad
- refinamiento de UX en warnings y navegación

---

## Fase 3 — Cobertura y profundidad

Objetivo: ampliar valor sin traicionar la honestidad del producto.

Incluye potencialmente:

- ampliar subconjunto SQL soportado
- introducir soporte real por dialectos priorizados
- mejorar heurísticas de layout y routing
- enriquecer exportación y documentación visual

Solo entra cuando haya evidencia de uso y cobertura real.

---

## Fase 4 — Expansiones opcionales

Esto es posterior al producto base y NO debe contaminar el MVP:

- colaboración
- guardado remoto
- integración con fuentes externas
- edición visual avanzada
- capacidades tipo workspace compartido

---

## 14. Criterio de priorización

Cuando haya dudas de roadmap, priorizar en este orden:

1. comprensión del esquema
2. legibilidad del diagrama
3. resiliencia de experiencia
4. exportación útil
5. continuidad local de trabajo
6. recién después, expansión de superficie funcional

---

## 15. Definición de éxito inicial

El producto va bien encaminado si logra esto:

- el usuario entiende más rápido un esquema heredado
- puede explorar relaciones sin perderse
- puede exportar algo presentable
- no necesita backend ni setup complejo
- no recibe promesas falsas sobre capacidades aún no implementadas

Ese es el arranque correcto para `sql-data-modeler`.
