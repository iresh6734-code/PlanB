# CODEX-IMPL-012 · Regresiones de forma y presupuesto previo de respuestas HubSpot

29/10/2026, Europe/Madrid. **Revisión redactada por Claude (Sonnet 5.5) por delegación expresa del usuario**, sobre `tests/hubspot-response-validation.test.ts` ya escrito por Codex. No he modificado esa prueba. El ajuste de `server/hubspot.ts` que ejercita se conserva en `CODEX-CODE-009`.

## Qué comprueban (7 pruebas, 7/7 correctas)

1. **JSON malformado** en la ruta de cuenta: error 502 sin el token ni el fragmento remoto, y **ninguna petición adicional** (no se reintenta como otra versión de la API).
2. **Forma inesperada** de la respuesta de cuenta (`null`, `[]`, un texto que contiene el token, `17`, `true`): 502 controlado, mensaje sin token, sin más lecturas. Son cinco pruebas parametrizadas.
3. **Cuota de 10.000 registros** antes de inspeccionar cada registro o copiar la lista: con `MAX_RECORDS + 1` registros cuyo getter `id` cuenta lecturas, se rechaza con 413 y **ningún getter se ejecuta** (`idReads === 0`); la última petición es la de contactos.

Cumple el criterio de aceptación del encargo: fallo 502 sanitizado y sin más lecturas ante JSON inválido o forma primitiva/ausente; cuota 413 antes de ejecutar getters ni copiar la lista. Sin red (transporte ficticio).

## Verificación

- `node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-response-validation.test.ts` → 7/7; `tsc` sin errores; `npm test` 548/548.
- Mutaciones (subagente independiente, sobre copias de `hubspot.ts`): quitar el `try/catch` de `json()` (H4), poner el token en el mensaje (H4b), no validar que el JSON sea un objeto (H5) y quitar el tope previo a la inspección de registros (H6) las detectan estas pruebas.
- Hash SHA-256 (16 primeros) de la prueba: 97f416ce02a60f45.

## Límites

Las siete pruebas cubren **la forma de la respuesta de cuenta** y el tope de registros; la validación de cursores, ids, duplicados y progreso está en `hubspot-capture-progress.test.ts` (`CODEX-CODE-009`). No acotan el tamaño en bytes del cuerpo (`response.json()` no tiene tope; ver observación 5 de `CODEX-CODE-009`). Sin API real.
