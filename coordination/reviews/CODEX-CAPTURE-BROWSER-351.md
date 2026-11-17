# Desde el aviso de captura hasta Estado y el parte sin conexión

14 de noviembre de 2026, Europe/Madrid. Banco capture-browser351-5SrF6B. Corte congelado de 813 archivos, compilado con Vite en carpeta nueva. Las cinco huellas de 350 coinciden con la presentación y el checkout. Fuentes congeladas y 43 artefactos cotejados. Cambios de origen posteriores al corte: src/HomeOverview.tsx, src/LocalOperations.tsx.

- Inicio mostró «Capturas automáticas detenidas» y el motivo de conexión ausente. Activar el aviso con Enter abrió Estado, enfocó su pestaña y mostró el fallo real del intento sin conexión.
- En Copias y archivo, la cronología mostró conexión ausente, fallo con programación habilitada y éxito posterior. «Revisar en Estado» y el aviso de fallo de Inicio enfocaron Estado. Tras registrar el éxito, el aviso desapareció al volver a Inicio.
- Se abrieron tres partes HTML en Chromium offline. La fila de capturas indicó detenidas, con reservas y activas. Los archivos no incluyeron los textos internos de la sonda ni el identificador ficticio. Cero solicitudes de los tres documentos.
- Vista a 1440 y cronología a 390 y 320 px. Sin desbordamiento en las dos medidas móviles. Captura a 320 inspeccionada. Cero escrituras del navegador, cambios de negocio, solicitudes externas, errores de página o respuestas HTTP fallidas.

Playwright con Chromium en caché. Se sirvieron los bytes compilados y Fastify mediante app.inject en un SQLite ficticio nuevo. El fallo posterior a la configuración y el éxito se simularon escribiendo estado en el Store, sin captura real. Dos ejecuciones preliminares alcanzaron los destinos y descargaron los partes, pero el arnés omitía montajes y produjo 404. El pase definitivo usa los montajes reales de evidencias, comprobación de lectura, Kit y resumen de trabajo. No se ejecutó el simulacro del Kit ni se probó un paquete instalado o lector de pantalla.

En Estado «Servicios habilitados» sigue nombrando el permiso general de actualización y el error describe el intento concreto. La cronología y el parte muestran el estado de las capturas. Operaciones claras y Faro siguen con sus autores.
