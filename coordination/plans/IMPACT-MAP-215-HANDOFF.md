# Mapa de impacto y resumen de turno (215) · traspaso para el montaje

5/11/2026, Europe/Madrid. Estado: **modelo y componente probados con entradas explícitas; NO montado en ninguna pantalla.** El consumidor (propuesta: Continuidad, junto al pasaporte 214) es una unidad aparte con reserva propia; `App.tsx`, `ContinuityHome.tsx` y `LocalIntegrations.tsx` quedan fuera.

## Qué hay
- `shared/impact-map.ts`: `buildImpactMap(inputs)` (puro), adaptadores `queueInput(ResponseQueue)` y `comparisonInput(CaptureComparison, {fromAt,toAt})`, `impactExport`/`impactToJson`/`impactToHtml` (lista blanca), `safeLocalLink`.
- `src/ImpactMap.tsx` + `src/impact-map.css`: `<ImpactMap map onAction? onDownload? />` (sin red; la descarga es manual).

## Entradas (cada fuente: `status` read/unavailable/not-provided, `at` y `context`)
`copy` (evidencia de continuidad, API aceptada) · `inventory` (recuentos por entidad de la copia activa; p. ej. de `reconciliation.counts` o del resumen de inspección) · `comparison` (`compareCaptures`) · `queue` (`buildResponseQueue`; las referencias `available:false` de sus ítems alimentan «referencias sin comprobar») · `work` (resumen mínimo del cuaderno; mismo tipo que el pasaporte) · `hubspot` (GET de 212, sin tráfico) · `relay` (ensayo del Kit). **Regla de contexto:** el consumidor pasa `expectedContext` (identidad de la captura activa en SU notación) y cada fuente trae `context`; una fuente de otra captura se excluye y se declara («datos de otra copia»), no se mezcla.

## Montaje (cambio preciso)
Cargar las fuentes de forma independiente (una que falle no borra las otras), construir con `buildImpactMap` y renderizar `<ImpactMap map onAction={...}/>`. `onAction` mapea a superficies existentes (`open-today`, `open-integrations`, `open-export`, `open-preparation`, `open-continuity`, `start-rehearsal`); si una no existe, no pasar `onAction` (el componente solo explica). La exportación breve acepta `evidenceLink` relativo (`#/continuidad`); una URL o ruta del equipo se descarta.

## Garantías (probadas) y límites
- Referencia a un registro que la copia no contiene = «sin comprobar»; jamás «borrado del CRM». Cero observado ≠ desconocido. Ninguna fila problemática queda sin acción ni explicación («Falta: …»). Orden por urgencia (bloquea > atención > sin comprobar > sin incidencia; dentro: guardados por comprobar antes que vencidas). Resumen de turno solo con cifras acreditadas y la decisión urgente primero; siempre termina con lo no demostrado (otro equipo, tiempos, autoría).
- **No acredita** el estado actual del CRM (la cobertura es lo que contiene la captura), recuperación en otro equipo ni tiempos. La cola solo cubre lo devuelto (`sampleTruncated`). Sin consumidor montado.

## R2 (6/11/2026)
- La lectura de HubSpot, su fila, acción, resumen y exportación usan la **vigencia efectiva** (`readWindow` del pasaporte 214 con el reloj del mapa); el consumidor debe regenerar el mapa al avanzar el reloj (ContinuityHub 217 lo hace sin pedir nada al proveedor).
- El ensayo de relevo tiene un dictamen único. Un registro con `scope: 'fiction'` va en su propia fila `recovery:practice` (sin contexto, sin acción si está completado) y no acredita la copia activa; sin `scope` ni `captureId` es «alcance desconocido»; con otra captura, «datos de otra copia»; solo con `captureId` = captura activa cuenta como ensayo de esa copia. El consumidor pasa `relay` con el `captureId` que traiga el registro, sin rellenarlo.
- Sigue sin montaje propio: lo consume `src/ContinuityHub.tsx`.
