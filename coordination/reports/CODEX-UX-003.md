# CODEX-UX-003 · Comparación de capturas ligada al contexto actual

29/10/2026, Europe/Madrid. Defecto encontrado por Codex al continuar la revisión UX: read ya usaba una revisión de vigencia, pero compare actualizaba diff, error y busy sin comprobar si habían cambiado empresa/contacto o la petición vigente.

Una comparación anterior podía mostrar cifras bajo la empresa nueva, atribuirle un error ajeno o desbloquear sus botones mientras otra lectura seguía pendiente. La corrección aplica a compare el mismo contador de revisión compartido con read y con el efecto de cambio de contexto. Se descartan resultado, error y finally antiguos. No cambia API, contenido de las capturas, permisos, estilos o consultas al proveedor.

## Evidencia de regresión

El arnés transpila el componente real con TypeScript y ejecuta sus callbacks, sustituyendo imports por slots mínimos de hooks, objetos JSX y transporte diferido. No copia la función compare ni prueba únicamente una implementación paralela. Las peticiones se resuelven manualmente para controlar el orden. No hay navegador o llamadas remotas.

El primer arnés tenía un error propio: un argumento por defecto en el recorrido de nodos volvía a la raíz al recibir undefined y agotaba la pila. Se corrigió antes de contar regresiones. Con ese arnés correcto y la fuente aún sin modificar, el control del mismo contexto pasó y cuatro regresiones fallaron en las aserciones esperadas: cifras anteriores visibles, error anterior visible, otra lectura interferida y escrituras tras desmontaje.

Con la guarda añadida, las cinco pruebas pasan: resultado/error/reintento normales; cambio de empresa con comparación nueva; cambio de contacto con lectura nueva; lectura más reciente en el mismo contexto; respuesta o error después de desmontar. Los tests comprueban también que el finally antiguo no quite busy a la petición vigente.

Comprobaciones finales:

    node --require ./scripts/block-external.cjs --import tsx --test tests/hubspot-context-ui.test.ts
    node node_modules/typescript/bin/tsc --noEmit
    node node_modules/vite/bin/vite.js build --outDir C:/Users/iresh/.codex/visualizations/2026/10/28/01a18458-630f-7b31-8a55-0d039532c943/ux003-build

**5/5 pruebas correctas, typecheck y build correctos.** Build separado del piloto; advertencias conocidas Rollup/Zod y destino externo no vaciado, sin error. No se repite la batería backend: no cambió código o contrato de servidor.

## Límites

El arnés controla un subconjunto de hooks para comprobar los callbacks y sus referencias; no es el reconciliador de React, React DOM, StrictMode, un navegador ni una comprobación visual/accesible. No se presenta como E2E. La petición antigua puede terminar en el backend: se evita aplicar su resultado al nuevo contexto, sin prometer cancelación de red. No se elude el navegador Work deshabilitado. Sin despliegue, reinicios, CRM/Google/Gmail/IFR, credenciales o nuevas fuentes enviadas a Claude.

## Hashes finales

- src/HubspotContext.tsx: 0c993d1f447236a3c9a3e14a7fe9b6421b7850e0522977623fd6b03a30538fa2

- tests/hubspot-context-ui.test.ts: a8a9b125d0037c2fd4b75a23882558c1a28c1c93a48c7a1c0a869551cd881859
