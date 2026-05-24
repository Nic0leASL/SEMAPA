# Replicar el proyecto Semapa (Guía rápida)

Este documento resume la estructura, dependencias y pasos necesarios para replicar localmente el proyecto "semapa-inspections" en otro repositorio.

## Resumen

- Tecnologías principales: React, Vite, Tailwind CSS, Leaflet (`react-leaflet`).
- Dev server: Vite (script `dev`).

## Archivos y carpetas importantes

- **Proyecto raíz**: [semapa](semapa)
- **Configuración y scripts**: [semapa/package.json](package.json)
- Entradas Vite/Tailwind: [semapa/vite.config.js](vite.config.js), [semapa/tailwind.config.js](tailwind.config.js), [semapa/postcss.config.js](postcss.config.js)
- Código fuente: [semapa/src](src) y archivos React en la raíz (`App.jsx`, `main.jsx`, etc.)
- Componentes principales:
  - `SemapaMap.jsx` (renderiza el mapa Leaflet)
  - `SemapaAnalyticsPlatform.jsx` (dashboard/estado)
  - `InspectionForm.jsx` (formulario de inspección)
  - `CitizenKiosk.jsx` (UI para kioscos)
  - `WaterMapDashboard.jsx`
- Assets de datos geográficos: `distritos_cochabamba.json` (hay copia en raíz y en `src/`) — si ya lo tienes, cópialo a la misma ruta relativa donde lo usa la app.

## Dependencias (copiar en `package.json` de destino)

Desde este proyecto (versiones actuales):

- react
- react-dom
- vite
- @vitejs/plugin-react (dev)
- tailwindcss, postcss, autoprefixer
- leaflet
- react-leaflet

Ejemplo mínimo `dependencies` / `devDependencies` (puedes usar las versiones exactas desde el proyecto): revisa [semapa/package.json](package.json).

## Scripts útiles

- `npm install` — instala dependencias
- `npm run dev` — inicia servidor Vite (Local: http://localhost:5173/)
- `npm run build` — genera build de producción
- `npm run preview` — preview del build generado

## Pasos para replicar en otro proyecto

1. Crear estructura de proyecto (puedes usar `npm init` o copiar la carpeta `semapa` como plantilla).
2. Copiar archivos de configuración: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`.
3. Copiar carpeta `src/` y componentes (`App.jsx`, `main.jsx`, `SemapaMap.jsx`, `InspectionForm.jsx`, etc.).
4. Copiar `distritos_cochabamba.json` al mismo path relativo usado por los componentes (si la app busca en `src/` colócala allí).
5. Ejecutar:

```bash
npm install
npm run dev
```

6. Abrir `http://localhost:5173/` y verificar que el mapa y los componentes carguen correctamente.

## Notas específicas

- Leaflet necesita estilos CSS: asegúrate de importar la hoja de estilos de Leaflet o incluirla en `index.html` / `index.css`.
- Si usas React 18, mantén las importaciones de `react-dom/client` y `createRoot` en `main.jsx`.
- Para exponer el servidor en la red usa `npm run dev -- --host` o ajusta `vite.config.js`.
- No hay variables de entorno específicas en este proyecto; si agregas API keys, usa `.env`.

## Qué archivos deberías copiar (lista concreta)

- [semapa/package.json](package.json)
- [semapa/vite.config.js](vite.config.js)
- [semapa/postcss.config.js](postcss.config.js)
- [semapa/tailwind.config.js](tailwind.config.js)
- [semapa/index.html](index.html)
- [semapa/src/main.jsx](src/main.jsx)
- [semapa/src/App.jsx](src/App.jsx)
- [semapa/SemapaMap.jsx](SemapaMap.jsx)
- [semapa/InspectionForm.jsx](InspectionForm.jsx)
- [semapa/CitizenKiosk.jsx](CitizenKiosk.jsx)
- [semapa/WaterMapDashboard.jsx](WaterMapDashboard.jsx)
- `distritos_cochabamba.json` (colócalo donde lo consuma la app)
- `src/index.css` o equivalente con las importaciones de Tailwind y estilos globales

## Recomendación rápida

- Copia primero `package.json` y `src/` a un nuevo repositorio. Ejecuta `npm install` y `npm run dev`. Corrige rutas relativas de assets si es necesario.
- Si quieres, puedo generar un `starter` minimal que incluya sólo lo necesario para el mapa y el formulario.

---

Si quieres que cree un `starter` minimal o que copie/ajuste archivos automáticamente en tu otro proyecto, indícame la ruta del destino y lo hago.
