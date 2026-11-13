**Comprobación de lectura desde Integraciones y el arranque principal · entrega218**

5/11/2026, 22:20:20, Europe/Madrid.

El punto de entrada principal registra la API212 con security.captureAuthorization de214. Integraciones muestra el estado guardado y ofrece Comprobar lectura. La confirmación nombra el portal y las cinco solicitudes. Solo esa acción inicia el recorrido al proveedor. Actualizar resultado y Actualizar estado leen datos locales. La cancelación envía DELETE. La observación conserva fecha, alcance y resultados por entidad. Su caducidad se refleja en la vista con un temporizador local, sin sondeo. La navegación y las peticiones sustituidas descartan respuestas tardías.

El lector del montaje usa la misma fila hubspotConnection y las primitivas open/localKey que Continuity.connection. La lectura se aísla en el módulo de montaje porque construir otra Continuity crea Jobs y marca trabajos activos como interrumpidos. Se comprueba que montar la lectura mantiene esos trabajos byte a byte. Una huella interna del valor cifrado identifica cada guardado, incluso con la misma credencial. Las cinco rutas aceptadas de212 y las rutas de087 se preservan.

**Resultado de las pruebas**

Corte privado tests/.tmp/m218-0cbe438b de256 entradas.26/26 Node, tipos focales limpios y10/10 recorridos en Chromium contra el main compilado y SQLite de archivo.14/14 del DOM existente de Integraciones. El análisis global del checkout también terminó0. Esta última ejecución sustituye la observación anterior de los dos errores de tipos de208. El diario ya está presentado para revisión.

El recorrido normal abre la App, navega desde la barra lateral y cancela primero la confirmación, sin tráfico al proveedor ficticio. Al autorizar hay cinco GET exactos con la cabecera prevista, ningún cuerpo de registro llega a la pantalla y el historial CRM sigue en cero. Se compara por HTTP el contenido de los dos activos JS/CSS con el disco. Tras reiniciar el main con el mismo archivo, la observación aparece después de desbloquear y el recuento sigue en cinco lecturas.

Se prueba doble clic, salir y volver durante el recorrido, actualizar el resultado pendiente, cancelación con identidad retenida, bloqueo confirmado con respuesta pendiente, configuración ausente, producción deshabilitada, lectura parcial, caducidad local y errores404/409/422. Los errores409/422 se inyectan en el navegador para comprobar su presentación. Los otros recorridos usan el servicio registrado en el main. Una prueba retiene una lectura antigua y hace que el transporte ignore abort. La nueva lectura falla y la respuesta vieja sigue descartada.

La consola del recorrido normal y los errores de página están vacíos. Se generaron vistas1440/390/320 sin desbordamiento y se abrieron las capturas1440 y320. Se ve el panel bajo HubSpot, los cuatro resultados por entidad y los controles alcanzables. Doce procesos main registraron cierre. El proveedor es un servidor HTTP ficticio en loopback. Browser plugin no disponible, por lo que se usó Playwright y Chromium de la caché. Faltan lector de pantalla y Edge.

La contraprueba retira solo los guardas de secuencia en la copia privada. La prueba de respuesta antigua falla por mostrar Lectura comprobada después del fallo nuevo. El archivo se restaura y el manifiesto vuelve a coincidir. Log mutant-late-response.log y causal-result.json. Los resultados verdes completos están en node.log, browser.log y legacy.log.

**Procedencia, incidencias y límites**

La prueba usa la App171 aceptada y la ficha148/superficie136 aceptadas desde su corte preservado. Esas cinco rutas se sobreponen solo en la copia privada para aislar el trabajo activo de Claude219. El manifiesto declara el resto del checkout usado. Las fuentes actuales de218 y la aserción219 coinciden con lo probado. El backend compilado contiene los componentes y el registro desde main. La demo4596 conserva su corte193 y esta entrega espera revisión independiente antes de preparar la candidata visible.

La primera ejecución Node omitió NODE_ENV=test en la nueva suite de archivo. El guardado rechazó la clave test antes del montaje. Tras explicitar ese entorno, los cuatro casos nuevos pasaron. El primer arnés de navegador comparó su raíz hermana con el tests/.tmp de la copia. El guardado de carpeta lo detuvo antes de iniciar main. Se corrigió para verificar el workspace autorizado, manteniendo una raíz nueva. Esos registros están en los cortes m218-b7f17771 y m218-edd0911c.

Una reserva propuesta para adaptar la aserción independiente119 fue rechazada porque el archivo pertenece a122. La secuencia llegó a editar una línea después del rechazo. Se revirtió inmediatamente y se cotejó su SHA256 presentado 7a87fb10b825ea773edb25385b86ca41a557976714b1e7d341a8471c53a4def5. La prueba original se conserva y pasa en la suite final. El encargo220 está bloqueado y sin reserva. La aserción de DOM de119 sí tiene el encargo exacto CODEX-INTEGRATIONS-COPY-219, cuyo único cambio de texto mantiene el requisito de distinguir abrir la lista y autorizar la lectura.

No hay una llamada real a HubSpot en esta evidencia. Sigue pendiente el portal de ensayo propio y su autorización expresa. Los procesos, cuentas, cookies, archivos y claves test usados son nuevos y ficticios. La superficie se añade al generador principal. El paquete independiente conserva su alcance sin conectores. No se instala ni se publica esta candidata mediante esta entrega.

**Huellas de la entrega**

server/main.ts c498515e3b4fce217a0e4a6595cc49941b1587ea36abc816ddd61fc589bd645f

server/hubspot-read-check-mount.ts dd4d54d2e98c7ced34092371e90ea9d961ca345f6a5c436aa9575b6e1fa3efd0

src/LocalIntegrations.tsx 38118953938701e2497df567132a9934c53c0169cb88c88bcb04adbb998e7f6a

src/HubspotReadCheck.tsx 3932778a3938ad32129f5c266ff089aa75a0e2bfe20ad59dea1858a525e9431a

src/hubspot-read-check.css cb7246d439dd97a9b711d6cfb576d9754b076537ab365711e0057e9914afd2c5

shared/local-integrations.ts 39a172d1032009b89dd9ce29f8bc84708929511af3e44f685d4fb99af2f9958c

tests/local-integrations.test.ts 43270130016ad1e2a6d0656a566d140ad8e60db63232b716c91be116b4e33d30

tests/hubspot-read-check-mount.test.ts 6d59c0d9a4bdd3ba3e1b46e8926a09fb3acc60f27ac087f4a6f4468a4ddfbbfa

tests/e2e/hubspot-read-check-integration.spec.ts c0a51b094db26652c7b356a12fcdf97b0c1b205f7fda085f8c434f11bbea4377

Asociada219 tests/e2e/local-integrations.spec.ts 4379f7c164078582397bb7847cbc5fe75582af0e6332fb576991325cd19cb1e3
