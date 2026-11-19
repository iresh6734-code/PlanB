# Auditoría de `/team` · segunda ronda: modo oscuro y ventanas

Encargo `CLAUDE-TEAM-AUDIT-R`; hallazgos en `coordination/reports/CLAUDE-TEAM-AUDIT-R.md`. Amplía la primera ronda (`README.md`) **sin cambiar sus archivos**, que siguen en revisión: reutiliza `checks.mjs` (medidas de la vista) y `start.mjs` (ensayo en 4531/5299).

```bash
node tools/team-audit/run-r.mjs --start                 # arranca el ensayo, recorre claro y oscuro, vistas y ventanas, y lo para
node tools/team-audit/run-r.mjs --start --themes dark   # solo el modo oscuro
node tools/team-audit/run-r.mjs --no-views              # solo ventanas, contra un ensayo ya en marcha (PLANB_TEAM_AUDIT_ORIGIN)
node tools/team-audit/run-r.mjs --self-test             # comprueba las medidas de ventana con diálogos sintéticos
NODE_ENV=test npx tsx --test tests/team-audit-r.test.ts
```

## Modo oscuro

El tema se activa **como la App**: antes de cargar la página se guarda `planb:theme = dark` en `localStorage` (`src/app-shell/theme.ts`), y `src/main.tsx` lo aplica como `html[data-theme="dark"]`. El recorrido comprueba que el atributo quedó puesto. Se miden las mismas 8 secciones × 4 perfiles × 1366/390/320 px, con las mismas medidas de la primera ronda: contraste (también sobre degradados), nombres, etiquetas, objetivos táctiles, foco, `h1`, desplazamiento lateral y paneles desplegados.

## Ventanas

| Ventana | Dónde | Cómo se mide |
| --- | --- | --- |
| «Editar teléfono del equipo» | Contactos → «Editar teléfono de …» | En cada perfil que puede editar, anchura y tema. En «Solo lectura» el botón está desactivado: se anota como nota, no como hallazgo |
| «Nuevo espacio» | Solo en el piloto local (Integraciones) | En `tools/team-audit/harness.html`, que monta `src/TeamSpaceCreate.tsx` **sin cambios** con los mismos estilos y tema que la App y una llamada falsa que rechaza cualquier envío |

Comercial y Agente no abren ventanas propias: usan paneles plegables, que se miden desplegados en el recorrido de vistas, y un `confirm()` nativo del navegador que el recorrido descarta siempre.

Cada ventana se abre **con teclado** desde su botón (Enter), para poder comprobar el retorno del foco. Se comprueba:

| Medida | Fallo (todos graves) |
| --- | --- |
| Nombre accesible del diálogo | `dialog-name` |
| `aria-modal="true"` | `dialog-modal` |
| Foco inicial dentro | `dialog-initial-focus` |
| Tab y Mayús+Tab (focusables + 2 veces cada uno) no salen de la ventana | `dialog-trap` |
| Foco visible dentro | `dialog-focus-visible` |
| Escape cierra | `dialog-escape` |
| Al cerrar, el foco vuelve al botón que la abrió | `dialog-return` |
| Contraste, nombres, etiquetas y objetivos dentro de la ventana | igual que en la vista |

**Nunca se envía nada:** dentro de la ventana solo se pulsan Tab, Mayús+Tab y Escape.

Resultados: `<carpeta>/result.json` (crudo, con notas) y `summary.json` (agrupado por gravedad, con los temas en que aparece cada problema).
