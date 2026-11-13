# 284 · Resumen del trabajo local integrado en Continuidad

8/11/2026, Europe/Madrid. Autor Codex de este chat. Presentación para revisión independiente. La demo 4601 conserva todavía su corte 279.

## Comportamiento

El `main` normal registra una vez el lector 283 con `covers: () => false`: A4 aún no aporta evidencia de cobertura. Una copia activa muestra «Sin cobertura: se desconoce», con cifras nulas. No se anuncia que no haya trabajo pendiente.

ContinuityHome monta la tarjeta 255 y entrega su misma lectura a `ContinuityHub.extra.work`; el pasaporte no inicia una consulta duplicada. La tarjeta activa espera el pin canónico publicado por la evidencia autorizada. El Hub comunica ese pin mediante un callback y lo retira al actualizar la lectura o cambiar su identidad. El propietario de la tarjeta incluye la revisión del espacio y el estado de la copia; resultados de otro propietario se descartan antes de alimentar el Hub. Un resumen de otra captura no aporta cifras actuales ni descarga.

Se conserva la identidad completa previa del Hub, incluida conexión y sesión. No se separan ni relajan sus invalidaciones. No se modifica App, LocalOperations, el escritor A4, contratos centrales ni estilos globales.

## Verificación del montaje real

Corte `tests/.tmp/mount284-q1kkk5`, fuentes fijas de backend 277 y UI 279 con 255/283 aceptados y las cuatro rutas de código de 284. Las huellas del corte y del checkout coincidían al terminar. El tipo focal de main, Home, Hub y la especificación sale limpio.

**8/8 E2E**, sin omisiones ni reintentos, 45,64 s. App compilada con Vite y React de producción comprobado en el bundle; servidor compilado directamente desde main sin insertar registros de prueba. Instalación, clave, SQLite y puerto son nuevos y ficticios. El servidor usa modo de prueba únicamente para esa clave. No se usa 4601 ni una instalación anterior.

Los casos prueban:

- Registro único, 401 real sin sesión y 200 con sesión; `no-store`, soporte de archivo real y cobertura ausente con cifras nulas.
- Una GET inicial del resumen compartida con el pasaporte; solo una más al pulsar «Leer de nuevo», sin sondeo propio.
- Cero consultas del resumen antes de liberar la evidencia; comparación exacta entre su pin y el del resumen.
- Resumen de otra captura con cifras ficticias: no se acreditan en tarjeta o pasaporte.
- Respuesta tardía después de releer evidencia, con transporte que ignora AbortSignal. Se espera la llegada de ambas respuestas y un cuadro de render antes de comprobar que las cifras antiguas no aparecen.
- 401/404/503 de transporte simulados: estados distintos, sin cifras inventadas.
- Descarga JSON manual menor de 8 KiB, sin campos privados, teclado y ausencia de desbordamiento a 320 px.

Todos los casos comprueban digest canónico de todas las tablas SQLite igual antes/después, cero peticiones modificadoras del navegador, cero tráfico externo y cero errores de página. La configuración ficticia de contraseña se realiza antes de cada frontera de digest. Se abrió e inspeccionó `summary-320.png`. Hay recibo de cierre del servidor; CIM posterior limitado a la raíz propia no encontró procesos vivos.

El Kit físico no está en esta instalación del banco nuevo: su ruta ausente sigue siendo 404. No se afirma un ensayo de relevo desde este main con Kit instalado por esta prueba.

## Regresiones existentes

En `regression-UirJIW`, sobre los mismos cuatro archivos de código:

- **16/16 Node** de `continuity-hub.test.ts` y `work-summary.test.ts`.
- **22/22 E2E** de las especificaciones existentes del Hub y de la tarjeta, sin modificar sus aserciones. Incluyen publicación parcial, identidad, bloqueo, caducidad, respuesta tardía, cancelación, descargas, móvil y un ensayo con Kit real desde el arnés del Hub.

Estas 22 pruebas son arneses de componente sobre APIs reales o respuestas controladas según su especificación; no se convierten en 22 recorridos de main. Se distinguen de los ocho casos nuevos. Las cuatro pruebas existentes se copiaron por sus huellas aceptadas y no se editaron en el checkout.

## Sensibilidad del vínculo con la copia

Dos mutaciones en la proyección privada `causal-Wghiyw`, ambas restauradas al terminar:

| Mutación | Fallo observado |
| --- | --- |
| Retirar el pin esperado de la tarjeta | Falla la sonda de otra captura: muestra 91 borradores ficticios en vez de retirar esa información. |
| Permitir la tarjeta antes de la evidencia | Falla la barrera que exige esperar la referencia autorizada. |

Las mismas sondas pasan con los archivos presentados en el banco 8/8. Los recibos conservan los fallos y todas las huellas de la proyección se restituyeron. Ninguna mutación tocó el checkout o la demo.

## Dos preparaciones con React de desarrollo

`mount284-Lw8ssD` y `mount284-pIeeHt` conservan 5/8 cada una. El arnés dejaba `NODE_ENV=test` durante Vite y el bundle contenía `react-dom-client.development.js`; StrictMode duplicaba los efectos y las lecturas. La primera atribución a cambios de conexión era incorrecta. Se retiró la separación especulativa de identidades que se había probado; no forma parte de esta entrega.

El arnés final fija producción solo durante la compilación del cliente, comprueba la ausencia del runtime React de desarrollo y restaura el modo de prueba antes de sembrar datos. Se mantienen las aserciones de una lectura de trabajo, pin exacto y descarte de respuestas antiguas. La espera de evidencia admite las lecturas legítimas del Hub, pero exige cero consultas de trabajo antes del pin y una después. Las lecturas abortadas del ciclo de desarrollo no se presentan como una regresión de seguridad ni como un pase de producción.

## Límites y siguiente paso

Montaje de código y compilación aislada comprobados; no se actualizó 4601 ni un ZIP. No hay autoaceptación. El seguimiento duradero A4, su política de cobertura, Jornada y Radar siguen en sus encargos. Tras aceptar estos cinco hashes, una unidad separada podrá componer y verificar una actualización de la demo y del paquete, conservando datos, identidad y evidencia anterior.

Browser plugin not available: se usó Playwright del proyecto con Chromium de caché y contexto aislado. No hubo proveedores reales, credenciales externas, cambios de dependencias, root build/dist, worktrees, commits ni despliegue.
