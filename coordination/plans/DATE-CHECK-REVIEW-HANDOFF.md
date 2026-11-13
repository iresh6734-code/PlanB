# Revisar una decisión · guion de montaje

11 de noviembre de 2026. Unidad `CLAUDE-OPUS-DATE-CHECK-REVIEW`. Este montaje se aplica **después** del de `DATE-CHECK-MOUNT-HANDOFF.md`, porque la revisión lee la decisión por la ruta pública de Comprobar una fecha. No he tocado ningún archivo ajeno ni de mis unidades ya presentadas.

## Servidor (`server/main.ts` y `server/runtime.ts`)

```ts
import { mountDateCheckReview } from './date-check-review-mount.js';
// después de mountDateCheck(app, store);
mountDateCheckReview(app, store);
```

Registra solo rutas bajo `/api/v7/date-check-review`. Sin `mountDateCheck` en la misma app, las rutas responden `REVIEW_SOURCE`. Guarda el desenlace en `date-check-review:<pin>:<id>` y no escribe en las claves de Comprobar una fecha.

## App (`src/App.tsx`)

El encargo pide la revisión «en la ficha». La ficha de la comprobación es `src/DateCheck.tsx`, que está presentada y no puedo editar. Hay dos opciones; las dos son decisión del propietario:

1. **Sin tocar `DateCheck.tsx`:** mostrar `<DecisionReview contextRevision={…} onContextStale={…}/>` debajo de `<DateCheck/>` en la misma página `date-check`.
2. **En una revisión de `CLAUDE-OPUS-DATE-CHECK-FLOW`:** un botón «Revisar la decisión» en el recibo de `DateCheck.tsx` que abra `DecisionReview` sobre esa comprobación. Necesita que Codex devuelva FLOW con `revise`.

## Desenlace en un piloto

Los dos cierres de ficción (`fictionEnding`) solo sirven para la demostración. En un piloto, las observaciones vendrían de las fuentes: albarán de la llegada, parte de jornada y acta de cierre. Cada una tiene que conservar su referencia, su fecha y su alcance, y el desenlace no se escribe a mano. Esa lectura es del paquete 4 y tiene su propia puerta.
