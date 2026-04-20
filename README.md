# SQL Data Modeler

Modelador visual de bases de datos hecho con **Astro + React + React Flow + ELK**.

Permite:

- pegar o editar SQL DDL
- generar el ERD en tiempo real
- mover tablas y ajustar layout
- personalizar estilos de tablas y relaciones
- exportar el diagrama

## Stack

- Astro
- React
- TypeScript
- React Flow
- ELK + Dagre
- Monaco Editor

## Scripts

Todos los comandos se ejecutan desde la raíz del proyecto.

| Comando | Descripción |
| --- | --- |
| `npm install` | Instala dependencias |
| `npm run dev` | Levanta el entorno local |
| `npm run build` | Genera la versión de producción |
| `npm run preview` | Previsualiza el build |
| `npx tsc --noEmit` | Valida tipos sin generar archivos |

## Deploy en GitHub Pages

El proyecto quedó preparado para desplegarse en GitHub Pages usando GitHub Actions.

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
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Notas

- El proyecto usa persistencia local para varias preferencias de UI.
- El layout del diagrama combina heurísticas propias con ELK/Dagre.
- Para revisar tipos rápidamente, usá `npx tsc --noEmit`.
