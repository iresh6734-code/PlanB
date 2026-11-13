# Reproducción independiente de una carrera de recuperación · 150

3/11/2026, Europe/Madrid. Resultado: **reproducida una causa posible del `EEXIST` observado en la QA 136 de rescate**, sin demostrar que sea el intercalado exacto de aquella ejecución ni que se haya creado un segundo destino.

## Escenario

En la versión R2 congelada de `server/rescue-capsule.ts`, SHA-256 `4787016b9c635070799f2b77911c831a3bb8fba6e5780ed936aa7174216a93a8`, la recuperación de un reclamo huérfano sin destino publicado ejecuta `unlinkSync(claim); take()`. La exclusión `.takeover` impide a otro recuperador tomar esa exclusión, pero la adquisición inicial de un reclamo nuevo se intenta antes de consultar esa exclusión.

Se ha insertado **solo en una proyección temporal**, no en las fuentes reservadas, un punto de barrera entre esas dos operaciones. Dos procesos reales comparten los archivos ficticios de una cápsula:

1. El recuperador adquiere la exclusión, verifica que el destino anterior está ausente y elimina el reclamo huérfano; queda retenido en la barrera.
2. El segundo proceso encuentra el reclamo ausente, lo crea y publica el destino. El reclamo confirmado apunta a ese destino.
3. Al liberar la barrera, el recuperador intenta crear el reclamo y recibe `EEXIST` sin convertir. En este ensayo no publica un destino adicional.

La instrumentación altera la temporización de forma intencionada para forzar el intercalado; el contenido y las operaciones de R2 se conservan salvo el punto de espera. La prueba verifica el reclamo final y el marcador publicado del ganador; no es una auditoría completa de todos los intercalados ni comprueba otros sistemas operativos o equipos. La prueba histórica anterior 24/25 no capturó un log que pruebe que esta fuera exactamente la secuencia de su ronda 16.

## Repetición

Prueba de caracterización: `tests/independent-rescue-recovery-race.test.ts`. Solo se ejecuta cuando se indica explícitamente una proyección R2 compatible mediante `PLANB_RESCUE_R2_BASELINE`; valida el hash antes de instrumentar y se omite por defecto, ya que espera el comportamiento histórico defectuoso. En esta ejecución se usó `tests/.tmp/rescue136-ev-16c77246-14b8-4bb9-8eac-4bcb61537d78/pqa` como entrada y se creó una proyección propia nueva.

Resultado: **1/1**, `recovering:EEXIST`, `arriving:imported`, reclamo concordante y marcador publicado. Red externa bloqueada mediante `scripts/block-external.cjs`. Evidencia temporal preservada en `tests/.tmp/independent-rescue-race-2cccc783-913d-4c5e-989c-d5d35cb7ebdb`; no se retiraron carpetas ajenas. Una ejecución sin la variable produce 1 omitida, no una validación de la versión actual.

La comprobación de tipos dirigida a esta prueba pasó con opciones estrictas. Se inició `npx tsc --noEmit` para todo el checkout, pero se interrumpió por duración sin resultado; no se afirma que la compilación global haya pasado en este corte.

## Seguimiento

`CLAUDE-RESCUE-KIT-116` está en `working` bajo la reserva del autor. El resultado debe servir para revisar el contrato de la recuperación y la interacción entre un importador nuevo y una recuperación en curso. Una corrección debe volver a contrastarse frente a los hashes que efectivamente se presenten y con pruebas de producto propias de esa versión. No debe afirmarse que esta prueba verifica esa corrección. No se han tocado los archivos de 116 ni de la QA 136.
