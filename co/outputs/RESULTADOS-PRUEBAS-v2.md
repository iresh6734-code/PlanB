# Plan B v2 · Resultados de validación

Fecha: 24 de octubre de 2026. Windows, Node 24.19.0 y Microsoft Edge. Datos ficticios, un operador local.

## Resultados completados

- Compilación TypeScript, Vite y tres entradas Node: correcta.
- **46/46 pruebas unitarias y API:** contratos, conciliación, fallos parciales, dos configuraciones, reglas/procedencia, presupuesto, proveedores mediante respuestas controladas, cifrado/migración, contraseña, retención, cancelación/interrupción, captura programada fallida, conflictos, incertidumbre, validación antes de escribir e IDs persistidos tras exportar. Incluye lectura individual para verificar asociaciones ausentes tras HTTP 207, manteniendo el rechazo de permisos insuficientes.
- **7/7 recorridos de navegador, 20,7 segundos:** preparación, edición sin red externa, tablero/tarea, persistencia al recargar, segunda configuración, móvil, simulacro aislado, exportación/restauración cifrada con contraseña incorrecta, protección local y guion para agencias.
- **10.000 registros en SQLite cifrado por HTTP local:** páginas de 50; diez peticiones entre 337 y 520 ms; p95 520 ms; búsqueda 347 ms. Es una medición en este ordenador, sin concurrencia.
- Revisión visual de escritorio, exportación, continuidad móvil y página para agencias. Sin desbordamiento horizontal en el recorrido móvil probado.

## Empaquetado

**3/3 verificaciones completadas:**

- Plan-B-CRM-v2.zip y Plan-B-independiente-v2.zip arrancan con el Node y las dependencias incluidos. Editar cliente, avanzar oportunidad y crear tarea se conservan después de detener, mover la carpeta y reiniciar. Se verifican 63 registros finales y 84 relaciones originales.
- Los dos paquetes superan el simulacro aislado sin alterar el espacio operativo. El runtime devuelve 404 a importación, generación y devolución, y su código no contiene adaptadores externos.
- El paquete cifrado creado mediante la API arranca en una carpeta nueva, rechaza una contraseña incorrecta y restaura los datos y tres cambios con la correcta. No requiere credenciales de HubSpot o IA. La exportación tardó 123,3 segundos en esta ejecución; empaqueta Node y dependencias locales.
- Archivos ZIP íntegros, sin secretos, bases operativas o claves locales. Comprobaciones con red externa bloqueada.

La inspección inicial detectó un error del propio verificador al comparar el ID aleatorio de una tarea de otro ensayo. Se corrigió la comparación y se repitió toda la aceptación de los ZIP actualizados. El informe pruebas-paquetes-v2.json contiene los resultados finales.

## Alcance de la evidencia

El arnés de pruebas bloquea fetch, DNS y sockets externos en los procesos Node, y peticiones externas del navegador en el recorrido principal. Mantiene disponible 127.0.0.1. Es un control de pruebas en proceso, no una regla de cortafuegos del sistema.

La lectura auténtica de HubSpot también ha pasado: portal **149623339, DEVELOPER_TEST**, 5 contactos, 2 empresas, 0 oportunidades, 2 tareas, 2 relaciones y un pipeline predeterminado, con conciliación completa del contenido existente y sin errores de especificación. Se usó la credencial previamente configurada, sin imprimirla, sin escribir en HubSpot y sin modificar la base operativa. La comprobación se guardó en una base aislada.

Después se repitió la lectura y se guardó una captura conciliada en el historial operativo de Plan B (24 de octubre, 18:09 CEST), con el servidor detenido y el bloqueo de instancia respetado. No se sustituyó el espacio de trabajo. El servidor local 4340 se reinició conservando protección y conexión. Informe: pruebas-hubspot-captura-v2.json. Los ZIP de entrega siguen conteniendo únicamente los conjuntos ficticios incluidos, sin credenciales ni una copia de la instalación configurada.

También pasó una prueba Edge sobre una copia aislada de esa captura auténtica: editar el cliente importado; crear una oportunidad local y avanzar una etapa importada; crear y completar una tarea con campos hs_task_*; añadir referencia a un contacto; conservar 10:30 Europe/Madrid como 09:30 UTC en noviembre; reiniciar y comparar todos los registros. Sin solicitudes externas ni errores de navegador. Informe pruebas-hubspot-interfaz-v2.json. La oportunidad se creó localmente porque el origen no contenía oportunidades.

Esto acredita la importación del contenido actual; el conjunto de ensayo previsto sigue incompleto: faltan oportunidades, los dos pipelines de ensayo, la propiedad personalizada y las relaciones restantes. No acredita todavía el simulacro completo con ese portal ni una devolución auténtica. El control del navegador quedó bloqueado por los ajustes de Work. El proveedor IA elegido sigue pendiente; sus pruebas actuales usan respuestas controladas. Las pruebas simuladas no acreditan escrituras reales en HubSpot.

No se ha instalado el inicio automático en el ordenador ni probado su registro en otro perfil. La restauración cifrada prepara una nueva clave local; el traslado dentro del mismo usuario verifica persistencia, sin acreditar un ensayo físico en otro ordenador.

Datos de producción bloqueados. Sin ventas, ingresos, SLA o certificaciones acreditadas. Los precios del material comercial son hipótesis para entrevistas.
