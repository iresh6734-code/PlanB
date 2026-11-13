# Revisión independiente · vista de ensayo 144

3/11/2026, Europe/Madrid. Dictamen: **aceptar la entrega de la vista de ensayo**, limitada al runtime y al corte comprobados. No es una instalación de producción ni una validación de proveedores.

## Identidad y archivos

En `http://127.0.0.1:4594/`, `GET /api/health` respondió con la instancia ficticia `b90d0381-12d7-4586-bffc-713272dc5eff`; el estado indicó datos de ensayo y un cambio local. Se revisaron en disco los **15/15 archivos** del directorio `dist`: sus hashes coincidían con el manifiesto y con el build 155 probado, sin archivos extra ni ausentes. El hash de `build/server.mjs` coincidía con el manifiesto. Los **46/46** inputs del metafile de backend coincidían entre los cortes congelados 151 y 155; la comprobación no recompila el backend ni demuestra su comportamiento en otra instalación.

## Navegación propia sin escritura

Con Chromium headless y una sesión nueva, se bloqueó cualquier solicitud ajena a 127.0.0.1:4594 y cualquier método distinto de GET. Se abrió Integraciones, que mostró el estado local y explicó que no consulta HubSpot ni Google. Se observaron «Sin conectar» para HubSpot y el espacio de equipo sin configurar. La captura de escritorio propia fue inspeccionada visualmente: `C:/Users/iresh/.codex/visualizations/2026/11/01/01a1979f-9475-7e01-9b05-f51ca3b83ea5/planb-preview157.png`.

Se navegaron Agentes y Hoy: ambos mostraron los datos de la copia ficticia, 18 tareas y la revisión local ya guardada. En ambos recorridos se bloquearon escrituras y conexiones externas y no se observaron errores de página. En Integraciones no se observó aviso global ni desbordamiento horizontal del documento a 1440 o 390 px; solo se inspeccionó visualmente la captura de 1440. Las sesiones se cerraron y no se detuvo ni reinició la preview.

Un primer intento propio de Agentes agotó el plazo esperando un encabezado llamado exactamente «Agentes»: el encabezado real es «Agentes y revisiones». Se corrigió el selector y se repitió con éxito; el fallo inicial fue del arnés, no demuestra fallo de la aplicación.

El guardado, contador, búsqueda y revisión local persistente fueron probados por el autor y constan en `coordination/reports/CODEX-PREVIEW-144.md`; **no se han repetido como escrituras por este revisor**. La revisión 156 sí repitió 6/6 DOM del corte 155 en servidores ficticios propios. No se verificaron lectores de pantalla, Edge, proveedores o datos reales. El gestor 136 sigue sin montarse en esta preview y D7 permanece abierto. La disponibilidad depende del proceso actual; no se garantiza ejecución permanente.
