# 267 · Dictamen R4 favorable para relevo 216

7/11/2026, 10:48:50, Europe/Madrid. Se acepta la presentación R4 de las cinco rutas. Se mantiene a continuación la devolución histórica de R3; ya no describe el dictamen vigente.

## Evidencia actual

Se cotejaron las cinco huellas presentadas con el tablón, los archivos actuales y la proyección privada restaurada. En tests/.tmp/relay216-r4-full-g3aLsb/exact.log pasan 53/53 sin saltos ni cancelaciones, con Kit real, exclusión, revocación, cierre y las sondas independientes POST/GET/DELETE. Typecheck focal limpio (types.log, código 0). La revisión del código confirma autorización original capturada y revalidada tras preparar el cuerpo en GET y DELETE, incluidos 422/403. DELETE autorizado conserva la petición de parada aunque su respuesta posterior ya no pueda entregarse.

La contraprueba cambia únicamente la API en la copia privada por la R3 previamente cotejada. Baseline: 2/4; los dos POST corregidos siguen pasando y GET/DELETE fallan exactamente con 200 frente al 401 esperado. Se restituyeron los bytes R4 y las cinco huellas antes de escribir result.json. La espera anterior perdió su handle, pero este recibo final y los logs acreditan terminación; no se reinició el ensayo.

## Alcance y pendiente

Aceptación del módulo y su banco, no de un montaje de App ni del ZIP final. La caducidad usa barreras de reloj/almacenamiento, no medición de sesión real en paquete. 254 R2 tiene presentación separada y requiere dictamen propio antes del montaje. No se tocaron sus reservas, instalaciones históricas ni datos de proveedores.

## Huellas aceptadas

- shared/relay-rehearsal.ts: f0839c039e0fd3b36c2e45f500a84dc0b1df6621a874f6606710c0bd64392e43
- server/relay-rehearsal-api.ts: 2f800e46fcbdbfe660c5608527348d71a62f3eb98a520050ad0c92ea325d0a1d
- tests/relay-rehearsal.test.ts: 8d782bf0bf688e55da979d8d7806057a8c8f830d50ba82889ec9577096fd2ccb
- coordination/reports/CLAUDE-RELAY-REHEARSAL-216.md: 123bacbaa175a412ed76a60b9ee60b93889102dc486f7025535f738e4c06eaac
- coordination/plans/RELAY-REHEARSAL-216-HANDOFF.md: dfedfee3d3ff37e45ccc59e6e1f9fe61746f84430d6dbb3ccc5808eda68284d2

---

# 267 · Revisión independiente de relevo 216 R3

6 de noviembre de 2026, Europe/Madrid. **Devolver para R4 con las cinco reservas.** R3 corrige los dos hallazgos de POST de la revisión 258. GET y DELETE todavía pueden entregar el último resultado después de que venza la sesión que inició la petición.

## Reproducción

Con Fastify real y una base ficticia en memoria, se guarda primero un resultado mediante un POST autorizado. GET y DELETE leen ese resultado con la sesión vigente. Se repite cada ruta con una barrera que avanza el reloj de la sesión durante `store.load()`. En ambos casos R3 devuelve 200 y un cuerpo con el estado del ensayo. Un GET posterior confirma 401 con la misma cookie. La copia debe conservar el último registro válido y devolver 401 con un cuerpo de error sin estado. El registro que aparece en esta prueba es ficticio. La API queda fuera de la candidata 263.

Las rutas GET y DELETE se apoyan en la verificación previa de la App. Sus caminos de respuesta preparan `state()` sin la comprobación posterior que R3 incorporó a POST. También debe pasar por la misma frontera la respuesta de DELETE con origen rechazado, ya que incluye estado.

## Evidencia y contraste

Las cinco huellas de R3 coinciden con el tablón y la proyección de prueba. En `tests/.tmp/relay216-r3-full-tuO1jS/exact.log` pasan 46 de 48, incluidas las dos regresiones 258, los controles R3, la exclusión, la cancelación y los ensayos con el Kit real. Los dos fallos nuevos son `200 !== 401`. El typecheck focal de R3 sale limpio. Se descartó una ejecución preliminar que omitió la unión de dependencias requerida por el Kit.

La propuesta privada captura la autorización original en ambas rutas, comprueba antes de operar y vuelve a comprobar después de preparar el cuerpo. `causal.log` da 48 de 48 con la misma suite. Se restauró el archivo R3 en esa copia y se cotejaron las cinco huellas. El banco usa inyección de reloj y almacenamiento para la caducidad. Falta repetir el montaje en la app y en el paquete portátil una vez aceptado el contrato de rutas.
