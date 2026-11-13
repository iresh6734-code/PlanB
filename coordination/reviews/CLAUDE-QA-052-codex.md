# QA052 · Contraste independiente de Codex

30/10/2026, Europe/Madrid. **Auditoría contrastada:33pasan y2fallan por los mismos defectos F1/F2. Informe aceptable como revisión independiente, sin aprobar las fuentes afectadas.** El código de Claude y sus aserciones no se editaron.

## Evidencia reproducida

Snapshot propio `tests/.tmp/qa052-review-8458cf2d-cf3d-415a-a099-c5e6f9d3bdcd`. manifest.json contiene los cuatro hashes presentados y fuentes/dependencias examinadas. La versión anterior de Store/script queda congelada incluso tras comenzar las correcciones en live.

- Integridad BACKUP041: **12pass/1fail de13** en integrity-replay.log; falla exclusivamente HALLAZGOF1. Cifrado/contrato/replay/privacidad/CLI reales, sinTODO/skips.
- Cobertura SAFE049: **11/11** en coverage-replay.log, semilla/oráculo por secuencia revisados. No aparece hallazgo de producto en esta versión probada.
- Candidata REL046: **10pass/1fail de11** en candidate-approved-replay.log; falla exclusivamente HALLAZGOF2. CanariosF3 caracterizados. Workspace mecánico, sin construir PlanB o probar instalación. SinTODO/skips; límite de symlink de archivo declarado mediante diagnostic.
- **Typecheck completo del snapshotQA052 correcto**, typecheck.log.

La primera preparación propia omitió tests/.tmp en el snapshot, lo que produjo ENOENT en los bancos; se creó la carpeta vacía y se repitieron. El sandbox negó junctions y provocó fallo de preparación/skips del banco mecánico: esos resultados no se atribuyen al producto. Se autorizó la referencia a node_modules existente y la corrida mecánica en scratch propio, sin instalaciones o cambios en dependencias. Tras resolver el entorno, se obtuvo el33/2delinforme. Todos los logs anteriores se conservan diferenciados; no se suman repeticiones.

## Dictamen por hallazgo

**F1 confirmado, robustez de restauración/reinicio.** Sending no demuestra resultado remoto al restaurar. El estado del plan puede estar mal formado semánticamente aunque pase su esquema. La fuente anterior solo convertía sending en uncertain cuando plan.status era applying; con review/approved/partial/complete dejaba el envío y el preflight informaba cero inciertas. No es un envío remoto reproducido ni bypass de cuenta; afecta a un artefacto incoherente/heredado. Corregir en Store y también normalizar estados persistidos al construir Recovery, conservando datos y evitando reintentos automáticos.

**F2 confirmado, defecto latente de integridad de candidata.** La lista de extensiones omitía GIF/PNGmayúscula/webmanifest/txt/pdf/wasm. No había bloqueo y public-assets declarabaoksolo sobre las entradas admitidas. El public actual observado no exhibía el problema, pero un recurso admitido por Vite podía desaparecer de una candidata futura. Capturar todos los activos públicos regulares salvo exclusiones declaradas; cualquier exclusión debe figurar como cobertura parcial/bloqueo, y verificar los bytes hasta dist.

**F3 confirmado como mejora acotada.** La denylist permitía variables arbitrarias, incluidos nombres con forma de credencial. Los valores fueron canarios inventados, sin exfiltración real. Cambiar a allowlistOS mínima para todos los hijos de comprobación/compilación. El bloqueo de red del arnés sigue sin equivaler a un sandbox hermético del SO. No se anuncia una vulnerabilidad externa nueva sin precondiciones reales.

ObservacionesO1–O6 del autor conservadas como límites/caracterizaciones, no defectos demostrados adicionales. La inconsistencia de symlinks y precisiónino no se declaran verificadas aquí. El dictamen no cubre RESTORE050, SEARCH053 o EXPORT054.

## Coordinación de correcciones

Tras congelar/contrastar se reservó CODEX-INTEGRITY-055 para Store/Recovery/tests/informe. REL046 propio se volvió working con sus mismos dos archivos para F2/F3; regresiones nuevas separadas ASSETS057. No se tocó REL033 u otro archivo reservado ajeno.

F1 independiente ya pasa sobre copia corregida y4regresiones propias de matriz de estados pasan; F2/F3 tienen3regresiones mecánicas propias verdes. La validación ampliada/hash/presentación pertenece a esos encargos, no se presupone por este documento. No aceptar automáticamente BACKUP041/SAFE049/REL046 o los fixes para borrar cola.

Siguiente revisión Claude QA056: cotejar hashes nuevos en review, repetir sus bancos y actualizar únicamente sus pruebas de caracterización de entorno/hash; conservar QA052 como historia. Prompt coordination/briefs/CLAUDE-QA-056.md. Sin envío automático o lectura del aviso acreditados. No proveedor, instalación, despliegue, commit o push.
