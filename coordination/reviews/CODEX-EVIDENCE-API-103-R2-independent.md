# Dictamen independiente 252 · API de evidencia 103 R2

6 de noviembre de 2026, Europe/Madrid. **Devolver a `working` con las mismas reservas.** Las cuatro huellas R2 coinciden con el tablón. Se usaron los bytes presentados de 245 y los del servicio 101 que se revisaron en 244.

## F2 · La última lectura de identidad ocurre después de verificar la sesión

El caso F1 de 244 pasa. Al vencer la sesión durante el cálculo, R2 devuelve 401 sin hechos ni renovación. En cambio, `server/continuity-evidence-api.ts` revalida el permiso y después llama a `instance(store)`. La sonda usa Fastify y SQLite reales y un reloj controlado que cruza el vencimiento en la segunda lectura de `instanceId`. El control sin ese avance da 200. Con el avance, la lectura todavía da 200 y la consulta inmediata con la misma cookie da 401. No se cambió de instalación ni se simuló un cambio de permisos antes de ese último acceso. Se reproduce una frontera de expiración, sin afirmar que se haya medido una latencia real de disco.

En el corte causal privado se lee primero el ID final y se revalida la autorización original después, antes de publicar errores de contexto o hechos. Pasan la sonda nueva y los otros cuatro controles independientes. Mantener rechazo temprano, 401 sin datos cuando coincide caducidad con otro error, `no-store`, `Vary: Cookie`, cero renovación y rechazo de cambios de identidad. El montaje 239 espera un dictamen favorable y los bytes aceptados de 101.

## Evidencia

- 21/22 en corte focal, con F2 como único fallo. En el corte ampliado, 77/79. El segundo fallo es el conocido de 101 sobre comprobaciones de simulacro duplicadas. Pasan la sonda anterior de archivo incoherente y pin, el aislamiento entre instancias y la caducidad original. Typecheck focal limpio.
- `tests/.tmp/review252-4ag7R3/auth/independent-252.test.ts` y `review252-final-identity.log` reproducen `200 !== 401`. El control corregido queda en `auth-causal/review252-causal-rerun.log`, 5/5. Los archivos originales presentados se conservan intactos.
- La primera ejecución de la proyección omitió el paquete que importa `shared/version.ts`. Se completó el corte y se repitió. El primer arnés de aislamiento se corrigió para comparar la autorización y no la referencia JavaScript de una función ligada. No se probaron instalación, tráfico externo ni navegador.
