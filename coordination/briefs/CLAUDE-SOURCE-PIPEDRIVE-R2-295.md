# Claude B · Pipedrive R2: normalización sin condición ni fecha inventadas

**R3 atendida y aceptada el 9/11/2026.** El dictamen 295 registra 28 pruebas y tipos correctos sobre sus huellas finales. El encargo se conserva como historial.

## Entrega R3 histórica · 9/11/2026

R2 atiende F1 y F2 originales. Codex repitió 17 pruebas de autora, siete sondas anteriores y tipos con éxito. Dos sondas nuevas están en `tests/.tmp/pipedrive295-pmRs4Z/s/tests/independent-pipedrive295-r2-boundaries.test.ts`. Usa las mismas cuatro reservas y el dictamen actualizado.

1. **F3.** Antes de publicar una fecha normalizada, exige que el resultado pertenezca al formato de `SourceRecord.updatedAt`. Las conversiones UTC que salen del año de cuatro dígitos deben quedar como fecha desconocida. Conserva la fila, sus condiciones y las demás filas. Cubre listado y consulta por ID. Mantén un control con una fecha válida con zona.
2. **F4.** Resuelve el duplicado más reciente también cuando ambas fechas caen en el mismo milisegundo. Mantén los tres dígitos del campo público y usa precisión adicional solo para elegir el registro. Comprueba ambos órdenes de página, offset y cobertura parcial con un duplicado. Conserva el caso positivo de `.123456Z` publicado como `.123Z`.
3. **Informe.** Concilia el párrafo histórico sobre el máximo de personas con la política documentada en R2. Atribuye las dos sondas al revisor y tus resultados al banco de tu sesión.

El candidato de prueba privado `pipedrive295-r2-causal-LTRRkX` muestra que los dos cambios juntos pasan 26/26 y tipos 0. El primer candidato con fracción pública de seis dígitos falla una aserción existente y queda descartado. Puedes usar otra implementación si conserva los contratos. Demuestra las regresiones frente a R2 y presenta de nuevo. Las pruebas no requieren ninguna cuenta ni acceso externo.

## Brief R2 histórico

8/11/2026, Europe/Madrid. Conserva las cuatro reservas de CLAUDE-SOURCE-PIPEDRIVE. Revisa el dictamen `coordination/reviews/CLAUDE-SOURCE-PIPEDRIVE-independent-295.md`. No toques transporte/source-reading/commitments, SourceStatus, App/main, demo o cuentas bajo esta unidad.

1. **Indicadores ilegibles.** Si is_deleted está presente con tipo ilegible, no tratarlo como false ni publicar una oportunidad clear/completed con cobertura complete. Rechaza/omite con categoría y contador que expliquen el desconocimiento. Valida también el indicador de archivo que consumes, sin coerción de cadenas a booleanos. Mantén los casos válidos true/false y el comportamiento documentado de campos ausentes.
2. **Calendario real y hora válida.** La forma de una fecha y Date.parse no bastan. Fechas imposibles deben dar updatedAt:null, sin normalizarlas a otro día ni usarlas para desplazar un duplicado válido. Caso mínimo: lost de2mar08:00 seguido de mismoIDwon de30feb09:00. No debe convertirse a completed por fecha inventada. Mantén bisiestos, desfases y formatos válidos.

Las siete sondas están en `tests/.tmp/pipedrive295-probes.ts`: baseline4pasan/3fallan. El aislamiento privado de los dos cambios da5/7 o6/7, y ambas guardias21/21 con14originales/tipos0. No copies una solución sin revisar sus límites ni modifiques aserciones para que pase.

Integra regresiones sobre el adaptador/lector reales, con control positivo y demostración de fallo en versión anterior en copia nueva. Repite14anteriores y tus regresiones, tipos focales, verifica hashes y cierre. Datos ficticios y red exterior bloqueada, sin cuenta real, credencial real, navegador, instalaciones, build/dist raíz, commit o despliegue. Actualiza informe y submit; luego deja de editar.

Actualización documental menor: la referencia oficial de Persons ahora indica máximo500 para el listado. Puedes mantener política100; explica que es decisión propia y no un límite documental desconocido. El host y x-api-token están documentados, pero ninguna prueba sintética demuestra autorización o lectura real.
