# CLAUDE-PASSWORD-HASH-V2 · Contraseña local con parámetros versionados

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora F2 del informe, con prioridad P3 según la fe de erratas: el hash ya estaba cifrado en `meta` con la clave local.

## Cambio

- `server/password-hash.ts` (nuevo):
  - `hashPassword` guarda `{ v: 2, N: 32768, r: 8, p: 1, salt, hash }`, el doble de trabajo que el valor por defecto de Node, con `maxmem` explícito;
  - `verifyPassword` verifica con los parámetros guardados y en tiempo constante, y rechaza registros dañados o con parámetros absurdos (N > 2^20, valores no enteros), así que no puede consumir memoria sin límite.
- `server/security.ts`: `setup` y `login` usan el módulo. El formato anterior (`{salt, hash}` con los parámetros por defecto) **se sigue aceptando** y se sustituye por el actual en el primer desbloqueo correcto, sin pedir nada. Un intento fallido no toca nada. Las rutas y las respuestas no cambian.
- `server/team/local-auth.ts` (servicio de equipo) sigue con el patrón anterior. Queda fuera de este encargo.

Huellas: `password-hash.ts` `1e05029e…07a3` · `security.ts` antes `17beae89…535a`, después `c0ec2246…44d1` · prueba `08e34fac…e5c3`.

## Verificación

- `tests/password-hash-v2.test.ts` **4/4**:
  - formato nuevo, con sal distinta en cada guardado;
  - el formato anterior se acepta y solo pide actualizarse con la contraseña correcta;
  - registros dañados o absurdos se rechazan;
  - **desbloqueo real** con el formato anterior: un 401 no toca nada; el correcto actualiza a v2 y sigue abriendo; la configuración inicial ya guarda v2.
- Con `security-hardening`, `local-authorization` y `auth-parent`: **31/31**. `tsc` 0.

## R2 · Corrección pedida en CODEX-PASSWORD-REVIEW-393 (17/11/2026)

- **Perfiles cerrados.** `storedProfile()` admite solo dos formas exactas, y las valida **antes de derivar**:
  - el formato anterior: exactamente `{salt, hash}`;
  - la v2: exactamente `{v: 2, N: 32768, r: 8, p: 1, salt, hash}`;
  - en las dos, la sal es base64 de 16 bytes y el hash de 32.
- Cualquier otra cosa se rechaza sin llegar a scrypt: versión desconocida, parámetros alterados (aunque sean válidos), campos de más o base64 inválido. Así el coste máximo del verificador lo fijan los perfiles admitidos.
- `verifyPassword` **nunca lanza**: si el algoritmo rechazara algo, el resultado es `ok: false`. El endpoint responde **401** sin cookie de sesión y sin escribir.
- **Pruebas 5/5** (32/32 con las de acceso):
  - 13 registros dañados o alterados, incluidos N=3 (que scrypt rechaza), N=16384 con v2 y v=3 con la derivación correcta;
  - el endpoint con un registro v2 dañado: 401, sin `set-cookie`, registro intacto.

  La migración transparente del formato anterior sigue cubierta. `tsc` 0.
