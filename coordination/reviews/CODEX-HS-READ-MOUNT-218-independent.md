# Montaje HubSpot 218 y texto 219 · revisión independiente 221

5/11/2026, Europe/Madrid. Dictamen favorable para las diez huellas de 218 y la única huella de `CODEX-INTEGRATIONS-COPY-219`. Se revisó el montaje desde `main`, el lector de conexión y el consumidor visible de Integraciones. Se repitió el recorrido con proveedor ficticio.

## Contrato y consumidores

`main` registra la API aceptada 212 y le entrega la captura de autorización de 214. El módulo de montaje consulta la fila cifrada de conexión mediante las primitivas existentes. Conserva el modo test de conexiones heredadas y deriva una revisión del valor cifrado. Construye el servicio sin crear otro `Continuity` o `Jobs`. La prueba mantiene intactos los trabajos activos al montar el lector.

Integraciones renderiza `HubspotReadCheck` dentro de la sección de HubSpot. Su acción solicita consentimiento con portal y cinco lecturas. Abrir, actualizar y consultar resultados usan la evidencia local. La cancelación es explícita. El cliente descarta respuestas sustituidas o posteriores a desmontaje, despacha el aviso de sesión bloqueada ante 401 y caduca la observación con temporizador local. El permiso y la configuración se revalidan en el servidor mediante las dependencias ya aceptadas.

Se comprobaron las 256 entradas del manifiesto `tests/.tmp/m218-0cbe438b/manifest.json`. El corte usa App 171, ficha 148 y superficie 136 preservadas, junto a las fuentes de 218 y el test 219. Esa combinación evita atribuir al montaje las ediciones en curso de la sesión Claude de ficha. Los componentes nuevos y el registrador se compilan desde el punto de entrada principal.

## Pruebas repetidas

- **26/26 Node** de montaje, proyección de Integraciones y revisión independiente previa. `tests/.tmp/review221-node.log`. Los cuatro casos de montaje usan SQLite de archivo con clave test y transporte de proveedor controlado.
- **24/24 Chromium**, una pasada sin reintentos. Son diez casos de App real contra `main` compilado y catorce del arnés anterior de Integraciones. Config propia `tests/.tmp/review221.playwright.config.ts`, raíces nuevas `review221-browser` y `review221-legacy`. Log `tests/.tmp/review221-browser.log`.
- Tipos focales del corte, incluidos `main`, componente y tests, **exit 0**. `tests/.tmp/review221-types.log`. El análisis global verde figura en el informe del autor y no se repitió en el checkout mientras otros agentes editan sus rutas.

El recorrido normal navega desde la barra lateral, cancela la primera confirmación sin consultar al proveedor, autoriza cinco GET exactos al servidor ficticio y muestra los cuatro resultados por objeto. Comprueba cero cambios CRM, ausencia del contenido del registro en la pantalla y concordancia HTTP/disco de los activos JS y CSS. Reinicia `main` sobre el mismo archivo y vuelve a mostrar la observación tras desbloquear. Conserva cinco lecturas de proveedor en total. Resultado propio `tests/.tmp/review221-browser/normal-flow.json`.

Los otros nueve casos de App cubren doble clic y navegación, cancelación durante identidad, bloqueo con respuesta pendiente, configuración ausente, producción deshabilitada, lectura parcial y caducidad local, respuesta antigua cuyo transporte ignora abort y errores 404/409/422 de presentación. Los 409/422 de esos casos se fabrican mediante interceptación del navegador. El resto utiliza la API registrada desde el main y el proveedor loopback. La matriz anterior de Integraciones verifica enlaces, teclado, fuentes independientes, cargas y móvil.

Se abrió `tests/.tmp/review221-browser/checked-320.png`. El panel, fecha, resultados de cuatro entidades y acción están legibles en el ancho comprobado. La suite también captura 1440 y 390 y comprueba geometría. No se atribuye inspección manual de esas dos capturas al revisor. No se repitió el mutante de secuencia del autor ni se probaron Edge o lector de pantalla.

El arnés registra doce procesos main cerrados. La comprobación final con `Get-Process` encontró cero PIDs de esa lista. Un tanteo previo con `process.kill(pid, 0)` devolvió un posible proceso para un PID que la consulta posterior ya no encontró. Se conserva el registro `children.json` y se usa el cierre observado junto con el cotejo final. No se terminó ningún proceso por ese tanteo.

## Cambio de la prueba 219 y custodia

`tests/.tmp/review221-copy.cjs` revierte en memoria la línea de texto y su indentación. Produce exactamente el baseline `81ea065bb82756f123129d264efc665491b79e7386266f0026ea0763c6cf46e8`. La versión presentada tiene SHA-256 `4379f7c164078582397bb7847cbc5fe75582af0e6332fb576991325cd19cb1e3`. Las catorce pruebas pasan con el nuevo texto y conservan el resto de sus aserciones.

La edición fuera de reserva que el autor declara en el intento 220 se revirtió antes de presentar. En esta revisión la prueba independiente conservada se ejecutó dentro de las 26 Node y pasó. Ese incidente no autoriza futuras ediciones de 122 ni del resto de reservas.

Las diez huellas de 218 y la de 219 coinciden con el tablón. Se conservan en `tests/.tmp/review221-hashes.json`. Principales fuentes revisadas:

| Archivo | SHA-256 |
| --- | --- |
| server/main.ts | c498515e3b4fce217a0e4a6595cc49941b1587ea36abc816ddd61fc589bd645f |
| server/hubspot-read-check-mount.ts | dd4d54d2e98c7ced34092371e90ea9d961ca345f6a5c436aa9575b6e1fa3efd0 |
| src/LocalIntegrations.tsx | 38118953938701e2497df567132a9934c53c0169cb88c88bcb04adbb998e7f6a |
| src/HubspotReadCheck.tsx | 3932778a3938ad32129f5c266ff089aa75a0e2bfe20ad59dea1858a525e9431a |
| coordination/reports/CODEX-HS-READ-MOUNT-218.md | c30fd5be9b0675dabdbee3c38c24bcba3f985e3d063b090b8d36b455cd725d52 |

## Siguiente montaje visible

Aceptar 218 y 219 permite preparar una candidata visible a partir del corte y de las dependencias acordadas. La copia 4596 sigue sirviendo 193 hasta esa entrega. La autorización para ejecutar la comprobación real continúa pendiente de portal de ensayo propio y permiso expreso para las cinco lecturas. Toda la evidencia de esta revisión usa cuentas, credenciales y registros ficticios.

El otro Codex conserva la revisión del diario 208 R2. La revisión 221 no modifica sus fuentes ni las del comparador, la Jornada o el pasaporte. El seguimiento de los montajes de trabajo continúa mediante las unidades posteriores al encargo 216.
