# Prompt para Claude · Revisión independiente de las nuevas capacidades

Trabaja en D:/AI/Plan-B-CRM-v2.1/source, en una sola sesión y sin subagentes. Lee AGENTS.md, COORDINACION.md, CONTEXTO-PROYECTO.md y consulta `node tools/coordination/board.mjs list` antes de escribir. El encargo **CLAUDE-QA-042** está registrado ready. Codex desarrolla BACKUP041 en otros archivos.

## Respeta lo que ya tienes en curso

- Si UX038 sigue working y eres su sesión autora, termina y presenta esa entrega antes de empezar QA042. No interrumpas ni tomes la reserva de otra sesión.
- Si UX038 está en review, conserva sus archivos congelados. No vuelvas a rediseñar ni despliegues para hacer esta revisión. Su aceptación corresponde a Codex; tu informe del rediseño no es una revisión independiente de tu propia entrega.
- Si la sesión actual es la autora de UX032 y sigue working por la devolución R2, corrige primero su prueba nº13 dentro de su reserva: abrir realmente el combobox con `c.click()` y afirmar las tres opciones antes de pasar disabled:true. Conserva cierre, ninguna selección y rehabilitación sin reapertura. Demuestra que el caso detecta el código defectuoso usando solo una copia temporal, sin mutar fuentes compartidas. Presenta hashes nuevos y deja de editar. Si otra sesión es la titular, no tomes su trabajo.
- Si un encargo está reservado por otra sesión, respétalo aunque el actor del tablón también se llame claude. El tablón no distingue automáticamente sesiones. No modifiques board.json ni liberes entregas pendientes.

## Misión QA042

Revisa de forma adversa e independiente estas entregas de Codex, sin editar sus fuentes ni sus pruebas:

1. **LAB035**: `shared/continuity-lab.ts`, informe `coordination/reports/CODEX-LAB-035.md`. Escenarios de caída del CRM/pérdida de equipo y evidencia ligada a espacio/fuente/captura. No está conectado a datos reales ni UI.
2. **OPS039**: `shared/response-queue.ts`, `server/response-queue.ts`, informe `coordination/reports/CODEX-OPS-039.md`. API de tareas del CRM completo, con roles, fechas Madrid, estados, procedencia y límites.
3. **DIFF040**: `shared/capture-comparison.ts`, `server/capture-comparison.ts`, informe `coordination/reports/CODEX-DIFF-040.md`. Comparación de capturas conciliadas, paginación, campos tipados, esquema y relaciones.

Lee el código y los contratos antes de decidir los casos. Comprueba los hashes actuales contra los presentados por el tablón y los informes. Si cambiaron, informa qué versión estás revisando y no apruebes por un hash viejo. LAB035 puede haberse vuelto a presentar por memoria/panel: distingue esos cambios documentales de su motor congelado.

Reserva QA042 con:

```powershell
node tools/coordination/board.mjs claim CLAUDE-QA-042 claude
node tools/coordination/board.mjs check-path CLAUDE-QA-042 claude tests/independent-continuity-review.test.ts
node tools/coordination/board.mjs check-path CLAUDE-QA-042 claude coordination/reviews/CLAUDE-QA-042.md
```

Tus **únicos archivos de escritura compartidos** en esta unidad son:

- tests/independent-continuity-review.test.ts
- coordination/reviews/CLAUDE-QA-042.md

Fixtures y copias de mutaciones efímeras únicamente en tests/.tmp/claude-qa042. Los archivos fuente citados y los tests del autor son solo lectura. No edites server/app.ts, server/v2.ts, shared/model.ts, código BACKUP041, App/TeamApp, estilos, package/lockfile, memoria o panel. Si hace falta otro archivo compartido, registra el bloqueo y la causa; no amplíes la reserva por tu cuenta.

## Qué contrastar

**LAB035:** evidencia ajena o caducada no prepara otra captura; verificar orden temporal y fronteras; distinguir disponibilidad declarada, copia verificada, simulacro local y restauración; null no se convierte en cero. Contrasta las precondiciones del caso y el resultado. La procedencia suministrada por un adaptador no implementado está declarada como límite: no atribuyas una garantía de autenticidad inexistente al motor.

**OPS039:** configuración de campos y estados personalizados/desconocidos; fechas civiles frente a instantes con offset, cambio de día Madrid/UTC y cambio de hora; orden estable y recuentos completos antes de limitar; referencias por entidad y fuentes activas frente a candidatas. Si revisas la API, usa Fastify inject, SQLite en memoria y sesión ficticia; comprueba ausencia de mutaciones.

**DIFF040:** ausencia/null/vacío y tipos sin coerción; IDs iguales en entidades distintas; coincidencias de claves y orden de propiedades; vistas previas iguales cuyo contenido completo difiere; cambios solo de esquema; etiquetas y multiplicidad de relaciones; páginas y límites; incompatibilidad de portal/origen/clase; capturas inválidas e identidad guardada. La ausencia en una captura no demuestra borrado remoto; el hash no se presenta como firma.

Elige casos de valor que no sean una copia de los del autor. No rellenes una cifra de pruebas. Incluye precondición visible y oráculo razonado: una prueba titulada «lista abierta» debe abrirla. No cambies una aserción para adaptar el contrato a un fallo. Un fallo de arnés o una hipótesis sin reproducción no es un defecto de producto. Para demostrar sensibilidad puedes quitar una guarda en una copia efímera, nunca mutar/restaurar el archivo compartido mientras otros trabajan.

## Verificación y límites

Ejecuta tus casos Node con red externa bloqueada:

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/independent-continuity-review.test.ts
```

Ejecuta las pruebas focales originales cuando ayuden a explicar una regresión. No hace falta npm test global por rutina. Typecheck si corresponde; atribuye errores ajenos y no los arregles fuera de alcance. No Vite, E2E o navegador para esta revisión de lógica/API. No npm run build, listeners, instalaciones o despliegues. No datos/bases/cuentas/proveedores reales, Windows DPAPI, equipo corporativo, correo, perfiles o ventanas personales. No enviar nuevas fuentes mediante consult.mjs ni activar herramientas externas.

## Entrega

En el informe separa cada unidad: dictamen favorable/devolver/pendiente, hash revisado, comportamiento esperado y observado, reproducción exacta, comandos/resultados y límite de lo verificado. Incluye fallos previos del arnés si afectaron la interpretación. No declares QA visual, API real o recuperación en otro equipo sin ejecutarlas. Si encuentras un fallo, deja una regresión reproducible y recomienda la corrección; no implementes el arreglo en la fuente de Codex.

Presenta con:

```powershell
node tools/coordination/board.mjs submit CLAUDE-QA-042 claude --note "Unidades revisadas, resultados y límites; fuentes ajenas intactas"
```

No aceptes tareas usando el actor codex y no autoaceptes UX038. Codex contrastará tus pruebas y dictámenes antes de aceptar o corregir las entregas. Al presentar, deja de editar estos dos archivos. No encadenes una unidad nueva por tu cuenta.
