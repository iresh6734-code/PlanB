# QA052 · Candidata actual verificada en aislamiento

13 de noviembre de 2026, Europe/Madrid. Repetición de empaquetado con las correcciones de QA052 y el checkout actual de Plan B.

- Candidata `tests/.tmp/release-candidates/candidate-158bfafe-08bd-4725-bb65-359424e5286e`. Constructor REL046 `97197656…` y pruebas ASSETS057 `2234f02f…`, cotejados con las presentaciones y con la copia.
- **10/10 comprobaciones**, incluido TypeScript, Vite, los seis bundles, activos y la integración Node. **163/163 pruebas Node** de la lista del constructor, sin omisiones. El manifiesto registra 10 activos públicos capturados y ninguno excluido. Se cotejan los bytes de cada uno entre fuente y destino. Se confirmó estabilidad del inventario de entrada al cierre.
- El verificador 095 devolvió `matches-manifest` y cero discrepancias tras leer las **800 fuentes y 52 artefactos** de la candidata. Esta comprobación compara bytes e inventario contra un manifiesto local sin firma.
- El banco focal de verificación y capitalización ejecutó 27 casos, con **25 aprobados y 2 omitidos** por EPERM al crear junctions. El intento de preparar otro banco mecánico también recibió EPERM antes de ejecutar. La evidencia histórica exacta del constructor conserva el replay adversarial QA086 **20/20** y ASSETS057 **4/4**, incluido el enlace público con destino ausente. En el banco adversarial histórico, la rama de symlink de archivo seguía sin verificar en el equipo.

El constructor declara 102 impedimentos para aprobar la candidata: 85 reservas sobre fuentes capturadas (75 en revisión y 10 trabajando), 16 auxiliares fuera de su selección y la verificación visual y E2E pendiente. Las 17 exclusiones del inventario incluyen además la carpeta temporal de pruebas. Los tres indicadores `approved`, `deployed` y `releaseEligible` siguen en `false`. El éxito de los checks conserva el estado `compiled-and-node-verified`.

QA052 y QA056 siguen aceptadas como auditorías. La corrección de recuperación conserva el dictamen 322. REL046, ASSETS057 y 095 permanecen presentadas. La candidata incluye código de Opus con correcciones pendientes, por lo que estos 163 casos no sustituyen 337, 338 ni 339. No se arrancaron los binarios, no se ejecutó navegador ni se actualizó la demo o el piloto. El siguiente paso es cotejar las correcciones cuando se presenten y generar una candidata posterior para el recorrido integrado.
