# CLAUDE-SERVER-MODULES · Registro de módulos compartidos del servidor

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora B4 del informe, por orden del usuario. `server/main.ts` y `server/runtime.ts`, reservados por `CODEX-A4-SERVER-MOUNT-318`, se editaron con su autorización.

## Problema

Cada apartado nuevo obligaba a añadir imports y llamadas en `main.ts` **y** en `runtime.ts`, los dos archivos más disputados del tablón. En la práctica hubo choques entre las reservas 318, 324, las de Fable, las de Opus y la del Radar.

## Cambio

- `server/modules.ts` (nuevo) agrupa en `SHARED_MODULES` los **seis** montajes que hacen las dos entradas por igual: evidencia de continuidad, Radar, Ensayar mi semana, Comprobar una fecha, Revisar una decisión y resumen de trabajo. Cada módulo lleva una razón. Las dos entradas llaman una vez a `mountSharedModules(app, store)`.
- **Queda fuera a propósito:**
  - Lo exclusivo de la App completa (generador, proveedores de IA, conectores CRM, inspección de copia, relevo y copia de equipo). Sigue en `main.ts`, porque todo lo que importa `modules.ts` acaba en el paquete portátil.
  - `registerTaskIntents`, cuya prueba de puntos de entrada (318) instrumenta esa llamada literal en los dos archivos.
- Añadir un apartado compartido nuevo es añadir una fila en `modules.ts`.

## Archivos

| Archivo | SHA-256 |
| --- | --- |
| `server/modules.ts` (nuevo) | `11753d74…f1a2` |
| `tests/server-modules.test.ts` (nuevo) | `5906abb0…62d4` |
| `server/main.ts` (compartido: −6 imports y −7 llamadas, +1 import y +1 llamada) | antes `8d96ab2a…7980` · después `d2111047…f24f` |
| `server/runtime.ts` (compartido: igual) | antes `da85c305…0c82` · después `f37ef697…e48e3` |

## Verificación

- **Rutas idénticas.** `node tools/api/inventory.mjs --check` da «al día: 171 rutas». Cada entrada sirve exactamente las mismas rutas que antes, con el mismo archivo de origen.
- **`tests/server-modules.test.ts` 3/3:**
  - identificadores únicos y razón por módulo;
  - las dos entradas llaman una vez al registro y conservan la llamada literal de 318;
  - **el paquete portátil compilado con esbuild** no contiene ninguno de los nueve símbolos exclusivos ni los seis archivos de la App completa, y sí `modules.ts` y los módulos compartidos.

  Mutante: con un módulo exclusivo añadido al registro, esa prueba falla.
- **Pruebas que arrancan o compilan los dos puntos de entrada:** `task-intents-entrypoints` 10/10, `independent-copy-inspection-api` 16/16, `continuity-evidence-mount` 2/2, `independent-return-barriers` 164/164 y `task-revision-main` 1/1. `tsc` 0.

## Pendiente

- Codex debe volver a presentar 318 sobre las huellas nuevas de `main.ts` y `runtime.ts`.
- Si 318 cambia su prueba para no instrumentar la llamada literal, `registerTaskIntents` puede pasar al registro.
