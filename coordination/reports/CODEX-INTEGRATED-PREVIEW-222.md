# Candidata visible de Plan B · 222

5/11/2026, Europe/Madrid. La candidata está disponible en [127.0.0.1:4597](http://127.0.0.1:4597/). Incluye la ficha con gestor compartido y resultados fuera de Hoy de 171 R2, junto con la comprobación explícita de lectura de HubSpot de 218. Es una instalación de ensayo con datos ficticios nuevos. La URL 4596 conserva su corte anterior.

## Fuente que se compiló

Se creó `tests/.tmp/p222-k55G8K/s` desde las fuentes congeladas del corte 193. Sobre esa base se copiaron exclusivamente archivos de ejecución de las entregas aceptadas 148, superficie136, 170, 171, 160, 173, 212, autorización214 y montaje218. Cada archivo sobrepuesto coincidió con el hash aceptado del tablón y con la copia revisada en 221. El manifiesto registra procedencia por archivo. Se conservan las versiones de backend de 193 para las mejoras 201, 206 y 207 todavía pendientes de revisión en este corte.

Las 264 entradas de la copia se cotejaron antes y después de compilar. Vite compiló la App con entorno de construcción vacío y esbuild compiló `server/main.ts` con 54 entradas del manifiesto. El backend tiene SHA-256 `e4db086389c5ca3caa9308d1070586aa6524eb343a3c70fc9e76ad99dc0dc080`. Quince activos servidos por HTTP coinciden con disco y con el manifiesto.

El binario contiene el registro de API212 mediante autorización214. La UI contiene `LocalIntegrations` y `HubspotReadCheck`, además de `TaskOutcomesHost`, ficha148, gestor170 y superficie136. El formulario conserva su estrategia legacy aceptada en 171. La integración del cliente de revisión, comparador199, Jornada205 y diario208 sigue las unidades del encargo216.

## Instalación y salud

Raíz de ejecución `tests/.tmp/p222-k55G8K/runtime`, clave local de tipo test, base de archivo nueva y semilla ficticia de Agencia Norte creada para esta entrega. PID `7464`, handle `87459`, identidad `c2f80a07-4746-4924-817b-b3e8e1c7d673`. Captura `fixture-agency:2026-11-05T21:29:08.569Z`. Se inició con lista permitida de entorno y bloqueo de tráfico externo. Esta copia carece de credencial HubSpot y de proveedor IA configurado.

La comprobación inicial de HTTP y activos encontró cero cambios CRM. Después de los ensayos descritos abajo hay dos cambios ficticios de estado. Salud y estado siguen respondiendo con la identidad propia. Los archivos `manifest.json`, `backend-metafile.json`, `ready.json`, `served-audit.json` y `final-audit.json` están en `tests/.tmp/p222-k55G8K`. El intento de mostrar la URL en el panel Codex devolvió `queued`.

## Recorrido sobre el build servido

Chromium aislado navegó desde Hoy a una ficha, cambió el estado y envió un único PATCH. La barrera de navegador dejó que el main aplicase el cambio y retuvo el acuse. Se cerró la ficha, se navegó a Integraciones y la superficie conservó el intento en curso. Al perder el acuse pasó a incierto. «Comprobar ahora» solo leyó y «Aceptar el estado leído» produjo el resumen «1 lectura aceptada por ti». La prueba exige que ese resumen conserve la procedencia humana.

La pantalla de Integraciones muestra el panel nuevo de comprobación y su estado «Sin configurar». «Comprobar lectura» queda deshabilitado con la explicación pertinente. «Actualizar resultado» consulta el estado local. Se comprobó geometría de documento a 1440, 390 y 320 px. Se abrió la captura `integraciones222-320.png`, con panel y controles legibles en ese ancho. Las otras dos capturas existen y su geometría se comprobó automáticamente.

La ejecución final usa task-3, comienza con un cambio ficticio previo y termina con dos. Durante esa ejecución se observa exactamente `PATCH /api/records/tasks/task-3`, cero errores de página y cero peticiones externas. Resultado `smoke-result.json` en la raíz de evidencia y log `tests/.tmp/preview222-smoke-final.log`.

### Incidencia del primer ensayo

El primer ensayo completó el recorrido de task-2 y añadió su cambio ficticio, pero se detuvo en una expectativa de texto incorrecta del script. Esperaba «Sin conexión guardada» y la UI mostraba «Sin configurar», que es la etiqueta del contrato aceptado. Se corrigió la expectativa y se hizo el recorrido completo con task-3. La base conserva ambos cambios. No se alteró el código de producto para adaptar esa expectativa. El resultado final declara el contador inicial uno y final dos.

## Alcance y siguiente entrega

La revisión independiente221 ya repitió 26 Node y 24 DOM de Integraciones contra main y proveedor ficticio, incluido consentimiento con cinco GET y persistencia tras reiniciar. Esta candidata usa el montaje aceptado, pero su conexión está ausente y la comprobación real continúa pendiente del portal de ensayo y autorización humana. Los botones de configurar y comprobar están en el recorrido visible de Integraciones.

Los resultados de guardado siguen viviendo en la ventana de sesión. La base conserva los cambios del ensayo cuando esa ventana se cierra, pero el detalle del intento aún no se recupera después de recargar. La integración del diario se verifica en su unidad propia. La Jornada y el comparador siguen pendientes de montaje. El pasaporte y el mapa de impacto siguen sus revisiones y consumidores correspondientes.

La unidad222 se presenta para revisión independiente del código congelado, artefactos y recorrido servido. El otro Codex conserva el contrato de coordinación y actualiza `CONTEXTO-PROYECTO.md` bajo su reserva035. La instancia nueva permanece disponible bajo el handle registrado mientras el entorno mantenga su proceso.
