# 377 · El ZIP de la candidata restaura y conserva los datos al reiniciar

15/11/2026, Europe/Madrid. Candidata congelada en `tests/.tmp/release-candidates/candidate-ccd95e57-e386-4f81-a5a8-9ad3d6e3d3ad`. Incluye el guardado de custodia tras la segunda comprobación de revisión de 373 y el cliente HTTP de 375. Las huellas de `server/v2.ts` y `src/api.ts` coinciden con las presentaciones.

| Comprobación | Resultado |
| --- | --- |
| Constructor | Typecheck, Vite, seis bundles, diez activos públicos y 163/163 pruebas Node |
| Integridad antes y después | 833 fuentes y 50 artefactos coinciden por bytes con el manifiesto, cero incidencias de integridad |
| Recorrido Chromium | 1/1. Paquete cifrado real de 48.937.566 bytes, Node incluido v24.14.0 y dependencias resueltas dentro del paquete |
| Restauración | Contraseña incorrecta y fichero alterado devuelven 422 y dejan intacta la huella de la base. La copia válida devuelve 200 |
| Reinicio | Misma instancia portable con nuevo PID. Coinciden captura, revisión de evidencia, registros y seguimiento. La edición ficticia sigue visible |
| QA052 y regresiones focales | 62/63. El único fallo exige literalmente el SHA de una edición anterior del constructor. Los casos de comportamiento probados pasan |
| ASSETS057 | 4/4 sobre el constructor vigente. La junction rota de la raíz pública detiene la preparación antes de certificar cobertura |

La prueba de navegador usa los mismos `server.mjs`, `runtime.mjs`, `drill.mjs` y frontend de la candidata. La carpeta de dependencias procede del banco anterior y se verificó contra su inventario de huellas. La extracción se hizo en un directorio temporal ajeno al checkout. Se cerraron los tres procesos de ensayo identificados por el arnés. No hubo peticiones externas, se observaron dos rutas opcionales que devuelven 404 en el portable y se usó una clave SQLite de pruebas. El ensayo cubre el arranque del Node incluido mediante el arnés, que ejecuta directamente `runtime.mjs`.

## Bloqueos y siguientes comprobaciones

- El constructor vigente tiene SHA-256 `9719765673729c44cad2318969995d22e5506d968ab4e2efe586d46a0b292731`, igual al presentado en REL046 para rechazar una junction con destino ausente. El anclaje de la prueba adversa todavía exige `ae74ce22ea6a2ed14cc78f1b5735c763b937aa1a7199f9875764eba9a0ef2935`. Siguiente acción: actualizar el anclaje en su propia reserva, conservar el modo histórico y repetir el banco.
- El entorno permitió probar junctions. El caso de symlink de archivo sigue sin verificar. El primer intento de preparar el banco QA copió un directorio de temporales ya generado por el constructor y se detuvo con EEXIST. La repetición copia únicamente los archivos del manifiesto.
- El manifiesto mantiene 132 bloqueos declarados: 111 reservas con fuentes pendientes de aceptar, 19 archivos auxiliares excluidos, un cambio del checkout tras la captura y una revisión E2E/visual pendiente reflejada por el constructor. El contraste posterior encontró cambios en `src/HomeOverview.tsx`, `src/LocalOperations.tsx` y `src/operaciones-claras.css`. El resultado del ZIP corresponde a la captura congelada. La elegibilidad, aprobación e instalación siguen pendientes.
- La batería global se inició en `tests/.tmp/u377-9f8cDv` con 268 archivos de prueba. El primer arranque no llegó a ejecutar pruebas porque Windows interpretó las barras inversas del preload en NODE_OPTIONS. Se corrigió la ruta y se lanzó en carpeta nueva. El resultado global se registrará cuando termine y se clasifique.

Evidencia en `tests/.tmp/candidate377-6a8bb635`: `prepare.json`, informes de integridad, comparación con las fuentes activas, banco QA y `e2e-1794761848338`. SHA-256 del ZIP: `4d97fdf04967282fc89cd54ca85a4e5820c3232d7518c8ab485151321b11d073`. Los datos son ficticios y esta comprobación se ejecutó en loopback. La demo de 4331 queda fuera de la prueba.
