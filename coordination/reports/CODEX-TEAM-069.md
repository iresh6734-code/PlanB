# CODEX-TEAM-069 · Réplica completa y edición ligada a revisión

30/10/2026, Europe/Madrid. Nueve rutas propias reservadas, sin solape con Claude ni ampliación de sus encargos. **Presentación para revisión**, sin autoaceptación ni instalación.

## Cambio y efecto

Antes status recortaba los primeros100 registros de cualquier entidad, y TeamSync mostraba los contactos encontrados dentro de ese recorte. Con120empresas al principio, podía ocultar todos los contactos restantes y sus cambios pendientes. Ahora devuelve todas las filas guardadas (máximo existente10000), proyecta el outbox por identidad en un Map, declara totalRecords/recordsComplete y calcula una revisión SHA256 del destino/empresa/cursor/registros/outbox/conflictos. La revisión no cambia solo por consultar o por lastSync. No se expone el token.

La pantalla ofrece búsqueda por todos los términos en ID/nombre/teléfono, páginas20, contadores antes del filtro y aviso de metadatos incompletos o servidor antiguo. Solo se renderizan20 contactos a la vez. Los valores0/false se conservan; null/vacío se presentan como ausencia visible. Completitud se refiere a la réplica local recibida: **no certifica que coincida ahora con todos los registros del servicio remoto**.

La nueva ruta POST /api/v6/team-sync/edit exige revisión exacta, la compara y llama queue síncronamente sin await entre ambos.409 no añade una operación. La UI solo usa esta ruta y no hace fallback en404. La ruta v5 anterior se conserva por compatibilidad, sin esa garantía nueva; no se afirma protección global de todos los clientes antiguos.

El formulario conserva el borrador tras409, permite actualizar dentro del modal, muestra el teléfono actual y exige pulsar Revisar versión actual antes de guardar otra vez. No actualiza el valor final silenciosamente. Los handlers antiguos no guardan después de cancelar/cerrar o de recibir un acuse.

Mutaciones excluyentes desde el primer evento; cargas reemplazadas y desmontaje descartan respuestas/errores tardíos aunque el transporte ignore abort. El link también tiene exclusión en backend y revalida continuidad/vinculación después de bootstrap, antes de guardar, para no sobrescribir otra réplica. Una respuesta duplicada de bootstrap se rechaza por identidad.

Los acuses de link/sync verifican empresa/destino; edición exige queued:true y contador válido. Si el acuse es correcto y falla refresh, conserva el mensaje de lo confirmado, retira la credencial tras vincular y reintenta **solo lectura local**. Ante una respuesta no confirmada conserva borrador y exige leer antes de repetir. Error inicial no deja un spinner permanente: ofrece reintentar.

## Verificación propia

| Comprobación | Resultado |
|---|---|
| Lógica/listado/esquema nuevo |7/7|
| TeamSyncClient/API nuevas |8/8|
| UI con hooks/transporte controlados |12/12|
| Regresión existente copia local conserva cambios sin red y reanuda sin duplicar |1/1|
| Typecheck final |correcto|
| Vite y bundle server.mjs |correctos|
| Navegador final |8/8,13.5s|

Ningún skip/TODO en esos contadores. No sumar repeticiones como casos nuevos. El arnés de hooks no es DOM: se complementa con Chromium headless de caché propio, no perfil del usuario. Browser plugin not available; fallback Playwright existente.

Node prueba10000registros, proyección de cambios al último, identidad inmutable, duplicados, vinculación concurrente, otra empresa y revisión obsoleta sinmutación/red. API con inyección Fastify/Store(':memory:') y fetcher ficticio: auth/Host/Origin/no-store/lock, strict422sinrevisión,409trasduplicadoyv5compatible. La regresión anterior usa su equipoPostgreSQLembebido ficticio y transporte inyectado, sin servicio externo.

E2E:345registros simulados (120empresas+225contactos), último contacto alcanzable por páginas y búsqueda; teclado/foco44px/nooverflow; edición409,borrador/refresh/revisión explícita;doblesubmit;acuse+refreshfallido;ackmalformado;falloinicial;respuesta/errorantiguosválidos retenidos confetchignorandoabort;linkyretiradacredencial;servidorantiguo;modalmóvil. Capturas lista1440/320 ymodal320inspeccionadas, legibles.

**Sensibilidad causal propia**, sin tocar fuentes compartidas:
- Backend anterior:0/1, devuelve100 en vez de345.
- Fuente nueva con guarda de revisión retirada en copia temporal:0/1, falta la excepción exigida; mismo hash de revisión sigue disponible.
- UI anterior:0/2, doblePOST (2vs1) y escritura de estado tras desmontar (2vs0).
- Copias/logs: D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\team069-sensitivity-b67eb45b-5ebe-41d4-ba72-d1af7a7cfdc1. Los casos pasan con la fuente presentada.

## Procedencia de build y fallos del arnés

Snapshot final: D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\team069-final-133ad78d-e9df-46d1-b551-d04756d45746

Evidencia final: C:\Users\iresh\.codex\visualizations\2026\10\29\01a1896e-06ff-7690-9644-4f6de90c2826\team069\team069-bc2127a6-c786-4351-91a0-7a8a38d0cb48\final

Baseline candidate-7444fd6d-da9d-4304-8d6b-59a7af5f3158, más cuatro overlaysMANUAL067 congelados y ocho propios069. Vite nuevo y solo server.mjs recompilado con CLIesbuild/runnersaneado; los otros cinco bundles de backend/herramientas siguen idénticos por hash.23artefactos inventariados. No se repiten162Node ni seis bundles por rutina para una superficie focal.

Primera preparación se detuvo por un tipo de mi fixtureE2E (unión empresa/contacto sin anotación TeamRecord[]). Se corrigió solo el tipo del test.27focales y1regresión ya correctos se reutilizan tras comparar byte a byte sus fuentes; su procedencia está en checks.reusedFrom. Typecheck/Vite/bundle se ejecutaron sobre el snapshot corregido.

Primera pasada navegador7/8: mi getByTextexacto no contemplaba el sufijo del contador en el mensaje sin coincidencias. Cambié solo esa aserción y añadí listaDOMvacía. Se conservó el resultado inicial; variante final usa los23artefactos idénticos por hash, typecheck nuevo y8/8E2E. No hubo un cambio de producto para esconder ese fallo.

Scripts preservados bajo tests/.tmp: prepare-team069.cjs,team069-final-prepare.cjs,team069-browser.cjs,team069-sensitivity-prepare.cjs,team069-prove.cjs. Logs focal/old-team/typecheck/vite/bundle-server yJSONPlaywright separados.

## Límites

En navegador todos los GET/POST de equipo están interceptados con fixtures. En cada recorrido la consulta directa al backend confirma linked:false y connection:null: no vínculo real, servicio de equipo, cuenta o proveedor. El contrato del backend se prueba por APIin-memory; no se ha probado aquí un intercambio HTTP de producción extremo a extremo. El fetcher inyectable es parámetro del registro de rutas para pruebas, no endpoint que configure transportes remotos.

El total corresponde a la copia local; no añade sondeo, adopción remota, nuevas reglas de conflictos o garantía de sincronización completa del servicio. El límite de100outbox/25páginas y las rutas legacy conservan su semántica. Abort del cliente no cancela por sí solo una operación ya recibida por el servidor. Sin lector de pantalla/Edge, puertos4331/4334, instalaciones, secretos/base real, dependencia nueva, build/dist raíz, despliegue, commit o push.

## Ocho hashes probados

| Ruta | SHA-256 |
|---|---|
| shared/team-replica-view.ts | `a2b3d2f1e19fc1f17fb093d260c2d29b9a4df468bdd7987a3d9c99d24bee129a` |
| server/team-sync.ts | `f7352f1f814211fb9479cc4a1b0ca9e4ee4b6a294ca7286b392ec4772bc829de` |
| src/TeamSync.tsx | `e221cb65dd66c4547cc8aec647bd55e728be4912b10483e969ed251560dd198f` |
| src/team-sync.css | `dd59ccca9c01d81ef995f53857927dbf7aafbcd48b62fe141fe01c0448e6f99a` |
| tests/team-replica-view.test.ts | `35ec931e1283789d31c06ba405ea6e4e1e2df35c3ff9c59b92606592c2b97d0d` |
| tests/team-sync-contracts.test.ts | `439c2738a8ee98c6a149fcbf3d5c97cef4ae61b4b270cd244168bc47e92074aa` |
| tests/team-sync-ui.test.ts | `46891fb2194220edf489caecf246504fff34fa2c4fe9e2b50fa2ddd6104b2e57` |
| tests/e2e/team-replica-review.spec.ts | `39e9c04d98df451d11eaa6185aa998bafb87c9f219957e4b0c5f2d1aa7ee3a6d` |

Informe sellado al submit. Las reservas continúan durante revisión.
