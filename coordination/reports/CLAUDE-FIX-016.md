# CLAUDE-FIX-016 · Idempotencia opcional al preparar un seguimiento (servidor)

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5), por encargo expreso del usuario. Cierra la parte de servidor del hallazgo R-05 de `CLAUDE-004`.

## Problema

`POST /spaces/:tenant/v6/proposals` generaba siempre un id nuevo. Si la respuesta se perdía y la persona reintentaba, se creaban dos borradores idénticos para el mismo cliente (y en el flujo del agente, dos análisis contra el límite mensual).

## Cambio

- `server/team/commercial-routes.ts`: el cuerpo acepta un `id` opcional validado como UUID (`.strict()` se mantiene).
- `server/team/commercial.ts`, `prepare(…, requestId?)`: el id del borrador del agente o el `requestId` se tratan como clave de idempotencia.
  - Misma clave y mismo contacto: devuelve la propuesta existente **sin tocarla** (conserva ediciones y estado) y sin volver a auditar.
  - Misma clave con otro contacto: 409 «La propuesta pertenece a otro contacto.» (comportamiento ya existente para el agente, ahora general).
  - Sin clave: igual que antes (id aleatorio).
  - La auditoría `commercial.prepare` se registra solo si la fila se inserta realmente (`RETURNING id`).
  - Si el `INSERT` no inserta nada (otra petición con el mismo id se adelantó), se relee la fila y, si pertenece a otro contacto, se responde 409 en lugar de devolver su id.
  - Un `requestId` que ya es el id de una ejecución del agente (`team_copilot_runs`) se rechaza con 409 «Ese identificador está reservado.», para que nadie se adelante a `apply` del agente. Es una petición del cliente, no del agente: `agent.id` no pasa por esta comprobación.
- Sin cambios de esquema, permisos, contratos compartidos, aprobación ni ejecución. La clave es única por (empresa, id): no cruza empresas.

## Verificación

- `tests/proposal-idempotency.test.ts`: 9 pruebas (6 iniciales + 3 tras la revisión). Con el código nuevo pasan 9/9; con los dos archivos de servidor anteriores (`HEAD`) fallan las 3 de comportamiento (reintento duplica, otro contacto no se rechaza, la ruta rechaza el `id` por `.strict()`) y pasan las 3 de protección (sin id, otra empresa, validaciones propias), que son guardas de regresión.
  - Cubre: dos peticiones, una propuesta y una auditoría; el reintento no pisa una edición; 409 con otro contacto; sin id se crean dos; mismo id en dos empresas no colisiona; un contacto inexistente se sigue rechazando; en la ruta: UUID válido, `no-es-uuid` y un número se rechazan sin crear nada, y un lector recibe 403 incluso con id.
- `tsc --noEmit` sin errores. `npm test`: **539/539** (530 anteriores + 9 nuevas).

## Límites

- **El cliente todavía no envía el id.** Las tres pantallas que preparan (Comercial, ficha y agente) están en `CommercialWorkspace.tsx`, `CustomerDossier.tsx` y `TeamAgentWorkspace.tsx`, bloqueados por la entrega `CLAUDE-FIX-014` (en revisión). Hasta que Codex la acepte o la devuelva, el servidor ofrece la capacidad pero nada la usa; el comportamiento visible no cambia. Cableado previsto: generar el id al elegir cliente (o al abrir la vista previa del agente), reutilizarlo en el reintento y renovarlo tras un éxito o al confirmar «preparar otro».
- No hay lease distribuido. Con el mismo id y el mismo contacto, dos peticiones simultáneas producen una propuesta y una auditoría (probado). Con el mismo id y contactos distintos, la relectura posterior al `INSERT` devuelve 409; **esa rama solo se ejerce en una carrera real de Postgres con varias conexiones**: PGlite serializa y la rechaza antes, así que una mutación que elimine la relectura no la detecta ninguna prueba.
- Una repetición devuelve la propuesta existente **antes** de revalidar fuente y contacto: si la fuente comercial cambió o el contacto perdió el correo, el reintento devuelve el id antiguo en lugar de 409/404. Es lo esperado en una repetición idempotente y no es un riesgo de aprobación: `approve` y `execute` comparan la revisión de origen y el hash.
- Esto no deduplica por cliente cuando no hay id; ese aviso lo da la interfaz (R-05 en `FIX-014`).
- Sin despliegue ni reinicio del piloto.
