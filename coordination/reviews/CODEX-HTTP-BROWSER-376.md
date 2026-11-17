# 376 · Exportación ante respuestas HTTP no JSON

15 de noviembre de 2026, Europe/Madrid. Comprobación funcional de CODEX-HTTP-ERROR-375 en Chromium, con el frontend y el servidor compilados en un banco local. El informe es el único archivo de esta entrega. Las pruebas nuevas quedan reproducibles en el banco.

## Resultado

| Recorrido | Cliente anterior | Cliente corregido |
| --- | --- | --- |
| El resumen de exportación devuelve un 404 HTML | Muestra un error de análisis JSON en la propia pantalla | Avisa de que la versión no permite revisar el contenido. Bloquea la descarga y permite recuperar el resumen con «Actualizar contenido» |
| La descarga cifrada devuelve un 503 HTML | Muestra un error de análisis JSON en la propia pantalla | Muestra «No se pudo descargar el archivo.», restablece la confirmación y exige nueva revisión. Un intento de red y cero archivos descargados |
| Suite existente de exportación | — | 5/5: descarga real descifrada y cotejada con la revisión, revisión cambiada, custodia, error de resumen y teclado, bloqueo real de sesión con 401 |

Resultado final de Chromium: **7/7** con el cliente corregido. Ambas regresiones fallan en la versión anterior por el texto de la alerta. El primer ensayo del cliente anterior agotó el tiempo al buscar la barra lateral con el viewport móvil. La repetición abre Exportar desde la navegación de escritorio y cambia a 390 px para verificar los dos mensajes. La suite existente mantiene sus cinco aserciones de recorrido y comprueba 320, 390 y 1440 px en su caso responsive.

El banco sirve ambos builds en el puerto 4425 por turnos, con bases nuevas separadas y datos ficticios. El 404 y el 503 se simulan con respuestas de Playwright. El 401 lo devuelve el servidor real del banco. La variante antigua sustituye exclusivamente el cliente HTTP en el frontend congelado, con el mismo servidor. No hubo peticiones del navegador fuera del origen en los dos recorridos nuevos ni excepciones de página. Chromium headless se ejecutó desde la caché de Playwright.

## Evidencia

- Carpeta: tests/.tmp/browser376-7NjJEV. Los archivos app-browser.json, previous-browser.json y previous-first-browser.json conservan los tres resultados. Las alertas corregidas están en app-results y las capturas responsive de la suite existente están en evidence.
- Cliente corregido SHA-256: a5ec8540e0cbe87e4137a16ef3d9b3aa9a3c5cef2e5f798daca1351379dce87c.
- Cliente anterior SHA-256: fc219e35e8d560f3b677dd58c2fe3809eb036726f472dce78af2c9223f47a2c5.
- Backend común SHA-256: 61864cc26c351516d95ee07dc108e4cde147f2cd788baca2939dfa0540f3093a.
- Prueba nueva SHA-256: dc8d1a11ec8c642b3aa26b0952de7322e49c5ed73daa9e6d6249f9a1ca8ee968.
- Suite existente SHA-256: 07a351bc5a6df3bdc9333b80a0fc1284a19775385195ef2af614761400a897eb.

## Aplicación local

El puerto 4331 rechazó conexión en el primer control. Se inició una demo independiente con los binarios de ensayo corregidos, una carpeta de datos ficticios nueva y bloqueo de red externa. El lanzador cotejó el recibo con la instancia de salud y validó la portada. Se solicitó abrir el navegador y una comprobación posterior devolvió HTTP 200. La demo no incluye el Kit Windows para el ensayo de relevo. Las siete pruebas corresponden al banco 4425. La batería global y el empaquetado Windows quedan fuera de esta ejecución.

QA081 y QA052 figuran cerradas. LAB036 sigue disponible en el repositorio y pendiente de presentación formal. La auditoría de LAB036 está en el dictamen independiente existente. Sus archivos se conservaron intactos.
