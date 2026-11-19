# Revisión independiente de CI y escáner móvil

Fecha de revisión 19/11/2026, Europe/Madrid. Cotejé todas las huellas presentadas de CLAUDE-CI-STEPS y CLAUDE-MOBILE-D5 antes y después de cada control sintético.

## CLAUDE-CI-STEPS · Solicitar revisión R2

Las siete pruebas propias pasan. Las veinte comprobaciones existentes de la CI base pasan entre dos ejecuciones. La de terminación del árbol Windows alcanzó su límite de 30 segundos en el entorno restringido. Al repetirla individualmente con el permiso para terminar sus procesos ficticios, pasó en 1,87 s.

- **F1 · Medio.** El informe puede declarar «correcto» el paso E2E sin ejecutar ninguna prueba. La opción «--e2e --list» llega a Playwright. Ejecuté un control local cuyo cuerpo falla deliberadamente. La ejecución devuelve 1 con el marcador de fallo y el listado devuelve 0 sin alcanzarlo. Al entregar el resultado real de ese listado al orquestador con su ejecutor inyectado, tanto el paso E2E como el informe global quedan correctos.
- **F2 · Medio.** El parser trata «--no-build» y «--config» como filtros y los reenvía. El arnés admite reutilizar el build compartido y Playwright acepta una segunda configuración. El informe presenta el paso como una ejecución aislada. Limitar el contrato a selectores de pruebas y opciones de selección explícitas, con rechazo anticipado de las restantes. Comprobar en una prueba funcional que el flujo que se marque correcto ejecuta el cuerpo de una prueba.
- El arnés invocado usa una carpeta fija para el build y dos puertos fijos. Dos ejecuciones simultáneas no tienen aislamiento entre ellas. Cualquier trabajo sobre este arnés debe reservar sus rutas en una unidad aparte, o documentar la limitación y detectar que el arnés está ocupado antes de modificar la carpeta de salida.

Evidencia en «tests/.tmp/ci462-6BGDtw/results.json». El ensayo usó un spec y configuración sintéticos. No se lanzó el arnés E2E del proyecto.

## CLAUDE-MOBILE-D5 · Solicitar revisión R3

La autoprueba propia pasa 6/6 en Chromium. En cuatro controles independientes, pasan la página de control y el rechazo de una respuesta HTTP 503. Los dos casos siguientes se marcan sin problemas:

- **F1 · Medio.** Respuesta 200 en la ruta solicitada, seguida 160 ms después de una navegación a «/sesion». El título que satisface la espera pertenece a «/sesion». La herramienta comprueba la URL antes de esperar ese título. Validar de nuevo el destino tras esperar el marcador y en el documento que se mide. Añadir el caso de navegación diferida.
- **F2 · Bajo.** A 320 px, «Confirmar» aparece con rectángulo desde x = −100 hasta x = −40, sin contenedor desplazable. La comprobación de viewport solo compara el borde derecho. Añadir el borde izquierdo, con un control para contenido que sí sea alcanzable dentro de un carril.

Evidencia en «tests/.tmp/tools462-A8MTCd/observed.json». Chromium recibió páginas sintéticas; no se ejecutó la app instalada.
