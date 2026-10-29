# Plan B · Análisis del proyecto

Revisión: 26/10/2026, Europe/Madrid. Fuente local: v0.3.0 y herramientas posteriores del ensayo de retorno. Este análisis distingue código inspeccionado, pruebas nuevas y evidencia histórica. No se han conectado servicios externos del CRM ni accedido al ordenador corporativo original.

## Diagnóstico

Plan B tiene una base funcional suficiente para preparar un piloto acotado. Todavía no tiene acreditadas la devolución auténtica de ensayo, la aceptación autónoma por una persona ajena al desarrollo ni la demanda comercial. La prioridad es demostrar continuidad y recuperación de principio a fin antes de ampliar módulos.

El producto útil es una copia operativa de un proceso comercial esencial, con fecha, alcance y recuperación demostrables. La generación con IA es secundaria: el recorrido de producción actual la bloquea y puede funcionar sin ella.

## Qué existe y qué está demostrado

| Área | Código actual | Evidencia y límite |
| --- | --- | --- |
| CRM local | Contactos, empresas, oportunidades, tareas, formularios, búsqueda y tablero | Pruebas de lógica/API; los recorridos Chrome anteriores están documentados en el contexto |
| Capturas | Cuenta y tipo verificados, paginación, campos seleccionados, cinco familias de relaciones, historial y retención | Captura auténtica de ensayo conciliada documentada; no se acredita aquí una captura de producción |
| Independencia | Runtime separado sin conectores; edición y registro de cambios locales | Simulacros aislados y aceptación de paquetes anteriores documentados |
| Protección | Valores cifrados con AES-GCM, clave Windows DPAPI, contraseña y sesión local, exportación cifrada | Pruebas actuales y aceptación Windows histórica de los ZIP identificados; no equivale a una auditoría de seguridad completa |
| Recuperación | Comparación de tres vías en ensayo, diario y estados inciertos; producción con aplicación manual y verificación de lectura | Motor probado con destinos controlados; devolución auténtica todavía pendiente |
| Operación | Capturas horarias y simulacro mensual con proceso abierto; diagnóstico descargable | Depende de PC encendido, sesión y proceso activo; sin monitor externo ni SLA |
| Comercial | Guía, página de agencias y propuesta de piloto | Sin ventas, renovaciones, tiempos humanos o margen observados |

Comprobaciones nuevas de esta tarea: `npm test`, **71/71 correctas**, y `npm run build`, correcto, con Node Windows 24.14.0. Dos sondeos adicionales por API en memoria reprodujeron los comportamientos descritos abajo. La repetición de navegador no avanzó hasta ejecutar los casos y se interrumpió; **no hay un nuevo resultado E2E aprobado**. Los 9/9 Chrome previos siguen siendo evidencia histórica, no una ejecución de este análisis. No se modificaron los ZIP definitivos ni las instalaciones operativas.

## Mejoras concretas, por prioridad

1. **Identificar exactamente qué se exporta y qué se ha custodiado.** `Continuity.capture()` añade una captura al historial; `Store.bundle()` exporta la captura del espacio activo. Reproducido: con una captura nueva B y espacio activo A, la exportación contiene A. Es una separación válida, pero la pantalla de exportación no identifica la captura/revisión y puede inducir a pensar que se conserva B. Además, `recoveryCopy.confirmedAt` permanece después de una edición local que aún no está exportada, también reproducido. Mostrar captura, fecha y cambios incluidos antes de descargar; vincular custodia a hash/revisión y avisar si hay datos posteriores. Criterio: ningún estado de custodia vigente para una revisión diferente sin indicarlo expresamente.

2. **Cerrar la recuperación completa.** Terminar el caso ficticio 6c85db4f mediante revisión de workflows, credencial temporal separada y aprobación del plan vivo. Registrar cuatro altas, cinco relaciones, dos actualizaciones, lectura final y no duplicación; revocar la credencial temporal. Después ensayar en otra carpeta, y con otra persona, restauración y trabajo local. El código y los mocks no sustituyen esas dos evidencias.

3. **Detectar fallos cuando nadie mira la pantalla.** Hoy el aviso de antigüedad vive dentro de la app. `scheduleError` se guarda, pero no forma parte del estado público de continuidad; los fallos anteriores al arranque de un trabajo no aparecen como un trabajo fallido. Añadir causa, último éxito/intento y siguiente acción. Más adelante, avisos optativos sin datos CRM y latido que permita detectar un PC/proceso apagado. Un proceso apagado no puede avisar de su propio fallo por sí solo. Criterio: provocar credencial rechazada, falta de red y proceso detenido y comprobar qué ve el responsable y cuándo.

4. **Explicitar la cobertura operativa.** No se preserva todo HubSpot: faltan adjuntos, correos, notas/actividad completa, propietarios en los campos básicos, cuerpo/tipo/recordatorios de tareas y otras familias de asociaciones. Se conservan enlaces, pero el formulario utiliza una referencia principal por familia y no reproduce toda la semántica/etiquetas del CRM. Priorizar solo lo que bloquee el proceso del primer cliente. Un informe debe decir qué proceso puede continuar, además del número de registros.

5. **Mejorar robustez de las capturas.** Los recuentos detectan omisiones, pero un cambio de valores o relaciones durante la paginación puede mantener el mismo total: no hay instantánea transaccional global. Registrar duración/ventana de captura y diferencias entre capturas; estudiar detección de modificaciones durante esa ventana. Los reintentos de lectura se limitan a tres y acotan Retry-After a cinco segundos; faltan clasificación de cuota diaria frente a límite temporal y un control de ritmo explícito. La documentación oficial distingue esos límites y recomienda limitar llamadas y usar lotes: https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines. No aplicar reintentos automáticos indiscriminados a escrituras inciertas.

6. **Consolidar mantenimiento y entrega.** `Store.page()` carga y descifra todos los registros para cada página, aunque la respuesta contenga 50. Las pruebas de 10.000 filas en memoria no miden el coste cifrado en disco de un PC modesto. Medir ese caso antes de ampliar el límite, y optimizar según resultados. Añadir CI reproducible para Windows/Node 24, separar rutas de conexión/recuperación/exportación de `server/v2.ts` cuando deban cambiar y centralizar estados operativos. No sustituir SQLite ni reescribir la app sin un problema medido.

7. **Unificar documentación vigente.** El inicio del contexto todavía enfatizaba v2.1; `COMERCIAL-V2.md` habla de producción bloqueada, mientras v0.3.0 admite lectura autorizada. Mantener versiones históricas identificadas y una entrada única hacia la documentación v0.3.0. No presentar guías antiguas como instrucciones actuales.

## Diferenciación y comercialización

HubSpot ya permite copias CRM externas en ZIP/CSV. Su documentación enumera más tipos de objeto que Plan B, e indica que ese backup no incluye asociaciones ni datos de actividad: https://knowledge.hubspot.com/object-settings/back-up-crm-data (consultada el 26/10/2026). Por tanto, la diferenciación propuesta es **seguir operando localmente con relaciones del alcance admitido y demostrar la recuperación**, no vender únicamente una exportación. Esto es una inferencia de producto, no demanda probada ni un estudio exhaustivo de competidores.

El límite de un operador debe aparecer en la venta: un cliente que necesite cinco comerciales trabajando simultáneamente queda fuera del piloto actual. Identificar primero una agencia y un proceso que pueda custodiar y operar un responsable designado.

199 EUR de preparación + 59 EUR/mes sigue siendo una hipótesis. Con un coste interno supuesto de 40 EUR/h, una hora mensual de soporte consume 40 de los 59 EUR antes de otros costes, impuestos y margen del canal. Medir tiempo de alta, soporte por portal y disposición a renovar antes de fijar el precio o prometer un servicio recurrente.

## Próximas funcionalidades propuestas

| Orden | Funcionalidad | Valor y aceptación propuesta |
| --- | --- | --- |
| 1 | Exportación con captura/revisión visible y custodia vinculada | Evitar conservar o dar por protegida una versión distinta; probar A activa/B reciente y edición posterior |
| 2 | Asistente de restauración comprobada | Restaurar archivo real del ensayo en carpeta nueva, comparar registros/cambios y emitir resultado vinculado al archivo |
| 3 | Resumen de preparación y causas de fallo | Mostrar copia reciente, prueba de esa copia, custodia de esa revisión y pendientes como estados separados |
| 4 | Comparador entre capturas | Altas, bajas observadas, cambios y relaciones; explicar aumentos/disminuciones sin borrar datos remotos |
| 5 | Avisos optativos y diagnóstico de funcionamiento | Avisar una vez por incidencia/cambio significativo; no enviar fichas ni secretos |
| 6 | Cobertura mínima del piloto | Añadir notas, detalles de tarea o propietario solo si entrevistas y ejercicio operativo demuestran que son imprescindibles |
| 7 | Resumen para agencias sin fichas | Compartir estado y evidencia de cada instalación; comenzar con informe exportable antes de construir un panel central |

Posponer multiusuario, más CRM, facturación, agentes autónomos, IA con datos reales y escritura automática de producción hasta validar el proceso principal. La autorización para publicar código no autoriza esas ampliaciones ni escrituras en CRM.

## Secuencia sugerida y métricas

- **Primera etapa:** corregir ambigüedad de exportación/custodia, cerrar ensayo auténtico y realizar aceptación humana. Metas propuestas, aún no medidas: preparación <=30 minutos y recuperación <=15 minutos.
- **Segunda etapa:** cinco entrevistas de agencias, un piloto acotado y registro de bloqueos reales. Medir éxito sin ayuda, minutos de soporte, antigüedad de copia, restauración y errores de devolución.
- **Tercera etapa:** elegir las dos mejoras que más reduzcan esos bloqueos. Buscar compromisos pagados y renovación tras simulacro; no considerar suficientes las opiniones favorables.

Evidencia local de esta revisión: `test-results/analisis-2026-10-26/`, excluida de Git. Este documento conserva el resumen verificable sin claves ni datos operativos. No se han ejecutado las nuevas funcionalidades propuestas.
