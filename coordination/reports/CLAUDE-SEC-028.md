# CLAUDE-SEC-028 · Los visores de solo lectura ven únicamente la instantánea guardada

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5). **Decisión del usuario** tras la auditoría de seguridad (`CLAUDE-SEC-027`): un visor no debe consultar Drive, documentos ni HubSpot en vivo, y sus lecturas no deben escribir.

## Cambio

- **`server/team/file-library.ts`:** listar el Drive de la cuenta conectada (`page`) y leer el contexto de un documento (`document`, incluida su auditoría) exigen permiso `write` (antes `read`). Los vínculos ya guardados (`links`) siguen visibles para el visor: son la instantánea.
- **`server/team/hubspot-routes.ts`:** la ficha HubSpot en vivo (`GET /v6/hubspot/:contact`), que llama a HubSpot con el token de la empresa, exige `write` **antes** de cualquier llamada (también en modo demo).
- **`server/team/commercial.ts` y `copilot-agent.ts`:** la vista general ya no ejecuta el `UPDATE` que marca como interrumpidas las ejecuciones/análisis antiguos cuando quien lee es un `viewer`; lo sigue haciendo cualquier otro rol (comprobado también con un rol `sales`).
- **Interfaz:** `CommercialWorkspace.tsx` no muestra la consulta HubSpot en vivo a quien no puede escribir (aviso: «ves solo la instantánea guardada»), deshabilita «Cargar archivos autorizados» y corrige el aviso de solo lectura; `CustomerFiles.tsx` oculta «Leer contexto del documento».
- Sin cambios de esquema ni de contratos. Un escritor conserva exactamente su acceso.

## Verificación

- `tests/viewer-snapshot.test.ts` (3 pruebas): un visor recibe 403 en `/files`, `/file-links/:id/context` y `/hubspot/:contact` y un escritor no recibe 403 ni error de servidor; el visor sí ve `commercial`, `copilot`, la empresa y la comparación de capturas; su lectura de Comercial y del agente **no modifica la base**, la de un administrador y la de un `sales` sí concilian. Las 3 **fallaban sobre el código anterior** y ahora pasan.
- 2 pruebas de interfaz nuevas en `tests/ui-journeys.test.ts` (fallan sobre los fuentes anteriores): el visor no ve HubSpot en vivo ni puede cargar archivos y no se le ofrece leer el contexto del documento; el escritor sí.
- `tsc` limpio, `npm test` **604/604**, **30 recorridos E2E** en navegador aislado correctos.
- **Revisión independiente** (subagente distinto del autor, solo lectura): *«la implementación es correcta y la decisión se cumple»*: revisó todas las rutas GET de `server/team` y no encontró ninguna por la que un visor alcance contenido en vivo de Google o HubSpot ni escritura alguna como efecto de un `GET` con permiso `read` (la única auditoría en una lectura, `file.context.read`, ahora exige `write`). Aplicado: botón «Cargar archivos autorizados» del visor, texto del aviso, comprobación del lado del escritor más estricta y caso de un rol `sales`.
- Hashes SHA-256 (16 primeros): `file-library.ts` 940d6f61b407c630 · `hubspot-routes.ts` f564860dcda5c364 · `commercial.ts` b6f6f241c2ab3ea3 · `copilot-agent.ts` 2aad0d428e325224 · `tests/viewer-snapshot.test.ts` y `ui-journeys.test.ts` cambian con este encargo (ver el commit).

## Qué sigue viendo un visor (informativo, coherente con «instantánea»)

La cuenta Google conectada y su revisión, las propuestas completas (destinatario, cuerpo, evidencias con su `remoteId`, errores y conciliación), los vínculos de archivos (`file_id` y nombre) y los datos guardados de contactos, oportunidades y tareas. No hay tokens ni secretos. Si se quisiera ocultar al visor la cuenta o las evidencias, sería otra decisión.

## Límites

- El `GET` de un visor puede mostrar estados antiguos («en ejecución») hasta que alguien con permiso de escritura abra la vista y los concilie.
- Sin Postgres real ni API real de Google/HubSpot. Las pruebas de navegador simulan el piloto sobre la demo.
- **Los recorridos E2E se ejecutaron sobre una copia con los archivos sin confirmar de Codex restaurados a `HEAD`**: su `TeamApp.tsx` actual añade una pestaña «Empresa» como vista por defecto y hace fallar `customers.spec`, `files.spec` y `v5.spec`, que esperan Contactos en `/team`. Esos recorridos tendrán que ajustarse cuando él cierre ese cambio.
- Sin despliegue: el piloto sigue con el build anterior.
