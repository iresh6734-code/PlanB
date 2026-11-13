# Revisión independiente · arranque 090

4/11/2026, Europe/Madrid. **Dictamen vigente: aceptar R2**. El dictamen anterior devolvió la entrega únicamente para robustecer la espera del banco de fuentes; no se detectó un defecto en la guarda de integridad revisada.

## Revisión R2

Se cotejaron los tres hashes de la nueva presentación. Runtime permanece en `b1324021f93ba8be9bf9acce5d5067e5ecd5c7db5af8559b71668b53f77b4ca5`; cambia el banco y su informe. Se leyó la espera con plazo30s, probes300ms y detección de salida, los diagnósticos y el cierre por evento `close` con plazo10s. El banco usa claves ficticias nuevas precreadas y `NODE_ENV=test` para evitar depender deDPAPI en estas fixtures. Las aserciones de datos conservan sus condiciones.

Repetición propia del banco corregido: **3/3 por fuentes** y **3/3 por los ejecutables** que este revisor había compilado del mismo runtime/main sin cambios. Son los mismos tres casos en dos formatos. Logs `tests/.tmp/review163-r2-source.log` y `tests/.tmp/review163-r2-compiled.log`. El control causal anterior sin guarda sigue acreditado por el fallo409 descrito abajo; no se repitió ese mutante paraR2 porque la fuente del runtime no cambió. No se activa160 al aceptar090 y no se certifica una distribución completa.

## Evidencia propia

Se leyó `runtime.ts`: un plan inválido con snapshot ausente impide restaurar automáticamente la semilla y permite iniciar el servidor para consultar el diagnóstico. Se conserva la exclusión de escritor antes de abrir Store. No se han modificado estas fuentes ni las de main, que pertenece a 074.

- Banco original por fuentes, primera ejecución: **2/3**, falla main por no responder dentro del bucle de 50 pausas de 100 ms. Log `tests/.tmp/review163-bootstrap.log`; `case-mrNQST/bootstrap.log` solo contenía el aviso SQLite, sin error causal de aplicación.
- Segunda ejecución original por fuentes: **1/3**, main y runtime corruptos no acreditaron salud dentro del mismo plazo. Log `tests/.tmp/review163-bootstrap-repeat.log`. No se cuentan como éxitos ni se atribuye su causa al producto sin contraste.
- Se compilaron ejecutables nuevos desde las fuentes actuales, con paquetes externos: **3/3** casos pasan sin cambiar pruebas. Log `tests/.tmp/review163-compiled-good.log` y artefactos propios `tests/.tmp/review163-compiled/good`.
- Control causal privado: se recompiló solo runtime eliminando la condición de integridad del arranque. El caso corrupto falla por ausencia de salud; su log muestra `Store.restoreBundle` lanzando `AppError` 409, `RECOVERY_PLAN_INVALID`, antes de iniciar. Log `tests/.tmp/review163-mutant.log`, artefacto privado en `review163-compiled/mutant`, caso `bootstrap090/case-ks9KcN`. No se modificaron fuentes del checkout.
- Copia privada del banco de fuentes, alterando únicamente el máximo de vueltas de 50 a 300 (hasta unos 30 segundos, manteniendo aserciones): **3/3**, main corrupto, runtime corrupto y runtime normal. Log `tests/.tmp/review163-long-wait.log`. Los casos duraron aproximadamente 19,0/12,9/8,9 segundos incluyendo preparación. Eso demuestra que el plazo corto puede rechazar un arranque correcto en este entorno; no es una medida garantizada de tiempo de recuperación.

Las pruebas usaron raíces, bases y claves ficticias nuevas, HTML mínimo, procesos hijos propios y red externa bloqueada. No se conectó a previews o instalaciones anteriores. La disponibilidad HTML/API de este banco no es una prueba visual de la App.

## Corrección solicitada

En la reserva de 090, cambiar la espera de arranque por un plazo suficientemente acotado y sensible a salida del hijo, conservando las aserciones de plan intacto, registros vacíos, diagnóstico inválido y restauración normal. Mantener logs y cierre del proceso propio ante fallo. Repetir fuente y compilado y declarar las incidencias previas. La copia privada solo varió el plazo y sirve de contraste; no es una entrega corregida del autor. No aprobar 090 únicamente para liberar `runtime.ts`.

074 y su main requieren revisión separada, y 160 sigue pendiente de revisión ajena. Esta revisión no activa revisiones de tareas ni acredita una distribución completa o datos reales.
