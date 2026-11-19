# Integraciones 119 · Notas de diseño

Pantalla `Integraciones` de la app principal. Lenguaje visual existente (tokens de `planb-ui.css`, sin tocar DESIGN.md).

## Jerarquía

1. `h1` Integraciones + «Actualizar estado» + aviso de alcance («no consulta HubSpot ni Google»).
2. `h2` **Conexiones**: bloque «Espacio local» (paquete, protección, importación e IA, alcance de datos, copia local, última captura) y debajo las filas:
   - CRM · HubSpot (1 fila).
   - Google Workspace · espacio de equipo (5 filas, con una explicación común de la separación de datos y autorizaciones).
3. `details` cerrado **Ver capacidades de ensayo** con el catálogo `/v4/integrations`.

Cada fila: identidad (logo, nombre, qué hace) · estado (insignia con texto + hechos) · siguiente paso (+ una acción solo si hace algo real). Escritorio: 3 columnas; ≤900 px: una columna, controles de 44 px.

## Estados

| Estado | Tono | Acción |
| --- | --- | --- |
| Sin conectar | aviso | Conectar HubSpot (callback) |
| Lectura configurada | info | Revisar conexión (callback) |
| Servicios deshabilitados | aviso | Revisar conexión (callback) |
| Sin comprobar aquí | neutro | Abrir … en el espacio comercial (enlace) |
| Espacio de equipo sin configurar / Dirección no válida | aviso / error | ninguna (explica qué configurar) |
| No disponible en este paquete | neutro | ninguna |
| No se pudo consultar | error | Reintentar (solo esa fuente) |
| Comprobando… | neutro | ninguna |

No existen estados «Conectado» ni «Verificado»: la pantalla no comprueba servicios externos.

## Verificación visual

Capturas generadas por `tests/e2e/local-integrations.spec.ts` (1440/390/320 × sin cuenta, conexión declarada con equipo, errores) en la carpeta temporal `tests/.tmp/integrations119-<UUID>/shots/`; ruta concreta en el informe. Contra un arnés, no la App real.
