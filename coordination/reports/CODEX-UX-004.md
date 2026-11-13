# CODEX-UX-004 · Vencimientos reconocibles en actividad HubSpot

29/10/2026, Europe/Madrid. Autor Codex; fuentes no enviadas a Claude. Continúa HS024 después de su aceptación independiente. Conserva la decisión de hora local de CLAUDE-FIX-023, sin duplicar su corrección R18 de CustomerDossier ni atribuirse sus pruebas.

## Cambio y motivo

En HubspotContext, la fecha de tareas lleva la etiqueta **Vencimiento**. Las demás actividades muestran **Fecha CRM**: el timestamp no se presenta como prueba de envío de correo o ejecución de una llamada. Las fechas ausentes o inválidas se muestran como **Sin fecha**, evitando Invalid Date. El formato sigue la hora local del navegador con es-ES; no fija Europe/Madrid. No se añade un hook, estado, dependencia, lectura automática o permiso.

El usuario puede distinguir una tarea futura de un hecho pasado sin abrir otro panel. La muestra sigue siendo parcial y puede omitir registros más recientes. El texto de cobertura del servidor se conserva. Fuente del significado de vencimiento: [guía oficial de tareas HubSpot](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/tasks/guide), contrastada en HS023.

## Evidencia

Tres pruebas nuevas del arnés del componente real: tarea futura etiquetada y otros cuatro tipos con Fecha CRM; null/fecha inválida con texto claro; hora local en UTC y America/New_York sobre el mismo instante. Las tres fallaron antes del cambio de interfaz (la prueba de zona también exige la nueva etiqueta); las cinco guardas anteriores pasaron. Después **8/8 correctas**, incluidas esas cinco de revisiones/callbacks obsoletos.

**Typecheck correcto**, build Vite aislado correcto en `tests/.tmp/ux004-build` (carpeta ignorada, sin copiar a dist/build del piloto) y detector Impeccable `[]` sin hallazgos. Se conservaron clases, elementos, colores y controles existentes. Skills aplicadas: compliance base, Impeccable clarify y React best practices; contexto/incumbente y craft-floor leídos antes de editar. No se usa el detector como prueba de contraste o legibilidad visual.

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test tests/hubspot-context-ui.test.ts
    node node_modules/typescript/bin/tsc --noEmit
    node node_modules/vite/bin/vite.js build --outDir tests/.tmp/ux004-build
    node C:\Users\iresh\.codex\skills\impeccable\scripts\detect.mjs --json src/HubspotContext.tsx

## Límites

El arnés transpila y ejecuta callbacks/JSX del componente con hooks controlados; no es ReactDOM, StrictMode, navegador o QA visual/responsive. No se comprobaron foco real, lector de pantalla, ancho320 o zoom200%. No se abren ventanas o sesiones para ello. El fallback frontend no es otro parser completo ISO; consume el contrato normalizado del backend y evita mostrar Date inválida.

No cambia rutas, cuotas, selección de asociaciones, plazos o aislamiento de servidor. No hay API autenticada, piloto reiniciado, cuentas, secretos, build publicado o nueva llamada a Claude. Revisión independiente y cotejo de hashes pendientes al presentar; no autoaceptar. Siguiente unidad debe elegirse desde pendientes reales del tablero, sin repetir R18/R16 ya entregadas por Claude.
