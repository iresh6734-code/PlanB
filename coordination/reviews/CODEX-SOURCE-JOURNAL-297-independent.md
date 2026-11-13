# Revisión independiente de297 · Diario local de lecturas

8/11/2026, Europe/Madrid. Chat Codex «Prepara un plan potente para Claude». Se acepta el módulo interno sobre este corte. No acredita integración visible, lectura de proveedor ni autorización de cuentas.

## Fuentes revisadas

| Archivo | SHA-256 |
| --- | --- |
| server/source-reading-journal.ts | 85b9a7d106646c1e045c6904bf07682ace356d088db0d9536cc75d5e91354d01 |
| tests/source-reading-journal.test.ts | 7c05bfe7272b6dfc3257966a1543a9ed018a5e6beffb90e6d849dac3df8b9e7d |
| coordination/plans/SOURCE-READING-JOURNAL-297-CONTRACT.md | 0758358fbf9b57701e88c95aadf79407699b3c286f55bfd13b8834c6bb0fe681 |
| coordination/reports/CODEX-SOURCE-READING-JOURNAL-297.md | afb6d8b8089a28bc28f3d3366e9362ac6b058fc59809cd9f0b47b10cf3aae4f3 |

Las cuatro huellas se cotejaron antes y después. No se editaron fuentes del autor. Las dependencias se congelaron por manifiesto: SourceReading y transporte Zendesk corresponden a sus versiones aceptadas. Los archivos base sin entrega individual mantienen su hash, sin inventar una aceptación o dueño específicos.

## Comprobación propia

Banco nuevo `tests/.tmp/source-journal297-independent-SvCSAk`, driver `tests/.tmp/review-source-journal297.cjs`, adaptado del driver presentado para admitir estado review y usar raíz/puntero propios. Red exterior bloqueada, entorno mínimo y claves ficticias nuevas; sin navegador ni terminal de credenciales.

- Diario: **18/18**, 3,21 s, sin omisiones, cancelaciones o TODO.
- Regresión Zendesk R3: **29/29**, 3,02 s.
- Tipos focales: exit0.
- Manifiesto y result.json conservados; fuentes de raíz y copia privada cotejadas por el driver. CIM posterior limitado al banco: ningún proceso vivo.

La preparación inicial falló por quoting de PowerShell y el intento posterior no encontró el driver que aún no se había creado. No fueron fallos del producto ni pasadas parciales del banco. Se corrigió la preparación mediante here-string y el pase completo anterior terminó correctamente. No se atribuye a esta revisión la repetición de los cinco mutantes del autor.

## Lectura estática y alcance

La consulta no inicializa ni repara el diario. La escritura guarda una lectura validada bajo BEGIN IMMEDIATE, compara el head para contenido nuevo y permite replay exacto devolviendo el recibo original sin renovar fechas. La lectura vuelve a comprobar identidad, secuencia, contenido y enlaces. Los objetos de entrada y salida no sustituyen el estado persistido por referencia. Límites de entradas y bytes rechazan el alta completa sin purgar evidencia.

El replay devuelve el recibo original y la revisión actual del conjunto; no se interpreta esa revisión como una nueva observación. Un error después del COMMIT puede producir write-uncertain, y el mismo contenido permite conciliar por lectura/replay. El contrato no afirma que una excepción equivalga a no guardado.

Los casos de archivo, cifrado, proceso nuevo, dos conexiones con head antiguo, corrupción y conservación del CRM pasaron en el banco repetido. Dos conexiones con escritor obsoleto no prueban una carrera multiproceso simultánea. Tampoco se ha probado corte de energía, disco lleno, instalación comercial u otro equipo.

Un recibo es persistencia local. No acredita proveedor observado, consentimiento, identidad autenticada, conexión o cobertura A4. La huella encadenada no es firma ni detecta restaurar un prefijo antiguo coherente sin ancla externa. SourceStatus en corrección no se consume. El futuro anfitrión sigue debiendo autorizar lectura/escritura y validar la procedencia. Ningún endpoint o montaje App/main forma parte de esta aceptación.

## Decisión

Sin hallazgos bloqueantes en el alcance presentado. Se acepta CODEX-SOURCE-READING-JOURNAL-297 sobre las cuatro huellas anteriores. El siguiente paso es acordar registro de fuentes/consentimiento y montaje local, con reservas nuevas y SourceStatus aceptada. Esta revisión se presenta al otro Codex; no se autoacepta.
