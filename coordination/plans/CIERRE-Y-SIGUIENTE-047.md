# Plan B · Cierre comprobado y siguiente entrega

30/10/2026, Europe/Madrid. Inventario de Codex solicitado por el usuario. **No está todo cerrado.** Se distingue entrega comprobada, trabajo reservado, backlog, instalación y pasos humanos. Este documento no reabre tareas ni libera archivos por su antigüedad.

## Lo contrastado y aceptado ahora

| Entrega | Evidencia | Estado |
| --- | --- | --- |
| QA042 / QA045 | Informes y hashes cotejados; reproducción propia de33 casos sinTODO sobre versión QA045 | done |
| OPS039 radar / DIFF040 comparador | Revisión independiente de Claude, regresiones Unicode,63 focales y pruebas API; incluidas en candidata | done, código aceptado |
| TEXT044 | Corrección y hashes contrastados por QA045 | done |
| UI028 / UI031 | Empresa y navegación CRM: recorridos de navegador sobre candidata, prueba de ida/vuelta y3 pruebas del iniciador | done, fuente aceptada |
| UX038 iteración5 |20 hashes cotejados; typecheck/build nuevo,162/162 Node y18/18 recorridos propios sobre candidata nueva | done, fuente aceptada; no despliegue propio |
| UX032 R2 |11 hashes cotejados;73/73 propias y sensibilidad12/13 (solo falla nº13 con defecto temporal); typecheck completo | done el30/10 a09:51 Europe/Madrid |

La aprobación de fuente no acredita instalación actual ni conexión real a proveedores.

## Pendientes que impiden decir «todo terminado»

| Pendiente | Responsable / condición | Tratamiento |
| --- | --- | --- |
| REL033 parser de activos | Otro encargo Codex working y con reserva | Corregir falsos positivos de src/data-src en sus archivos. REL046 no usa ese parser para dar una entrega por íntegra. |
| UX034: foco/operaciones de ficha | ready; UX038 aceptada libera customer-dossier.css | Consultar reservas de nuevo antes del claim; probar foco real y duplicados. No iniciar dos unidades en la misma sesión o competir por navegador. |
| LAB035 / BACKUP041 | Fuentes/informes presentados, sin aprobación integral de la unidad | LAB035 motor tiene revisión favorable; memoria/panel/plan quedan fuera de QA042. BACKUP041 requiere su revisión de alcance; no autoaceptar para borrar cola. |
| REL046 candidata | Compilación y pruebas de snapshot; revisión/aprobación/instalación separadas | Mantener runtime aislado. No sustituir pilotos con una versión working o supersedida. |
| Historial de informes en review | AUDIT025, HS025-REVIEW, CONT026-REVIEW, PLAN032, UX032-REVIEW, REL033-REVIEW, CONT030-REVIEW, PLAN034, COORD043 | Revisiones documentales pendientes de aceptación. No implican que sus productos se hayan roto ni autorizan repetir servicios o descartar entregas. |

Las listas son un corte del tablero del30/10. Consultar estados/hashes antes de actuar; no suponer que continúan idénticos.

## Backlog que no se ejecuta como «limpieza»

- HS029: búsqueda acotada de actividad y recencia, pendiente de implementación. El contrato público HS025 ya está aceptado; no equivale a API autenticada probada.
- LAB036: demo visual del laboratorio, dependiente de aceptación LAB035. No se implementa al mismo tiempo que otro dueño sobre sus archivos.
- Antiguos prototipos CLAUDE003/005 y encargos conceptuales HS006/ARCH007: conservar trazabilidad, decidir vigencia antes de duplicar trabajo.
- CODEX001 / MCP001: una entrada antigua ready no autoriza conexiones, herramientas, MCP o envío adicional a proveedor. No ejecutar por antigüedad.
- Las fases0.5/0.6/0.7 no se declaran completas por una batería de pruebas o un rediseño.

## Pasos externos/humanos separados

Credencial propia de lectura del portal personal149623262, consentimiento Picker y las aceptaciones remotas pendientes conservan su alcance protegido. Ninguna prueba local acredita acceso actual a esos servicios. No pedir secretos por chat ni recuperar equipos/credenciales corporativos. Google real, correos, eventos, Docs/Sheets e IA de proveedor no se activan por este plan.

La demo de equipo, el CRM completo y el piloto personal mantienen bases y sesiones separadas. El hecho de enlazarlos no las sincroniza. No prometer continuidad de modelos o scheduler sin comprobar su disponibilidad.

## Candidata y retorno

REL046 prepara una carpeta nueva de fuentes/runtime con hashes, typecheck, frontend, seis bundles y activos públicos cotejados. Copia código y estáticos de las dos instalaciones a un respaldo provisional, sin datos, claves o sesiones. Antes de instalar hay que cotejar otra vez ese baseline: otro chat puede haber publicado después y el respaldo antiguo no debe pisar esa publicación.

Las pruebas se hacen con datos ficticios nuevos, puertos4377/4381 y navegador headless propio, en serie. No ejecutar npm run build sobre build/dist de raíz. No sustituir una instalación mientras su fuente relevante esté working. El paso de publicación se registra como una unidad concreta después de revisión, con respaldo actual, comprobación servida y vuelta atrás.

Candidata iteración4: candidate-da6b0c9c-916f-4785-a351-b948e7e661e4,162Node+33QA+3iniciador+33recorridos de navegador+1smokeHTTP. Nueva candidata iteración5: candidate-930ea988-d863-4a9d-a821-03e8a3754f8d,162Node+18recorridos de navegador. Ambos snapshots en tests/.tmp/release-candidates, con resultados separados. No sumarlos como casos únicos ni afirmar que el nuevo ejecutó todas las suites del anterior. Informe coordination/reports/CODEX-REL-046.md. La afirmación de otro autor sobre despliegue de iteración4 no se verificó contra servicio real en esta sesión.

## Siguiente cosa visible: CLAUDE-OPS-048

UX032 R2 y UX038 iteración5 ya aceptadas: **la puerta de dependencias está abierta**. OPS048ready, seis archivos sin reservas en el cotejo del30/10 a09:51 Europe/Madrid; Codex no ha tomado la unidad. Una única sesión Claude puede consultar/reservar y convertir las APIs aceptadas en un bloque de **operaciones de la copia** en Continuidad del CRM completo:

1. Qué tareas atender ahora, con horizonte, motivos y siguiente paso.
2. Qué cambió entre dos capturas guardadas: datos, esquema y relaciones separados, sin inferir borrados remotos.

Seis archivos exactos, sin editar App/TeamApp, estilos globales, servidor o contratos. Encargo registrado, dependencias expresas; el claim debe esperar si no están done. Brief en coordination/briefs/CLAUDE-MEGA-047.md. La ficha UX034 puede desarrollarse como unidad separada solo cuando libere sus archivos y se coordine una única ventana E2E.

No se incorporan en esta unidad envío automático, IA nueva, multiusuario, sincronización general, backend del piloto o laboratorio con evidencias inventadas. La potencia de esta entrega es usar en una pantalla los datos y capacidades que ya tienen contratos comprobados.
