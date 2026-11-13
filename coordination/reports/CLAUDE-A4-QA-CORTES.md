# CLAUDE-A4-QA-CORTES-V2 · guion y sondas de los cuatro cortes de A4

Autor: Claude A. Dos archivos: `tests/e2e/hoy-trabajo-por-recuperar-cortes.spec.ts` y este informe. Sin producto. Sustituye el registro `CLAUDE-A4-QA-CORTES` (bloqueado por una dependencia que el QA no necesita). **No acredita A4**: A4 no existe; esto congela el guion y localiza el primer paso que falta.

## Qué hace

Cuatro sondas con servidor real, SQLite de archivo, reinicio con PID distinto y cierre de procesos del arnés 293 (sin excepciones propias). Cada una ejecuta lo que el producto actual permite y **comprueba los efectos** (PATCH recibidos por el servidor, filas del ID exacto `task-2`, homónima `task-3` intacta) y después se detiene en una barrera que nombra el **primer paso ausente**: `GET /api/v7/task-intents` responde 404 (propuesta A4 sin montar). Lo escrito tras la barrera es el resultado exigido cuando exista.

| Corte | PATCH | Filas task-2 | Tras reiniciar (cuando exista A4) |
| --- | --- | --- | --- |
| 1 falla persistir | 0 | 0 | borrador en la ficha; «sin enviar»; 0 PATCH |
| 2 reinicio antes de aplicar | 0 | 0 | intento exacto INCIERTO; comprobar lee «sin cambio»; +0 |
| 3 acuse perdido tras aplicar | 1 | 1 | intento exacto incierto; comprobar lee «aplicado»; +0 |
| 4 falla la liquidación | 1 | 1 | sigue incierto (P4), no «confirmado»; comprobar lee «aplicado»; +0 |

## Resultado hoy (3 ejecuciones; la primera tuvo un fallo de copia del arnés por un archivo ajeno que cambiaba durante la copia, no de producto)

Las 4 sondas **pasan su parte ejecutable y fallan en su barrera** con «FUNCIÓN AUSENTE (primer paso): …»: escritor del diario (corte 1), diario durable (2 y 3) y liquidación `settle` (4). Estable en dos ejecuciones completas.

## Ganchos que Codex debe ofrecer al servidor de prueba para completarlas

- Fallo de persistencia del intento (p. ej. `HOY_FAIL_INTENT_PERSIST=1`) y de la liquidación (`HOY_FAIL_INTENT_SETTLE=1`), ambos **antes** de escribir, para que el arnés los cuente como petición sin efecto.
- Rutas y esquemas acordados: si difieren de la propuesta, se cambia solo la constante `INTENTS`.
- La confirmación debe poder atribuirse al servidor: un `settle` declarado por el navegador no prueba que se aplicó.

## Límites

Las aserciones posteriores a la barrera no se han ejecutado nunca y pueden necesitar ajustes (textos, nombres de botones) cuando exista la superficie. No toca 240; sus dos sondas A4 siguen rojas.

## Huella

| Archivo | SHA-256 |
| --- | --- |
| `tests/e2e/hoy-trabajo-por-recuperar-cortes.spec.ts` | `cf451a4bdd52dcf6f1eb92af469ea4f11e591018c05d3c3bf7143488ce0473bc` |
