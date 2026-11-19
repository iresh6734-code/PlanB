# Auditoría del espacio de equipo (`/team`)

Mide accesibilidad y móvil del espacio de equipo en un **ensayo propio** con datos ficticios. Encargo `CLAUDE-TEAM-AUDIT`; hallazgos en `coordination/reports/CLAUDE-TEAM-AUDIT.md`.

```bash
node tools/team-audit/start.mjs --audit     # arranca el ensayo, recorre todo y lo para (unos 3 min)
node tools/team-audit/start.mjs             # solo el ensayo, para mirarlo a mano (Ctrl+C para parar)
node tools/team-audit/run.mjs               # recorre un ensayo ya en marcha (PLANB_TEAM_AUDIT_URL)
node tools/team-audit/run.mjs --self-test   # comprueba la propia medida con páginas sintéticas, sin servidor
NODE_ENV=test npx tsx --test tests/team-audit.test.ts
```

## El ensayo

- Servidor de equipo en **modo demo** en `127.0.0.1:4531`: dos empresas y cuatro perfiles ficticios, datos nuevos en `tests/.tmp/perf-team-<fecha>/data`, red exterior bloqueada (`scripts/block-external.cjs`) y entorno mínimo, sin variables `PLANB_*`, `HUBSPOT_*` ni `GOOGLE_*` ni `.env.local`.
- Vite en `127.0.0.1:5299` con `/api/team` hacia 4531. No usa 4431/5198 (ensayo de la sesión principal) ni escribe en `dist/` o `build/`.

## Qué mide

8 secciones (Empresa, Contactos, Trabajos, Dispositivos, Equipo, Integraciones, Agente y Comercial) × 4 perfiles de ensayo × 1366, 390 y 320 px. En cada vista, primero tal cual y después con sus paneles `<details>` desplegados:

| Medida | Criterio | Gravedad |
| --- | --- | --- |
| Contraste del texto | 4,5:1, o 3:1 en texto grande. Sobre un degradado cuenta la peor parada | < 3:1 grave; entre 3:1 y el mínimo, media |
| Nombre accesible de botones y enlaces | debe tener | grave |
| Etiqueta de campos | debe tener | grave |
| Objetivos táctiles | 24 px en escritorio y 44 px en móvil, en ancho y alto. Exentos: enlaces en texto corrido y casillas dentro de su etiqueta | < 24 px, media; de 24 a 44 px en móvil, leve |
| Foco visible | contorno o sombra en los seis primeros elementos al tabular | grave |
| Un `h1` por vista | exactamente uno en `main` | grave |
| Desplazamiento lateral | la página no se desplaza de lado; se señala el elemento que se sale | grave |
| Imágenes | con `alt` | grave |

Cada hallazgo lleva la **regla CSS probable**: archivo, selector y valor. Gana `!important` y después la última en orden de hoja; no se calcula la especificidad, así que es una aproximación. Cada vista guarda también su **cobertura**, para que «sin hallazgos» no oculte una medida vacía: textos medidos, textos sobre degradado, textos sin fondo medible, controles y paneles desplegados.

Resultados: `<carpeta>/result.json` (crudo, por vista) y `summary.json` (agrupado por gravedad y vistas afectadas).

## Límites

- **No sustituye** una revisión con lector de pantalla ni juzga si un texto se entiende.
- **No mide:** el modo oscuro, las ventanas que se abren al actuar (editor de contacto, propuestas), los estados de error ni los formularios rellenados.
- La medida de foco solo cubre los seis primeros elementos al tabular desde el contenido.
- Solo cubre el modo demo. El piloto autenticado oculta Equipo y Dispositivos.
- La lógica de medida está copiada y ampliada de `tools/visual/a11y.mts` y `mobile-scan.mts`, que no se editan.
