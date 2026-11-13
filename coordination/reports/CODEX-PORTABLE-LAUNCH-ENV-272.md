# 272 · El iniciador portátil acota el entorno heredado

6 de noviembre de 2026, Europe/Madrid. `launch.cjs` conserva una lista explícita de variables de plataforma y fija `PLANB_DATA_DIR` a su propia carpeta. La lista incluye rutas de ejecutables, raíz de Windows, temporales, configuración regional, zona horaria y arquitectura. Sustituye el filtro anterior por nombres de credenciales conocidos.

El caso reproduce la familia F3 de QA052 en el iniciador. La versión anterior entrega al hijo seis valores canario con nombres de contraseña, frase de recuperación, clave privada, cookie, URL de base y configuración arbitraria. La corrección retira esos valores, las opciones de Node y la configuración de otras instancias. Conserva los valores de plataforma y la selección entre `server.mjs` y `runtime.mjs`.

La prueba ejecuta una copia del iniciador por su entrada CLI normal en una raíz nueva. Un preload sustituye la frontera de spawn y la respuesta de salud por controles locales. Registra nombres y coincidencias de canarios, sin valores de entorno reales. Comprueba que una instancia coincidente se reutiliza con cero nuevos procesos, que la invocación pide ventana oculta y que conserva el directorio propio. El navegador del usuario permanece fuera del recorrido.

Con la versión anterior pasan uno de tres casos y fallan ambos despachos por los seis canarios. Con la corrección pasan 3/3. El primer contraste y el corregido se conservan en `tests/.tmp/launcher272-proof-AibF9E`, con la versión anterior del iniciador. El banco no arranca un segundo runtime comercial. La prueba completa del Node incluido y el ZIP corresponde al corte 271, cuyo auxiliar de inicio tiene la huella anterior.

La nueva lista permitida necesita incorporarse al siguiente paquete para que llegue a la descarga. La construcción de ese paquete conservará su propia evidencia. Este cambio usa el iniciador portátil independiente y su prueba nueva.
