# CLAUDE-FIX-014 · Corrección de los recorridos R-01 a R-19 de CLAUDE-004

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5). Hecho por encargo expreso del usuario (asume la ejecución), con reservas propias CLAUDE-FIX-014 y CLAUDE-FIX-015. **Pendiente de revisión independiente** (no he aceptado mi propia entrega).

## Qué se cambió

Sin cambios de servidor, contratos, permisos ni esquema. No se ha relajado ninguna condición de revisión, permiso ni restricción de destinatario; dos se han endurecido (R-03, R-05).

| ID | Estado | Cambio |
| --- | --- | --- |
| R-01 | Hecho | `CommercialWorkspace` informa del nº de borradores sin guardar (`onDirtyChange`); `TeamApp` pide confirmación al cambiar de sección, de empresa, en el selector «Perfil de ensayo» (modo demo) y al bloquear el piloto, y añade `beforeunload` mientras haya cambios. **No cubierto:** la caducidad de sesión (401) del piloto sigue desmontando la pantalla sin aviso. |
| R-02 | Hecho | `load()` combina la lectura con las ediciones locales (`reconcileDrafts` en `src/commercial-drafts.ts`). Una edición se descarta solo si el servidor cambió esa propuesta, y se avisa. |
| R-03 | Hecho | Tras aprobar o ejecutar se limpia la revisión; «Ejecutar» exige una casilla propia («Confirmo que quiero ejecutar ahora…»). |
| R-04 | Hecho | «Ejecutar» queda deshabilitado con Google desconectado (fuera del ensayo) y lo explica. |
| R-05 | Parcial | Aviso de confirmación si ya hay un borrador abierto para ese cliente, **solo en `CommercialWorkspace`**: el «Preparar seguimiento» de la ficha y «Preparar borrador» del agente no lo tienen. **No hecho:** clave de idempotencia en servidor/cliente para preparar y para los análisis del agente (requiere cambio de servidor). |
| R-06 | Hecho | Componente `LoadError` con «Reintentar» en Comercial, ficha, documentos, contactos y agente; `TeamContacts` limpia el error en lecturas posteriores correctas. |
| R-07 | Parcial | Motivos accesibles (`aria-describedby`) en Aprobar/Ejecutar, Preparar seguimiento y Analizar y mejorar. **No hecho:** «Preparar autorización Google» y «Revisar importación». |
| R-08 | Parcial | Tras completar una acción de la ficha el foco pasa a «Próxima acción»; el contexto propuesto del agente y el texto de documento reciben foco y desplazamiento. **No hecho:** sustituir `disabled` por `aria-disabled` en botones con operación en curso (el foco sigue perdiéndose al guardar un borrador). |
| R-09 | Hecho | `onProposal(id)`: el agente entrega el id creado o aplicado; el id ya no se queda obsoleto al salir de Comercial. |
| R-10 | Hecho | `Modal` acepta `confirmClose`; la ficha pide confirmación con texto o archivos sin guardar (Escape, clic fuera y botón Cerrar). El Picker (`location.assign`) sigue sin avisar. |
| R-11 | Hecho | Cambiar la cuenta o el consentimiento retira el enlace «Continuar en Google». No se limpia el `sessionStorage` `planb-google-oauth` (inocuo: el siguiente `begin` lo sobrescribe). |
| R-12 | Parcial | Búsqueda sin acentos y paginación (100 + «Mostrar más») en Contactos; selectores de cliente con búsqueda y etiqueta `nombre · correo`. No es un combobox ni se ha medido con miles de filas. |
| R-13 | Hecho | La acción y la recarga se informan por separado en Comercial, ficha, documentos y agente. Si la recarga falla con datos ya cargados, Comercial y el agente muestran «Actualizar lista» / «Actualizar panel» (el aviso citaba un control que no existía; lo detectó la revisión). |
| R-14 | Parcial | Nota de solo lectura en Comercial; ficha ya no dice «Puedes guardar una aquí» a un lector; el aviso de destinatario habla de «aprobar». No hecho en el agente. |
| R-15 | Hecho | `TabList`: panel enlazado (`aria-controls` solo en la pestaña activa), `tabIndex` móvil, flechas, Inicio y Fin (Comercial y fuente de contactos). |
| R-16 | No hecho | Progreso y cancelación de ejecuciones largas del agente (requiere diseño). |
| R-17 | Parcial | `pre` del contexto documental con `pre-wrap`; botones de icono de la ficha a 44 px. No comprobado visualmente en 320 px con un texto largo. |
| R-18 | No hecho | Zona horaria de la ficha. Sigue siendo hipótesis. |
| R-19 | Parcial | Nombre accesible sin «undefined»/ID, avisos limpios al cambiar de pestaña y `Modal` ya no reinicia su efecto en cada pintado. No hecho: reapertura de la primera propuesta tras contraer todas, columnas de la tabla de importación, `toLocal`. |

Archivos: `src/CommercialWorkspace.tsx`, `CommercialEditor.tsx`, `TeamApp.tsx`, `CustomerDossier.tsx`, `CustomerFiles.tsx`, `TeamContacts.tsx`, `TeamAgentWorkspace.tsx`, `components.tsx`, `design-system.css`, `customer-dossier.css`, nuevos `LoadError.tsx`, `TabList.tsx`, `commercial-drafts.ts`, `tests/ui-journeys.test.ts` y tres recorridos E2E (`CLAUDE-FIX-015`: `v6.spec.ts`, `customers.spec.ts`, `ux.spec.ts`).

## Verificación realizada

- `tsc --noEmit`: sin errores. `vite build` a carpeta temporal: correcto.
- `npm test`: **530/530** (491 anteriores + 39 nuevas).
- `tests/ui-journeys.test.ts`: **39/39** con el código nuevo y **6/39** contra los fuentes anteriores (`HEAD`): los que pasan sobre el código antiguo son funciones puras y `TabList`, módulos nuevos. Incluye tres pruebas que montan el `CommercialEditor` real (enlace entre `decisionBlockers` y los botones Aprobar/Ejecutar). El resto falla por comportamiento (ediciones pisadas, revisión conservada, sin reintento, etc.). Es un arnés de hooks controlados sin React DOM: comprueba estado y props, no el renderizado.
- **E2E en navegador real:** Chromium propio de Playwright (headless, perfil nuevo, red externa bloqueada, puertos 4337/4341, datos en `tests/.tmp/e2e-run`), contra un build separado que **no toca `build/` ni `dist/` del piloto**. 25 recorridos correctos (repetidos tras las correcciones de la revisión): team (v6 ×3, customers ×2, files ×4, ux ×2), v3, v4 ×2, v5, continuity ×8, agente local ×2. El nuevo recorrido de v6 comprueba en navegador la confirmación al salir, la ficha protegida y las flechas de las pestañas.
- Tres recorridos E2E necesitaron actualizarse por los dos comportamientos deliberados (R-03 y R-05); no se relajó ninguna aserción y se añadieron comprobaciones (Ejecutar deshabilitado hasta confirmar; ningún `POST …/execute` antes).
- Un primer intento falló por mi entorno aislado (faltaba `scripts/block-external.cjs` para el simulacro y `drill.mjs`); no era regresión.

## Cómo repetir las comprobaciones E2E sin tocar el piloto

```
npx vite build --outDir tests/.tmp/e2e-run/dist --emptyOutDir
npx esbuild server/main.ts server/team/main.ts ... (cada uno a tests/.tmp/e2e-run/build/*.mjs, --bundle --platform=node --format=esm --packages=external)
# también drill-worker.ts → drill.mjs y runtime.ts → runtime.mjs, y copiar scripts/block-external.cjs a tests/.tmp/e2e-run/scripts/
# Playwright con webServer.cwd = tests/.tmp/e2e-run y launchOptions.executablePath al chrome-headless-shell de ms-playwright
```
`tests/.tmp/` está ignorado por Git.

## Límites y pendientes

- No revisado visualmente ni con lector de pantalla: foco real, anuncios, contraste del nuevo texto y diseño de las nuevas etiquetas a 320/390 px más allá de la comprobación de desbordamiento horizontal que ya hace v6.
- `TeamApp` no tiene prueba de hooks propia: su guarda de salida solo está cubierta por el recorrido de navegador.
- `window.confirm` es nativo: sirve y es accesible, pero es un diálogo del navegador; un diálogo propio sería una mejora de diseño.
- Sin despliegue, reinicio del piloto ni acciones externas.
- **Revisión independiente** (subagente distinto del autor, solo lectura): *aceptable con correcciones menores*, sin regresión de seguridad ni de revisión (las cinco condiciones de Aprobar/Ejecutar se conservan y se añaden dos). Aplicado: control «Actualizar» tras recarga fallida, guarda en el selector de perfil de ensayo, `aria-controls` solo en la pestaña activa, pruebas con el editor real (cubren la mutación que se le escapó: quitar `disabled` de Aprobar), aserciones reforzadas y aclaración de R-05/R-11. De sus 9 mutaciones, las 9 las detectaron las pruebas. No reprodujo los E2E ni `npm test`. Reconocido y pendiente: los motivos con `aria-describedby` cuelgan de botones deshabilitados, que no reciben foco con Tab (el texto sí es visible).
