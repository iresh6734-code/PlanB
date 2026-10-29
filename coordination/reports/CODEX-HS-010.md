# CODEX-HS-010 · Ficha parcial ante detalles no disponibles

29/10/2026, Europe/Madrid. Parte acotada de H5, después de la revisión y aceptación de HS007. Autor Codex; revisión de un subagente Codex distinto. No se envían fuentes nuevas a Claude ni se repiten consultas conceptuales resueltas.

## Comportamiento

Solo un 404 de detalle de actividad o propietario se considera una omisión permitida. La ficha conserva el contacto y los demás detalles, mantiene partial:true y explica el número de actividades no disponibles o la ausencia del propietario asociado. ownerPermission sigue describiendo el permiso de la conexión, no la existencia del propietario. No se inventa nombre ni se interpreta la ausencia como falta de autorización.

El 404 del contacto principal sigue rechazando la ficha. 401, 403, 429, 5xx, errores de transporte, JSON inválido y cuerpos 200 que no sean objetos continúan rechazándose. No se incluyen mensajes remotos sensibles en errores AppError. No hay reintento ni sustitución de cupos omitidos por más lecturas; se conservan ocho detalles y dos por tipo, GET, destino, redirect:error e identidad comprobada antes de cada GET y al final.

Un símbolo local distingue exclusivamente el 404 opcional de un cuerpo JSON null u otra respuesta. Si la conexión cambia durante un 404, la comprobación siguiente o final descarta la salida con 409; tampoco se ignora el cambio al tratar el último propietario.

## Hallazgo de revisión corregido

El revisor reprodujo que owner200null se devolvía como owner:null sin aviso y sin fallar, a diferencia del detalle de actividad. Se añadió una guarda mínima de objeto no nulo/no array en el helper GET, también para contacto. La nueva prueba cubre null, array, número y string en las tres rutas. No se presenta esta guarda como validación exhaustiva de todos los campos de HubSpot.

## Evidencia

Antes del cambio, las siete pruebas iniciales tenían tres controles correctos y cuatro fallos esperados: detalles/propietario404 y la identidad durante404 aún abortaban de forma genérica. Sobre la versión final: **49/49 pruebas afectadas y typecheck correctos**. Ocho pruebas focales incluyen doce combinaciones de formas 200 inválidas. El revisor ejecutó también 8/8 focales y reprodujo owner200null antes de la corrección; la batería49 y typecheck son del autor.

Comandos:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-partial.test.ts tests/hubspot-context-sampling.test.ts tests/hubspot-context-isolation.test.ts tests/hubspot-oauth-refresh.test.ts tests/commercial.test.ts
    node node_modules/typescript/bin/tsc --noEmit

Los casos cubren omisión única/todas, vacío sin omisiones, permiso de propietarios conservado, error principal404, fallos de autorización/proveedor/límite, JSON/transporte, desconexión durante detalle o último propietario y formas mal construidas. Son pruebas PGlite con transporte sintético y red externa bloqueada; no añaden registros al piloto o llamadas CRM reales.

## Límites y siguiente paso

Es una tolerancia estrecha a objetos no disponibles; no completa todo H5. Plazo global y reintentos429 siguen pendientes, igual que recencia real/paginación de H4. Cada petición conserva su timeout previo de12s, por lo que la fase completa todavía puede acumular esperas largas. CODEX-HS-011 prepara un presupuesto común de red y cuerpoJSON sin prolongarlo por actividad. No hay cancelación de base de datos o revocación atómica de respuesta HTTP acreditada.

No hay QA visual, conexiónAPI personal, despliegue, reinicio, credenciales o datos reales. No se tocan captura/runner reservados por otros encargos. Las observaciones de otros informes sobre sesiones Claude o trabajos paralelos se conservan como comunicadas por sus autores, sin inspeccionar cuentas o ventanas.

## Hashes finales

- server/team/oauth.ts: 3d5f3f54b594edb9214e2fd7a8a20e4fbc378af5888ea190698b12774d4b7ed0

- tests/hubspot-context-partial.test.ts: 2c3782efcdc919f60d665ed46a045e2878627be643264c5e7086898c3bd44819
