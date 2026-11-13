# Coordinación de las dos sesiones Claude · 30/10/2026

Revisión de Codex solicitada por el usuario. No amplía las reservas ni acredita envío a una sesión. Cada autor aplica únicamente lo que corresponda a su encargo; no tomar la tarea del otro aunque ambos usen el actor claude.

## Sesión de diseño · CLAUDE-UX-038

Los archivos de UX038 y QA042 no se solapan. Conserva tus reservas mientras trabajas y durante la revisión. No edites los dos archivos QA042, el selector de UX032 ni las fuentes de Codex.

**Resolver antes de presentar:** `src/planb-ui.css` contiene `body .customer-combobox__option { min-height:36px; padding:6px 10px }` fuera de media queries. Tiene más especificidad que el mínimo de 44px del componente de UX032. En escritorio con puntero fino no se activan las guardas de 44px de móvil/coarse. La prueba existente `tests/e2e/customer-combobox.spec.ts` exige >=44px a1440/390/320.

Es un conflicto de comportamiento entre hojas aunque no haya colisión de archivos. Conserva el mínimo de opciones del selector desde tu propia hoja (>=44px en esos casos) y añade/verifica el caso de escritorio en tu E2E reservado. No rebajes la aserción de UX032 ni edites sus CSS/tests. Codex lo ha contrastado por cascada y contrato; no afirma haber ejecutado el DOM de esta iteración. Ejecuta el caso real sobre tu build aislado actual al cerrar.

Las cifras/capturas antiguas de UX038 describen sus iteraciones anteriores. Actualiza el informe con hashes y resultados de la presentación final. No despliegues por este aviso. No ejecutes dos navegadores contra la misma instalación de pruebas.

## Sesión de revisión · CLAUDE-QA-042

Conserva tu encargo de dos archivos, pruebas propias y fuentes Codex de solo lectura. No tomes el rediseño o UX032. No conviertas un TODO en una prueba aprobada.

Codex ha ejecutado una copia de tu test SHA-256 `47239229954082ea1b6f8b59fe0c0505b372e99dadb8eedc3bf884924156c627`: **31 pass, 0 fail de batería, 1 todo con aserción fallida** en el recorte Unicode DIFF040. Es un hallazgo real de calidad de vista previa; se registra sin atribuirle corrupción de la copia original. Mantén reproducción y severidad calibrada en el informe. Las caracterizaciones de límites deben seguir distinguiéndose de defectos demostrados.

Presenta los hashes del test y de cada fuente efectivamente revisada; no apruebes toda la entrega de memoria/panel como si fuera el motor. Si el test cambia, los resultados de Codex aquí pertenecen al hash anterior hasta que se repita la parte necesaria. Deja la corrección de DIFF040 a Codex; no alteres el motor para que tu prueba pase. No tienes que esperar a que se acepte el rediseño de la otra sesión para presentar tu revisión independiente.

## Reserva antigua · CLAUDE-UX-032

Sigue working y conserva reserva. La prueba nº13 aún no ejecuta `c.click()` antes de deshabilitar. Su propio autor debe añadir apertura y aserción de lista abierta, demostrar sensibilidad en una copia temporal y presentar. Código corregido y prueba insuficiente son hechos distintos. No abrir una tercera sesión sobre esos archivos ni cambiarla desde QA042/UX038.

## Cola siguiente

No iniciar UX034 mientras UX038 reserve `src/customer-dossier.css`: aunque UX034 esté ready, claim debe rechazar ese solape. Esperar revisión/liberación o acordar una unidad nueva con archivos disjuntos; no quitar reservas manualmente.

Codex mantiene congelados los módulos revisados mientras QA042 concluye. Tras presentar la revisión, Codex contrastará la regresión Unicode y solicitará/realizará su corrección con nuevos hashes. No se acepta ninguna unidad por un comentario o por un resultado de otra iteración.

## Actualización del cotejo final

La copia QA042 SHA323cb6ea425c89524109954483de099cf1866932b5472cfccd766b6d834220d4 ya se ejecutó: **31 pass y2 todo fallidos,33 casos**, hash estable durante la prueba. Además de DIFF040-1 queda confirmado OPS039-1 en el recorte de etiqueta a180 unidades UTF-16. Ambos son defectos menores de presentación de código Codex y deben permanecer visibles como pendientes. La corrección la realizará Codex tras tu presentación, sin alterar mientras tanto los motores que estás revisando.

UX038 ha seguido cambiando su CSS y E2E dentro de la reserva; no aplicar las pruebas antiguas como aprobación automática de esos cambios. La regla de36px sigue vigente al cotejar; conservar el mínimo de44px acordado para opciones del selector y comprobar su integración al finalizar.

## Tras la presentación · QA045

QA042 quedó aceptada por Codex como revisión de los hashes anteriores; sus dos archivos históricos no se modifican bajo ese encargo cerrado. UX038 fue devuelta con su reserva conservada por el conflicto del selector.

Codex corrigió OPS039/DIFF040 y presenta nuevos hashes en coordination/reports/CODEX-TEXT-044.md. **CLAUDE-QA-045 está ready**, con nueva reserva para tests/independent-continuity-review.test.ts y coordination/reviews/CLAUDE-QA-045.md. No empezar sin claim/check-path ni editar fuentes Codex o el informe QA042 histórico.

Comprueba la corrección Unicode y retira los dos TODO únicamente tras cotejar los hashes y ejecutar los casos como pruebas ordinarias. El recorte conserva un máximo de180 unidades: si un par cruza el borde, puede devolver179. Por eso la precondición OPS de longitud exactamente180 debe pasar a longitud<=180, conservando las aserciones de ausencia de sustitutos huérfanos y añadiendo el caso de par que cabe justo. Eso expresa el máximo del contrato, no permite recortes mal formados. Comprueba además las fechas inválidas100, fallback y vistas previas500.

Codex ya ejecutó esta adaptación solo en una copia temporal:33/33 sinTODO, y63 focales/typecheck. Tu informe debe distinguir esta evidencia de tus propias ejecuciones. Presenta QA045 con hashes actuales y dictamen; no aceptes automáticamente los módulos ni despliegues. La sesión de UX038 continúa solo su corrección de CSS y E2E, sin tomar estos dos archivos.
