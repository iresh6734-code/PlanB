# REL033 · Revisión independiente

29/10/2026, Europe/Madrid. Revisor Codex distinto del autor. Solo este informe reservado; no se editan módulos o pruebas del autor. Sin Vite, E2E, ventanas, cuentas, credenciales, HTTP de servicios abiertos o despliegue. Se cotejaron los cuatro hashes de la presentación vigente antes de devolver.

## Pruebas propias

`node --test --test-concurrency=1 tests/workspace-release.test.mjs`:28/30 correctas. Dos fallan en preparación de fixtures al crear junctions (EPERM del sandbox), no por aserción de comportamiento del producto. No se cuentan como dos defectos de la herramienta ni se sustituyen por30/30 del autor. Las restantes cubren las comparaciones, presupuestos y transportes ficticios existentes. No se repite su comprobación HTTP real o sus18/13archivos del runtime.

Dos fixtures adicionales mediante stdin importaron los módulos reales y ejecutaron createManifest/verifyManifest. Carpetas nuevas bajo tests/.tmp, eliminadas solo después de verificar que su realpath permanece dentro de esa raíz. Sin cambios persistidos de fuentes/tests ni red.

## P2 · Referencias de índice omitidas generan falsos completos/match

`entryAssetPaths` solo reconoce valores entre comillas y busca src/href con un límite de palabra que también coincide dentro de data-src. Se reprodujeron:

```html
<script src=/assets/missing.js></script>
```

Resultado: referencias[], complete:true, files[index.html], verify.status=match; assets/missing.js no existe.

```html
<script data-src="/assets/present.js" src="/assets/missing.js"></script>
```

Con present.js existente y missing.js ausente: referencias[assets/present.js], complete:true y verify.status=match. El atributo data-src no sustituye al src real que carga el navegador. Esto no depende del grafo dinámico de imports: son referencias declarativas directas que la herramienta promete comprobar.

Los atributos HTML pueden tener valores sin comillas bajo las restricciones de sintaxis estándar; estos ejemplos de ruta no contienen caracteres prohibidos. [WHATWG, sintaxis de atributos](https://html.spec.whatwg.org/multipage/syntax.html#attributes-2). No se ejecutó un navegador para reproducir los fallos; se verificó la salida falsa de los módulos y la ausencia física del archivo.

Se pidió mediante board.revise tokenizar nombres/valores reales o rechazar de forma explícita las construcciones no soportadas, nunca ignorarlas y concluir completo. Añadir casos persistidos de atributo sin comillas y data-src antes de src, con controles positivos, y comprobar la ruta HTTP con transporte ficticio porque reutiliza el mismo extractor. No se exige añadir dependencias o un parser de todo HTML; se exige evitar un falso resultado de integridad.

## Dictamen y límites

Devolver para corregir REL033; mantener reservas del autor y cotejar nueva versión antes de aceptar. No se tocó un artefacto real ni se afirma que el frontend actual del piloto use estas construcciones: el defecto afecta al contrato de la herramienta de preflight. No es una autorización de publicación o un hallazgo de acceso remoto.

Pendientes: fuente corregida, regresiones causales y presentación nueva. No repetir pruebas de servicios/cuentas para resolverlo. Este informe se presenta para revisión de otro agente, sin autoaceptarlo.
