# RESTORE050 · De archivo válido a trabajo persistente

30/10/2026, Europe/Madrid. Fase propia de Codex, independiente de la UI OPS048. El objetivo es comprobar que una copia ficticia puede restaurarse por la API local y conservar trabajo después de terminar el proceso. No considerar una validación en memoria como recuperación real ya probada.

## Unidad implementada

- Orquestador server/recovery-rehearsal.ts: artefacto portátil explícito, hasta2MiB y únicamente origen fixture/isTestData. Valida integridad en memoria antes de crear una carpeta nueva con UUID en tests/.tmp/recovery-rehearsals. Nunca recibe una ruta de base o instalación existente.
- Worker server/recovery-rehearsal-worker.ts: dos procesos Node independientes, sin listeners o navegador; runtime:true y Fastify.inject. Ambos usan block-external y entorno saneado. El primero configura protección nueva del ensayo, restaura por API y comprueba cuatro operaciones; el segundo vuelve a autenticarse y coteja revisión/recuentos/historial persistidos.
- CLI scripts/rehearse-portable-recovery.ts: ayuda por defecto, solo --run-fixture ejecuta. Genera datos ficticios y contraseña efímera nuevos; no admite rutas o contraseñas del usuario.
- Informe JSON por ejecución, con hashes, checks, PIDs y duración; sin valores de fichas o claves. Conserva la carpeta ficticia para revisar, sin limpieza recursiva o sobreescrituras.

## Criterios verificables

1. Hash del artefacto y revisión de entrada, revisión esperada después de las normalizaciones legítimas de restauración, revisión del trabajo de ensayo y revisión tras reinicio diferenciadas.
2. No se hereda una aprobación de devolución; un envío incierto no se trata como un flujo editable seguro. Un fallo de operación impide status:passed.
3. Cliente encontrado/editado, oportunidad avanzada, tarea creada/completada y cuatro entradas nuevas en historial; las operaciones solo ocurren en el SQLite nuevo.
4. Proceso anterior terminado y nuevo PID, autenticación local y mismo contenido/historial/revisión después. La protección usa solo la clave nueva del ensayo en el usuario actual.
5. Artefactos inválidos, contraseñas incorrectas y cuentas/orígenes fuera de alcance se rechazan sin crear base. El worker también comprueba el alcance aunque se invoque directamente.

## Coordinación vigente

OPS048R2 fue contrastada y aceptada por Codex:109/109 focales propias, typecheck, sensibilidad independiente10pass/4fail en la versión anterior;5+8E2E siguen atribuidos al autor. No instalación acreditada. Revisión en coordination/reviews/CLAUDE-OPS-048-r2-codex.md.

El usuario pidió un encargo largo y difícil para Opus mientras Codex continúa. CLAUDE-QA-052 está registrada con cuatro archivos propios para auditoría adversa de BACKUP041/SAFE049/REL046. Brief extenso en coordination/briefs/CLAUDE-MEGA-QA-052.md; prompt entregado en este chat para copiar, sin envío automático o sesiónClaudecontrolada acreditados. No incluye RESTORE050 mientras está en desarrollo.

## Puertas siguientes

Primero, revisión independiente de RESTORE050 y sus evidencias. QA052 puede señalar hallazgos de unidades anteriores sin editar sus fuentes. Codex corrige solo sus reservas después de congelar el repro y vuelve a presentar. Ninguna prueba propia permite autoaceptar esas unidades.

Después se puede diseñar un consumidor visible de recuperación o un ensayo del paquete compilado con unidad exacta nueva: contrato de evidencia, controles de acceso, snapshot/runtime concretos y respaldo vigente. La prueba actual es API de fuente en este ordenador; no sustituye navegador, paquete instalado, nuevo equipo, RPO/RTO de negocio o credencial de proveedor.

No ampliar al equipo corporativo original, instalaciones existentes, bases de clientes, proveedores, correos, IA autónoma o multiusuario. No npm run build, dependencias, commit/push o despliegue. Los informes históricos y la memoria conservan sus fechas; consultar siempre el tablón antes de asignar.
