# Regresiones de Hoy sobre guardado condicionado

7/11/2026, Europe/Madrid. Autor: este chat Codex. Unidad `CODEX-HOY-REVISED-FLOW-TESTS`, presentada para revisión independiente. No cambia código de producto.

## Cambio

Las pruebas de D7 y reapertura del intento seguían preparando el servidor y reteniendo respuestas del PATCH anterior. Tras aceptar A2, la ficha usa la estrategia de revisión. Ambos servidores de prueba habilitan ahora `taskRevisions: true`; las retenciones y respuestas simuladas usan `/api/v7/task-revision/:id`. Las barreras anteriores al despacho se sitúan en `GET /api/v2/state`, que es la lectura previa de la estrategia actual. Se conservan las aserciones sobre efectos, identidad de tarea, incertidumbre, cierre, bloqueo, recarga y foco.

Cada worker conserva su evidencia. Si una raíz explícita ya contiene fuentes congeladas, crea un subdirectorio nuevo en lugar de borrarlas o de impedir que arranque el siguiente worker después de un fallo. Se retiró el borrado recursivo inicial de las dos suites.

No se editó `tests/e2e/independent-task-mount.spec.ts`: continúa reservado por 142. El encargo conjunto anterior quedó bloqueado sin reserva cuando se rechazó su claim; este encargo solo incluye las dos rutas libres y este informe.

## Verificación

Una ejecución completa final, sin reintentos ni pruebas omitidas: **35/35**, 180,44 s. Son 24 casos de D7 y 11 de reapertura. Raíz `tests/.tmp/hoy-revised-flow-final-oTl913`, informe `playwright.json`, configuración `pw.config.mjs`; las copias congeladas y sus manifiestos están en `d7` y `reopen`.

```powershell
$run = Get-Content tests/.tmp/hoy-revised-flow-final-run.json -Raw | ConvertFrom-Json
$env:PLANB_U2_ROOT = Join-Path $run.root 'd7'
$env:PLANB_U219_ROOT = Join-Path $run.root 'reopen'
Remove-Item Env:PLANB_U2_PRE,Env:PLANB_U2_MUTATE,Env:PLANB_U2_DEV -ErrorAction SilentlyContinue
node --require ./scripts/block-external.cjs node_modules/@playwright/test/cli.js test --config $run.config
```

Al reproducir, usar otra raíz y otro `outputDir` para conservar los resultados. Chromium aislado, un worker, red exterior bloqueada, servidor real `createBaseApp` con SQLite en memoria y App compilada desde fuentes congeladas. No es el servidor `main` compilado ni la demo 4601. Los casos de pérdida del acuse aplican el PATCH en el servidor y retienen o pierden su respuesta en el navegador; otros errores se simulan antes de enviar. Los recuentos persistidos del Store distinguen esos casos.

Los interceptores de los casos de guardado ya exigen la ruta condicionada. El contador general del arnés cuenta todos los PATCH; no se añadió un contador global separado de rutas antiguas. La prueba específica de A2 que acredita cero PATCH legados conserva su evidencia independiente.

`node_modules/.bin/tsc.cmd --noEmit`: exit 0 en el checkout. No se ejecutó `npm test` completo. No se repitieron las contrapruebas históricas PRE ni las mutaciones opcionales, cuyos anclajes pueden requerir mantenimiento separado.

Se inspeccionaron las capturas finales `u2-incierto-1440`, `u2-aceptado-390` y `reopen-uncertain-320`. Las tres presentan los estados y acciones sin texto cortado horizontalmente. Las restantes capturas no se inspeccionaron en esta unidad. Las pruebas conservan teclado y geometría a 1440, 390 y 320 px.

## Intentos previos conservados

La primera ejecución, `tests/.tmp/hoy-revised-flow-ZwZCG2`, dio 18 aprobadas, 4 fallidas y 13 sin ejecutar. Faltaba migrar el interceptor dinámico de homónimas; una barrera esperaba la lectura de registro en lugar de la lectura de estado; y la prohibición de reutilizar una raíz con `frozen` impedía reiniciar el worker después de fallar. Se corrigieron esos elementos del arnés sin modificar las aserciones de producto. El resultado 35/35 corresponde a una ejecución nueva tras esas correcciones.

## Huellas de los dos archivos de prueba

| Archivo | SHA-256 final |
| --- | --- |
| `tests/e2e/task-d7-real-app.spec.ts` | `e38c480c0c07692c2826af23448c2ea808309667de38edc818e0e1c3e6b82b58` |
| `tests/e2e/task-attempt-reopen.spec.ts` | `d9a5c72f52e11b5d2b56984fc4cde1e301045dc7105db55ccd666b9d5e14966d` |

El seguimiento que se prueba sigue siendo de memoria. Esta entrega no monta Jornada, el diario 208 ni recuperación tras reiniciar el proceso. La App real necesita todavía esos montajes y el Radar; están inventariados en `OPERATIONS-CANDIDATE-MATRIX.md`.
