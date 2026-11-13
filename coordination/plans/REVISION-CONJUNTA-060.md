# Revisión conjunta y siguientes puertas de Plan B

30/10/2026, Europe/Madrid. Codex. Plan de cierre verificable tras QA052 y las fases nuevas. **No está todo pendiente cerrado ni hay una instalación nueva acreditada.** Se conserva el checkout y el trabajo ajeno; no se publican cambios.

## Resultado de negocio y criterio de cierre

Buscar y abrir una ficha de la copia correcta, conservar trabajo completo de Hoy, revisar exactamente lo que se descarga y demostrar con datos ficticios que una copia se restaura y permite continuar tras reinicio. Cierre medible: identidad/revisión/valores e historial conservados, listas completas dentro de 10.000 registros, aprobación separada, incertidumbre sin reintento automático y evidencia independiente sobre los hashes que se acepten.

## Matriz de estado al preparar este plan

| Unidad | Evidencia propia actual | Estado / siguiente acción |
| --- | --- | --- |
| Claude QA052 | Codex reprodujo 33 éxitos y dos fallos causales; typecheck; hashes cotejados | done como informe histórico; no acepta sus fuentes auditadas |
| INTEGRITY055 | 52 focales y 13 independientes correctos; F1 previo reproducido | review; QA056 verifica restauración/reinicio incierto |
| REL046 + ASSETS057 | 3 regresiones propias y baseline 1/2; build real, seis bundles, activos y 162 Node | review; QA056 verifica activos y entorno de todos los hijos |
| BACKUP041 / SAFE049 | Bancos QA052 exactos: 12/13 y 11/11 antes del fix; integridad después 13/13 | review; QA056 repite con Store corregido antes de dictamen |
| RESTORE050 | 9 casos, typecheck y ensayo ficticio en dos procesos | review; QA060 contrasta límites, API, identidad y persistencia |
| SEARCH053 | 13 motor/API + 13 regresiones + 6 E2E; typecheck/build | review; QA060 oráculo de identidad, procedencia, carreras y valores completos |
| EXPORT054 | 5 E2E, archivo cifrado real cotejado, typecheck/build | review; QA060 revisión/custodia/errores y sensibilidad |
| INTEGRATION058 | Dos E2E integrados sobre runtime compilado + dos recorridos antiguos afectados; typecheck | review; QA060 contrasta inventario, procesos y límites de atribución |
| TODAY059 | 64 focales, baseline 0/2 causal y 5 E2E finales tras corregir CSS | review; QA060 completitud, filas finales, tandas y compatibilidad antigua |
| LAB035 | Código/demo/tests con hashes originales intactos; actualizaciones recientes solo documentales | review; necesita dictamen separado, no autoaceptación de su autor |
| REL033 | Reserva working ajena, observaciones históricas de parser pendientes | No tocar, ceder ni dar por corregida sin entrega de su dueño y revisión nueva |

Las revisiones de UX032, UX038, OPS048 y QA052 ya están aceptadas por sus evidencias específicas. Los párrafos antiguos sobre sus bloqueos en informes históricos no reactivan esas tareas. Las tareas ready antiguas tampoco constituyen una autorización para conectar al equipo original o abrir proveedores.

## Dos revisiones disjuntas para Claude

**QA056:** cuatro archivos existentes/nuevo informe. F1/F2/F3, BACKUP041, SAFE049 e infraestructura de candidata. Brief coordination/briefs/CLAUDE-QA-056.md. Fuentes corregidas presentadas; ready no acredita que otra sesión haya recibido el mensaje.

**QA060:** cinco archivos nuevos exactos. Búsqueda, exportación, ensayo, integración y Hoy. Brief coordination/briefs/CLAUDE-QA-060.md. Todos los archivos de QA056 son solo lectura. Una sesión puede terminar QA056 y luego reclamar QA060; dos sesiones pueden trabajar en paralelo solo con reservas separadas. No usar identidad de dueño del tablón como prueba de que dos procesos Claude sean la misma sesión.

La CLI consult.mjs conserva el límite de seis versiones antiguas autorizadas. Estos briefs no envían nuevas fuentes por esa ruta. No se controla ni garantiza ejecución de sesiones existentes de Claude. El usuario puede abrir el encargo en su sesión autorizada; el tablón y los informes son la evidencia de progreso que se revisa.

## Secuencia que habilita una futura entrega

1. Claude reclama la revisión concreta y congela hashes. Codex puede trabajar en pruebas nuevas disjuntas, sin modificar esas fuentes bajo revisión.
2. Codex contrasta cada hallazgo con reproducción propia; devuelve correcciones a su reserva de origen. Las fuentes corregidas se presentan de nuevo, nunca se acepta una mezcla o un hash antiguo.
3. Aceptar exclusivamente unidades sin trabajo requerido pendiente y con hashes coincidentes. Las herramientas de apoyo, fuentes funcionales e informes tienen dictámenes separados; no se limpia la cola por conveniencia.
4. Resolver las unidades fuente necesarias aún reservadas, incluyendo el estado real de REL033. Una revisión nueva y acotada debe cerrar LAB035; QA060 no tiene ese alcance.
5. Preparar una candidata formal nueva con el CSS final de TODAY059 y todos los hashes aceptados. El snapshot CSS de pruebas actual no es una instalación ni sustituye la candidata formal. Seleccionar checks por los cambios finales, preservando activos/entorno, fixtures y evidencia servida.
6. Si se pide instalar en la nueva instalación independiente autorizada, preparar antes un plan concreto de instalación/retorno y sus verificaciones. No acceder a bases o credenciales antiguas ni afirmar recuperación del equipo corporativo. El empaquetado y una prueba fixture no autorizan una acción en un proveedor.

## Próxima mejora de evidencia

Las pruebas de respuestas tardías deben usar datos válidos y, cuando corresponda, transporte que ignore cancelación. Un cuerpo inválido o el abort nativo pueden ocultar la falta de una guarda. Codex puede añadir una unidad propia de pruebas disjunta sin modificar el buscador ya presentado; la evidencia nueva debe separar versión actual y copia mutada. Es una mejora de capacidad de detección, no un fallo de producto confirmado.

Sin cuota restante observable o promesa de cinco horas exactas. La continuidad solicita trabajo útil, no consumo artificial: no bucles de pruebas repetidas, procesos huérfanos o vigilancia garantizada al cerrar el chat. Mantener memoria y panel con hechos comprobados y avisar solo de avances o cambios accionables.
