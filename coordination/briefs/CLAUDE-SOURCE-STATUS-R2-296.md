> R3 atendida y aceptada el9/11/2026. Este brief conserva las devoluciones históricas; el dictamen296 contiene la versión y evidencia vigentes.

# Claude B · R2 de estado de fuentes: evidencia de intento y autorización

## Siguiente entrega R3 · 9/11/2026

R2 pasa los casos originales de F1 y F2. Codex repitió 13 pruebas de autora, seis sondas anteriores y tipos. Las dos sondas nuevas y los bancos están en el dictamen actualizado.

1. **F3.** Una petición puede haber recibido cabeceras y quedar interrumpida antes de producir una página. Si el recibo solo registra `aborted` o `timeout`, no acredita ausencia de respuesta. Define una evidencia o texto que represente lo que se sabe, manteniendo la causa, la acción y el recuento desconocido. Conserva `not-sent` para cero peticiones, el error HTTP confirmado y el fallo de red antes de respuesta. Prueba cancelación antes del envío, antes de cabeceras y durante el cuerpo. Si cambias el estado de plazo, explica el ajuste de sus oráculos y mantén los demás controles de la matriz.
2. **F4.** Conserva la regla de autorización anterior o igual al inicio con toda la precisión aceptada. El caso `.000001Z` posterior a `.000Z` tiene que rechazarse. Incluye control de autorización igual y anterior, y formatos válidos con diferente número de decimales si los mantienes admitidos.

El candidato privado `source-status296-r2-causal-GUoPSq` pasa ocho sondas y tipos. Sobre las aserciones de autora intactas deja 11/13 por el significado anterior de plazo y el conjunto cerrado de evidencias. Usa esa prueba como diagnóstico y conserva el detalle de cómo evoluciona el contrato. No amplíes a `SourceReading` común, transporte, APIs ni proveedores reales. Presenta de nuevo bajo las tres rutas existentes.

## Brief R2 histórico

8/11/2026, Europe/Madrid. Mantén las tres rutas de CLAUDE-SOURCE-INTEGRATIONS-CONTRACT. Dictamen: `coordination/reviews/CLAUDE-SOURCE-STATUS-independent-296.md`. No ampliar a adaptadores, transporte, persistencia, API, credenciales, App/main o cuentas.

**F1.** Distingue intento fallido de lectura observada en proveedor. Credential ausente y aborto previo producen cero llamadas; fallo de red produce una llamada sin página. Hoy se muestran como provider-observed con «Lectura realizada…». Conserva causa, nextAction y records:null; no lo conviertas en cero ni ocultes el error. Puedes añadir un nivel de intento o reformular el contrato de forma equivalente, pero no basta añadir un aviso mientras la afirmación principal siga siendo falsa. connected continúa false.

**F2.** Una autorización fechada después de startedAt no acredita aquella lectura. Rechaza esa vinculación o represéntala inequívocamente sin llamarla lectura autorizada. Conserva el caso positivo con autorización previa y el rechazo de proveedor/cuenta distintos. El anfitrión futuro también debe comprobar cuenta/alcance y autorización al ejecutar; esta derivación no sustituye ese control.

Las seis sondas están en `tests/.tmp/source-status296-probes.ts`. Baseline2/6; guardias privadas aisladas3/6 y5/6; juntas14/14 con las8originales y tipos0. No se cambió el checkout. Integra regresiones con los caminos reales de fallo del adaptador usando fetch falso/servidor ficticio, demuestra que fallan con la versión anterior y pasan con la nueva, y conserva las8anteriores.

Actualiza también el plan/handoff para que sus niveles y lenguaje describan la implementación corregida y distingan datos confiados de identidad/autorización autenticadas. Ensayo puro/local, sin proveedor real ni credencial real, navegador, instalaciones, build/dist raíz, commit o despliegue. Tipos focales, hashes, cierre, informe en nota de submit; después deja de editar. Esta unidad sigue interna, no abre el montaje de Integraciones/Radar.
