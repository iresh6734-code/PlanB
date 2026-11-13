# Candidata 340 · Decisión y desenlace tras reiniciar el servidor compilado

13 de noviembre de 2026, Europe/Madrid. Banco `restart342-7vCWhp`, Node 1/1 y TypeScript focal limpio. Se cotejaron 801 huellas de fuente y prueba. Se ejecutó `server.mjs` de la candidata 340, SHA-256 `33d6423e917aef4471549edb0f67c3b36db537fedf2af4b0f15ada92b1a4ce2d`, con sus activos web cotejados y una base SQLite ficticia recién creada.

- Proceso 9632, puerto efímero 53212. Salud e índice por HTTP 200, índice idéntico al manifiesto, misma instalación ficticia y proveedores sin configurar. Análisis 200, registro, decisión y desenlace 201. Resultado tardío y 40 minutos por comprobar.
- Proceso 14592, puerto efímero 53215. Conserva identidad de instalación, decisión y desenlace exactos. Dos GET sin cambios en las tres filas del flujo. Repetir ambos POST con las mismas claves devuelve 200 e idéntico contenido sin modificar filas. Historial de negocio vacío.
- Ambos procesos propios tienen recibo de cierre. El mecanismo de Windows terminó los procesos con señal SIGTERM, por lo que el ensayo acredita reapertura tras terminación del proceso, no el manejo ordenado de la señal dentro de Node. No se detuvo ningún servicio ajeno.

Un preload de pruebas informa del puerto efímero sin editar el binario. Con puerto solicitado 0, el propio servidor anuncia y publica 0 en su archivo de descubrimiento; el banco usa el puerto real del listener. El primer banco recibió EACCES en loopback antes de analizar. El pase definitivo usó permiso de loopback para sus dos procesos, con red exterior bloqueada. El aviso esperado de kit de relevo ausente pertenece a este banco sin kit.

Complementa el navegador 341. La candidata conserva sus reservas, sus impedimentos y sus indicadores de aprobación y despliegue en falso. No se verificó el instalador ni se actualizó una instalación. CORE, FLOW y REVIEW aún están en corrección y deben volver a pasar sus pruebas específicas al presentarse.
