# OPS039 · Radar operativo durante una caída

29/10/2026, 22:24 Europe/Madrid. Autor Codex. Petición: continuar otra misión sin interferir con el rediseño del piloto de Claude. Skill base compliance-autopilot-execution-core. Siete archivos exactos reservados; cero solapes con reservas Claude al inicio y al cierre.

## Resultado

Nueva API de solo lectura del **CRM completo**, registrada por `createBaseApp`:

`GET /api/v2/continuity/response-queue?horizonHours=8&limit=50`

No es una ruta nueva del backend del piloto de equipo. Disponible en fuente al arrancar una compilación candidata compatible; **no desplegada en 4331/4334 por esta entrega**. Sin cambio de navegación, pantallas, estilos, paquetes o artefactos del piloto.

- Ordena las tareas en vencidas, dentro del horizonte, por revisar y posteriores. Explica cada decisión y ofrece un siguiente paso. No usa IA ni red.
- Separa fechas civiles de instantes con zona horaria. Una fecha sin hora no se convierte en medianoche vencida: compara días en Europe/Madrid y declara la incertidumbre al intersectar el horizonte.
- Estados ausentes, desconocidos, no declarados o contradictorios quedan visibles para revisión. Los IDs personalizados pueden tomar significado de una etiqueta inequívoca. Solo descarta tareas inequívocamente completadas según el campo enum configurado.
- Respeta los roles de estado/vencimiento de AppSpec; no utiliza otro campo como sustituto si el rol explícito carece de valor.
- Añade asociaciones explícitas a clientes/oportunidades u otras entidades configuradas. Un destino ausente produce aviso, no una dependencia inventada o un bloqueo remoto.
- Recuentos completos de la copia local antes de recortar hasta 200 filas; orden estable por urgencia, vencimiento y ID. Tope de 10.000 registros totales, con duplicados por entidad rechazados.
- Respuesta con captura compuesta `snapshot.id:capturedAt`, portal, naturaleza ficticia/real y revisión SHA-256 de captura compuesta/spec/registros activos. La revisión cambia con una edición local; es identificación de estado, no aprobación o firma.
- La consulta usa la copia activa; una candidata pendiente no sustituye su fuente. Hereda sesión local, Host/Origin y Cache-Control no-store del CRM completo. No introduce permisos diferentes de sus rutas de datos actuales.

## Contrato

| Entrada | Regla |
| --- | --- |
| horizonHours | Entero 1–720, defecto 24 |
| limit | Entero 1–200, defecto 50 |
| Tiempo/fuente/portal | Los obtiene el servidor, sin sobreescritura por query |
| Parámetros desconocidos o duplicados ambiguos | 422 |
| Copia sin activar/conciliar | 409 |
| Instalación protegida sin sesión | 401 |

La respuesta incluye `source`, `evaluatedAt`, `horizonEndsAt`, `timeZone`, `summary`, `items` y `limitations`. Cada elemento aporta ID, etiqueta, grupo, estado interpretado, fecha con granularidad, motivos, referencias disponibles/ausentes y siguiente paso. No ejecuta ni prepara escrituras en HubSpot.

## Pruebas y evidencia propias

Comando final:

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/response-queue.test.ts tests/response-queue-api.test.ts tests/agents.test.ts
```

**73/73 correctas:** 14 nuevas de lógica + 6 nuevas de API + 53 existentes de agentes. Typecheck `.\\node_modules\\.bin\\tsc.cmd --noEmit` correcto. Diffcheck del único archivo existente modificado y comprobación de espacios finales en todos los archivos de código nuevos correctos.

Las 20 nuevas comprueban orden/explicación, fronteras de milisegundos, días sin hora, diferencia Madrid/UTC, horario de verano/invierno y hora repetida, fechas imposibles, año bisiesto, instantes sin zona, datos numéricos ambiguos, estados personalizados/desconocidos/contradictorios, roles, referencias por entidad, recuentos anteriores al límite, empates, inmutabilidad, 10.000 registros y validación de parámetros. API mediante Fastify inject y SQLite **en memoria**, sin listener: protección, revocación, Host/Origin, sin mutaciones SQL, revisión tras edición y candidata separada.

Primer intento: 18/19. El fixture de runtime importaba directamente mediante Store y suponía que conservaría disconnected=true; esa importación lo reinicia. Se corrigió solo la preparación del fixture para entrar explícitamente en modo desconectado y se mantuvo la aserción antes/después del GET. No se cambió comportamiento de producto ni se relajó la expectativa de consulta offline. Segundo conjunto: 72/72. La revisión final añadió un caso de identidad de generación: dos capturas con el mismo snapshotId y registros pero distinta capturedAt deben tener distinta revisión. Se incluyó el captureId compuesto en el hash y su regresión pasa. Conjunto final tras ese cambio: 73/73 y typecheck correcto.

Demo ejecutada:

```powershell
node --require ./scripts/block-external.cjs --import tsx scripts/demo-response-queue.ts
```

Cuatro tareas ficticias: una vencida, una dentro del horizonte, una con estado desconocido y fecha ausente, una completada excluida. Salida temporal en tests/.tmp/ops039/demo.json. No se leyó una base real ni se usaron servicios o ventanas del usuario. Ningún dato de cliente añadido al repositorio.

## Archivos y hashes SHA-256

| Archivo | Hash |
| --- | --- |
| shared/response-queue.ts | b5a14ced94bbe12fd2215cc549dbd262a1b4e54113a04d3e3f387754a4015e67 |
| server/response-queue.ts | eb3d0d64b8da5f351f34a0ba2ff0412ec8bc878a43dda730cf50e0d9d1772465 |
| server/app.ts | 6d8d71d3a44bef8f5e7d495ff66ba08faeec4d0ccd0a20b62701b553020464e6 |
| tests/response-queue.test.ts | cf0dd9f91cc4be33f81c883e5e62ddf3646e3a78308c11db19928388a5a291fb |
| tests/response-queue-api.test.ts | e514ee4130afdbd27666974a826bcd69a49d3330b5ad64348a70502f5ad24466 |
| scripts/demo-response-queue.ts | 1420caf26d0ca8e3009777e5eee48efa6be7fe944f5388b5c1b5252b14ee53ef |

En app.ts solo se añadió import y registro de la ruta. No se tocaron SalesAgents/Today, sus permisos, esquemas compartidos existentes o fuentes reservadas de Claude. UX038 seguía working al último cotejo; eso acredita reserva, no actividad permanente del modelo.

## Límites y continuación

No hay UI nueva, QA visual, medición de recuperación ni prueba contra una instalación servida. No se ha usado npm run build, Vite, E2E o navegador, para no competir con el rediseño. Consulta local no acredita recencia o inventario completo del portal remoto. La política de estados es conservadora; taxonomías ambiguas requieren revisión. Las fechas sin hora incluyen días que intersectan el horizonte aunque no se conozca su instante. El orden ayuda a priorizar y no mide impacto comercial.

Las lecturas de Store son síncronas sin intercalado de otra petición en esta instancia; no se promete consistencia con escritores externos al proceso. El reloj procede del servidor y la zona inicial es Europe/Madrid. No multiusuario/tenant añadido: mantiene el alcance de una instalación/portal y sus controles existentes.

Memoria y panel se actualizan bajo la reserva **propia** LAB035, devuelta solo para su continuación documental. Motor/contratos/pruebas LAB035 permanecen congelados y no se autoaceptan. OPS039 queda presentada para revisión independiente. Siguiente paso: revisar esta API y luego abrir unidad exacta de consumo visual o adaptador del piloto, coordinada tras UX038; no conectar pantallas por inferencia ni desplegar desde este cierre.

## Corrección posterior · 30/10/2026, 08:51 Europe/Madrid

Radar: recortes100/180 sin partir pares UTF16. Hallazgo de QA042 contrastado por Codex; fuente reabierta y corregida dentro del alcance original. Nuevos hashes y pruebas en coordination/reports/CODEX-TEXT-044.md, que sustituyen los hashes de los archivos corregidos de la entrega anterior.63/63 focales y typecheck completo;33/33 de QA en copia temporal sinTODO con precondición de tamaño máximo (archivo Claude histórico intacto). Nueva presentación pendiente de revisión, sin autoaceptación o despliegue.
