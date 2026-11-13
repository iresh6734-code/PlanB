# Ensayo de relevo empaquetado (254) · cambios exactos para Codex

6/11/2026, Europe/Madrid. **`server/main.ts`, `package.json` y los scripts de candidata no se han editado** (los integra Codex). Esta unidad entrega el paquete del Kit, el módulo de registro y la prueba en carpeta nueva; el ejecutor 224 y la API 216 se consumen tal cual (en revisión).

## 1 · `server/main.ts` (UNA línea tras `mountHubspotReadCheck(app, store, security);`; la evidencia 239 ya está en `main`)
```ts
import { mountRelayRehearsal } from './relay-rehearsal-mount.js';
…
mountRelayRehearsal(app, store, security);            // registro único; sin paquete verificado NO registra nada (404 verdadero)
```
`mountRelayRehearsal` usa la autorización ORIGINAL (`security.captureAuthorization`), hereda sesión, Host y Origin de `createBaseApp`, toma la raíz de datos de `dirname(store.filename)` y busca el paquete en `PLANB_KIT_ROOT` o en `kit/` junto a la carpeta del servidor compilado (`<instalación>/build/server.mjs` → `<instalación>/kit`). Devuelve `{ mounted: true, … }` o `{ mounted: false, reason, detail }` (se registra en el log una línea, sin rutas sensibles ni secretos).

## 2 · Paquete en la candidata
```
node scripts/build-relay-kit.mjs <instalación>/kit      # carpeta vacía o inexistente
```
Genera `server/` (sin `team`), `shared/`, los cuatro scripts del Kit, `package.json`, **`node_modules` con la clausura mínima** (`tsx`, `zod`, `fastify`, `@fastify/static` y sus dependencias: ~100 paquetes, ~43 MiB, incluido el binario nativo de esbuild de la plataforma) y `kit-manifest.json` (hash de cada archivo de código, plataforma/arquitectura/Node y resumen de `node_modules`). Se verifica en cada arranque (`verifyRelayKit`): archivo cambiado, sobrante o faltante, cargador ausente, dependencias distintas o plataforma/Node distintos ⇒ no se registra el ensayo.
Layout comprobado de la instalación: `build/server.mjs`, `dist/`, `kit/`, `data/` (más lo que ya traiga la candidata). **Prueba de aislamiento:** el servidor puede ir empaquetado en un solo archivo (esbuild sin `packages: external`) y arrancó en una carpeta fuera del repositorio sin `node_modules` propio; el Kit usa el suyo.
Decisiones de Codex: si el paquete va en la candidata como carpeta (esto) o se empaqueta el hijo y el destino con esbuild (exigiría tocar `openDestination` de 116: no hecho); inclusión de `kit/` en el manifiesto de fuentes y activos de la candidata; si se acepta que `tsx` sea una dependencia de ejecución del paquete.

## 3 · Raíz, cuota y retención (ya en 224; sin cambios)
`<data>/relay-rehearsals/run-<uuid>`: carpeta nueva y marcada por ejecución, 256 MiB en total / 64 MiB por ejecución, 3 parciales conservados 24 h, un completado retira su carpeta. El navegador no elige rutas. Solo se barren carpetas con marca verificable y la raíz se revalida por destino real antes de escribir o borrar.

## 4 · Pendiente
1. Exponer `executor.closure()` (cierre sin verificar) en el estado público de 216.
2. Línea de registro de evidencia (239) y orden de las dos.
3. Verificación POSIX (hoy solo Windows).

## R2 (6/11/2026) · integridad por contenido, uniones y obligatorias (dictamen 268) y arnés sobre 263
- **Manifiesto v2** (`planb-relay-kit-v2`): el resumen de `node_modules` vincula los BYTES (lista determinista «ruta:tamaño:SHA-256» de cada archivo, 3.515 archivos / 34.069.149 bytes en el paquete real). Un cambio del mismo tamaño en `tsx/package.json` deja la ruta sin registrar. Un manifiesto v1 se rechaza con «versión anterior: reconstruye el paquete con scripts/build-relay-kit.mjs».
- **Verificador** (`verifyRelayKit`): la propia raíz y cada entrada de primer nivel se comprueban con `lstat` ANTES de recorrer lo que hay dentro; uniones/enlaces y tipos distintos de archivo regular se rechazan en cualquier nivel (con contenido idéntico también); el conjunto de entradas es exactamente el esperado; los cuatro scripts de entrada y el cargador (`tsx/package.json` y `tsx/dist`) deben estar completos.
- **Constructor**: una dependencia obligatoria (`dependencies`) ausente, o resuelta fuera de `<repo>/node_modules`, lanza ANTES de escribir; no se publica manifiesto ni queda una carpeta a medias. Las opcionales (otra plataforma, `fsevents`) pueden faltar y se registran en `optionalMissing`. El manifiesto se escribe el último.
- **Arnés** (`tests/e2e/relay-packaged.spec.ts`): ya no parchea `App.tsx` (263 integra la navegación 260; la prueba lo comprueba) ni vuelve a registrar la evidencia (239 en `main`); proyecta SOLO la línea del relevo. Añade el caso «paquete ausente / alterado (mismo tamaño) / carpeta enlazada con contenido idéntico ⇒ 404 y el resto de la App sigue; íntegro ⇒ 200». **API del ensayo usada: 216 R4.**
- **Pendiente (sin cambios):** el registro en `main` y la integración final los hace Codex (CODEX-OPERATIONS-RELAY-MOUNT) tras aceptar 216 y 254; la firma de un paquete y la revisión final de integración se tratan aparte del cotejo local de bytes.
