# SQL Data Modeler

`sql-data-modeler` es una herramienta web para convertir **SQL DDL** en un **ERD interactivo**, directamente en el navegador.

La apuesta del proyecto es simple: **pegar SQL, entender la estructura rápido, explorar relaciones y exportar el resultado** sin depender de backend, instalación pesada ni infraestructura extra.

## Enfoque del proyecto

Si hoy arrancáramos este producto desde cero, estas serían las decisiones base:

- **100% client-side**
- **deploy estático**
- foco en **comprensión, exploración y exportación**
- persistencia local para continuidad de trabajo
- resiliencia con fallback de editor y fallback de layout
- alcance honesto del parser, sin prometer dialectos completos desde el día 1

## Qué resuelve

Trabajar con DDL puro suele volver difícil:

- entender la estructura general de una base
- detectar relaciones y dependencias
- revisar esquemas heredados
- comunicar el modelo a otras personas
- generar documentación visual rápida

`sql-data-modeler` apunta a resolver eso con una experiencia inmediata y liviana.

## Alcance actual

Hoy el proyecto está orientado a:

- pegar o editar SQL DDL
- generar el ERD en tiempo real
- explorar tablas y relaciones
- mover tablas y recalcular layout
- buscar tablas y columnas
- personalizar aspectos visuales básicos
- exportar el diagrama
- persistir preferencias localmente

### Importante

El parser trabaja con un **subconjunto útil y explícito de SQL DDL**. No debe asumirse soporte completo multi-dialecto si no está implementado y verificado.

## Stack

- Astro
- React
- TypeScript
- Zustand
- React Flow
- ELK + Dagre
- Monaco Editor
- html-to-image

## Scripts

Todos los comandos se ejecutan desde la raíz del proyecto.

| Comando | Descripción |
| --- | --- |
| `npm install` | Instala dependencias |
| `npm run dev` | Levanta el entorno local |
| `npm run build` | Genera la versión de producción |
| `npm run preview` | Previsualiza el build |
| `npx tsc --noEmit` | Valida tipos sin generar archivos |
| `npm run benchmark:phase0 -- --output docs/performance-baseline-results.phase-0.json` | Corre el baseline reproducible de parse + layout y guarda un reporte JSON |
| `npm run benchmark:browser -- --preset=s` | Levanta el DEV server, abre `/sql-data-modeler/benchmark` con Playwright y captura el snapshot DEV honesto |

## Documentación del proyecto

- `AGENT.md` — guía técnica para construir y evolucionar el proyecto con las lecciones ya aprendidas
- `PRD.md` — documento de producto con visión inicial, alcance MVP y roadmap sugerido
- `PERFORMANCE_OPTIMIZATION_PLAN.md` — plan maestro de refactor + performance por fases
- `docs/performance-baseline.md` — guía del baseline reproducible de la Fase 0 (CLI + navegador)
- `docs/browser-performance-harness-policy.md` — alcance y uso del harness mínimo browser-backed en DEV
- `docs/performance-baseline-results.phase-0.json` — última corrida base automatizada de la Fase 0

## Deploy en GitHub Pages

El proyecto está preparado para desplegarse en GitHub Pages usando GitHub Actions.

### Repo

- Remote: `git@github.com:jerocor54/sql-data-modeler.git`
- URL esperada del sitio: `https://jerocor54.github.io/sql-data-modeler/`

### Configuración aplicada

- `astro.config.mjs`
  - `site: 'https://jerocor54.github.io'`
  - `base: '/sql-data-modeler'`
- workflow en `.github/workflows/deploy.yml`

### Para publicarlo

1. Subí la rama `main` al repositorio remoto.
2. En GitHub, andá a **Settings → Pages**.
3. En **Build and deployment**, elegí **GitHub Actions**.
4. Hacé push de nuevos cambios a `main` para disparar el deploy.

## Estructura principal

```text
/
├── public/
├── src/
│   ├── components/
│   ├── lib/
│   ├── pages/
│   ├── store/
│   └── types/
├── AGENT.md
├── PRD.md
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Notas de implementación

- La app usa persistencia local para preferencias y continuidad de trabajo.
- El layout combina ELK, fallback layout y heurísticas propias de routing.
- GitHub Pages y su `base path` deben considerarse desde el inicio al tocar assets o navegación.
- Para revisar tipos rápidamente, usá `npx tsc --noEmit`.
