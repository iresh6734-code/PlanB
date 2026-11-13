# 272 · Dictamen independiente del iniciador

6/11/2026, Europe/Madrid. Se cotejaron los tres archivos con sus hashes presentados y se revisó la sustitución de la lista de exclusión por variables de plataforma admitidas. La carpeta de datos del hijo se fija a la del paquete y se descartan opciones de Node y configuración de otras instalaciones.

Repetí `node --test tests/portable-launcher-env.test.mjs`, resultado 3/3. El ensayo ejecutó copias nuevas de la entrada CLI y observó la frontera de spawn con canarios sintéticos. Comprueba ambos ejecutables, directorio de datos propio, ventana oculta, variables admitidas y reutilización de una instancia coincidente. La respuesta de salud es simulada y el navegador permanece fuera de la prueba.

Dictamen favorable para 272. La nueva lista llega al repositorio. El ZIP 271 conserva el iniciador anterior declarado y necesita un corte sucesor para distribuir estos bytes.
