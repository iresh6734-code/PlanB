# Revisión independiente 286 · Escenario multisistema

8/11/2026, Europe/Madrid. Codex. **Favorable para las tres huellas revisadas.** Es un conjunto ficticio interno y un oráculo para futuras pruebas de interfaz. No acredita Radar montado, navegación, proveedores conectados ni recorrido de App tras reinicio.

## Evidencia propia

Banco fijo `tests/.tmp/multisystem286-26lZ3e`, creado por `tests/.tmp/review-multisystem286.cjs`. Fuentes transitivas copiadas y cotejadas al inicio y final; manifiesto y resultados en esa carpeta. Entorno mínimo, salida externa bloqueada. Sin Chromium, sockets de proveedor ni cambios en4601.

- **8/8 originales** (12,21s), sin alterar sus aserciones: determinismo, ficción, identidades, oráculo, proyección y API real, candidatos, reloj, reinicio de SQLite en fichero y alteraciones de datos.
- **4/4 propias** (14,01s), en `tests/.tmp/multisystem286-probes.ts`: contrafactual HubSpot/Pipedrive con el mismo remoteId; cambio del pedido de cuenta B sin atribución a candidatos; digest de todas las tablas SQLite idéntico tras leer las ocho fichas y conjunto de entrada sin mutar; dos decisiones separadas y reinicios A→B→A del conjunto, que recuperan ambos historiales originales.
- **Tipos focales limpios**, no un nuevo typecheck global. Ninguna omitida, cancelada o reintentada en esos bancos.

La prueba propia de HubSpot fuerza un bloqueo de venta y obtiene rol afectado `sale`, mientras Pipedrive conserva `delivery`; por tanto no se limita a comparar dos estados que ya eran iguales. La de cuenta B cambia su estado y mantiene ambigua la ficha de candidatos, aun siendo el mismo ID remoto que A. La lectura no añade escrituras a ninguna tabla, además de la comprobación original del diario.

Preparación inicial `multisystem286-jVcHqP` no llegó a ejecutar pruebas: mi script supuso un `server/schema.sql` inexistente. Se corrigió la lista de recursos del arnés sin cambiar fuentes o expectativas. No es un fallo del producto.

## Evaluación

El dataset contiene ocho compromisos y veintidós observaciones; los pedidos y las cuentas son ficticios y las etiquetas de proveedor no afirman conexión. `external` o igualdad de título/ID no crean enlaces. Las referencias distinguen proveedor, cuenta, rol e ID, y los candidatos no aportan evidencia observada. Cobertura parcial, ausencia de lectura y fuente no disponible conservan estados distintos. Los dos casos sanos no convierten las demás incertidumbres en ausencia de riesgo.

El oráculo se escribió aparte de la proyección y se contrasta con esta y con `registerCommitments` real usando inyección HTTP. El caso sano permite cierre observable; el escenario bloqueado no. Las observaciones caducan con el reloj.

**Decisión de montaje pendiente:** fijar y persistir el instante del conjunto. Cambiar `now` cambia su revisión y oculta las decisiones de la otra revisión; al volver al conjunto exacto reaparecen. Esto es aislamiento, no pérdida demostrada. El montaje central debe conservar la semilla; la aceptación de este fixture no resuelve esa decisión ni modifica `main`.

No repetí los nueve mutantes de archivo comunicados por Claude. Sí ejecuté los seis contrafactuales contenidos en su octava prueba y los dos contrafactuales propios de identidad. El reinicio verificado es de API/Store en fichero, no de una instalación o pantalla de App.

## Huellas aceptables

| Archivo | SHA-256 |
| --- | --- |
| shared/commitment-multisystem-demo.ts | 7e6f4e2a5dfe5fcbfd443dabd9581f569f883db291201a9fb967959258980fbd |
| tests/commitment-multisystem-demo.test.ts | 089fcbe632e4eb41533762d23f8edf4f3c639796a6a38d60b0f988ec6a31d6f0 |
| coordination/reports/CLAUDE-MULTISYSTEM-SCENARIO.md | c5806fac9e175ad75a3f258f547be1aec1464035aa638b76e0511545d009a00f |

`shared/commitment-demo.ts` y su prueba permanecieron en el corte inicial, sin ediciones de este revisor. Dictamen286 presentado para revisión del coordinador; `CLAUDE-MULTISYSTEM-SCENARIO` puede aceptarse por estas huellas. Siguiente: consumir escenario/oráculo tras sus puertas UI y montaje, con pruebas reales detectar→fuente→decisión→reinicio→historial.
