# 275 · Estimaciones de Jornada por ID exacto

7/11/2026, 10:58:56, Europe/Madrid. Corrección del hallazgo separado comunicado por la autora del adaptador A3.

## Problema y cambio

ContinuityDay copiaba estimates y asignaba next[id] = value. Un ID válido __proto__ activaba el setter heredado en vez de crear una estimación numérica propia: declarar10 minutos dejaba cero tareas elegidas. La actualización funcional ahora usa propiedad calculada { ...previous, [id]: value }; al borrar conserva la copia y retira solo la entrada exacta. No hay cambios de contrato, presupuesto, orden, persistencia ni red.

## Contraste causal y validación

Corte tests/.tmp/day275-3OGC5F, fuentes base263 cotejadas con modelo205 aceptado. El componente anterior tiene SHA9003c19f51df79f3aa6c4303e2312207c87ced9b41f715c14accfd864e20e73d. Baseline navegador2/3: constructor y toString pasan; __proto__ falla exactamente al esperar una tarea de10minutos y recibir0. Los tres casos nuevos declaran, actualizan, añaden otra tarea, borran la estimación original y la vuelven a declarar; comprueban ID, totales, preservación de la otra y cero fetch/callbacks.

Corregido: Chromium19/19 sin reintentos (tres nuevos y16 existentes), Node22/22 del modelo y tipos focales limpios. Incluye teclado/foco, impresión, homónimas, presupuesto, duraciones desconocidas y anchos1440/390/320 sin desbordamiento. Se abrió e inspeccionó day-320.png. Recibos baseline-result.json y corrected-result.json, logs de fases y manifiesto de fuentes en esa raíz. El proceso de pruebas terminó con código0. No queda un servidor permanente de esta prueba.

## Preparaciones excluidas

El primer intento day275-2UpXPH no llegó al navegador por usar una configuración JSON sin atributo de importación. El siguiente day275-voeCyT no localizó los controles por nombre accesible y agotó su plazo: esos fallos no acreditan el defecto. Se cambió el localizador de prueba al atributo del ID exacto, con comprobación previa del escenario, y se repitió el contraste completo con las mismas aserciones de comportamiento. La reproducción válida es exclusivamente3OGC5F.

## Límites y siguiente paso

Componente compilado aislado con callbacks espía, no App ni montaje en Hoy. No se usaron proveedores, datos reales ni instalaciones anteriores. Presentada para revisión independiente, sin autoaceptación. El montaje de Jornada debe consumir el adaptador A3 ya aceptado y esta corrección cuando se acepte.

## Huellas probadas

- src/ContinuityDay.tsx: 81740fa99ac76f6c7e5ccea45daa08174dd3ddeed5c4ea91908038a8d0760687
- tests/e2e/continuity-day.spec.ts: 73ead1ee9c1da1b91b574ed3eab891bd2eb136501e452037b1bd01d30b81a7a4
