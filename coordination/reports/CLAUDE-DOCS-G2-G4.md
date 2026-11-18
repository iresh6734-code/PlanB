# CLAUDE-DOCS-G2-G4 · Historial de documentos, límite de informes y órdenes directas

**Autor:** Claude (Opus 5.5), sesión «planb-rendimiento» · **Fecha:** 18/11/2026, Europe/Madrid
**Origen:** mejoras G2, G3 y G4 de `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md`, por orden del usuario del 18/11.
**Archivos (nuevos):** `tools/coordination/report-size.mjs`, `tools/coordination/report-size.test.mjs`, `docs/protocolo-ordenes-directas.md` y este informe. **No se ha movido ni borrado nada.**

## G2 · Propuesta: qué pasa a `docs/historial/`

Inventario de los 31 `.md` de la raíz, con fecha y referencias desde otros archivos del repositorio. El punto clave es que **algunos documentos los empaqueta el código por nombre**, así que moverlos sin tocar el script rompería los paquetes:

- `scripts/package-demo.ts:24` copia `COMERCIAL-V2.md`, `PLAN-V0.3.md`, `ENSAYO-RETORNO-v0.3.0.md`, `IMPLEMENTACION-V2.md`, `AGENTS.md`, `CONTEXTO-PROYECTO.md`, `PRODUCT.md` y la guía `LEEME-<RELEASE_TAG>.md`;
- `server/exporter.ts:62` añade `LEEME-v0.6.0.md` (versión actual) al paquete exportado;
- `scripts/prepare-return-rehearsal.ts:30` menciona `LEEME-v0.3.0.md`.

| Grupo | Documentos | Propuesta |
| --- | --- | --- |
| **Mover ya** (solo los citan otros `.md` o paquetes antiguos de `delivery/`) | `LEEME-V2.md`, `LEEME-V2.1.md`, `LEEME-v0.4.0.md`, `LEEME-v0.5.0.md`, `ANALISIS-PROYECTO-2026-10-26.md`, `CONTEXTO-ARCHIVO-2026-10-29.md` (205 KB), `UX-ARQUITECTURA-0.6.md`, `MODELOS-TRABAJO.md` | `docs/historial/`, con una línea en un `docs/historial/LEEME.md` que diga qué era cada uno. Actualizar los enlaces de los `.md` que los citan |
| **Mover tras cambiar el script** | `PLAN-V0.3.md`, `ENSAYO-RETORNO-v0.3.0.md`, `IMPLEMENTACION-V2.md`, `COMERCIAL-V2.md`, `LEEME-v0.3.0.md` | Antes, quien tenga `scripts/package-demo.ts` y `scripts/prepare-return-rehearsal.ts` cambia las rutas, o decide que el paquete ya no los lleve |
| **Guías vigentes, fuera de la raíz** (decisión del usuario) | `GOOGLE-PILOTO-LOCAL.md`, `HUBSPOT-PORTAL-PERSONAL.md`, `INTEGRACIONES-PILOTO.md`, `AGENTE-IA-LOCAL.md`, `DOCUMENTOS-CLIENTE.md`, `FICHA-COMERCIAL.md`, `COPILOT-STUDIO.md` | `docs/guias/`. `COPILOT-STUDIO.md` describe un servicio corporativo hoy fuera de alcance: podría ir a historial |
| **Se quedan en la raíz** | `README.md`, `LEEME.md` (29 referencias), `LEEME-v0.6.0.md` (la empaqueta `exporter.ts`), `AGENTS.md`, `CLAUDE.md`, `COORDINACION.md`, `ESTADO.md`, `CONTEXTO-PROYECTO.md`, `PLAN-1.0.md`, `PRODUCT.md`, `DESIGN.md` | Puntos de entrada y reglas de los agentes |

Para ejecutarlo hace falta **un encargo de Codex**, que coordina `CONTEXTO-PROYECTO.md`, `PLAN-1.0.md` y los documentos comunes: mover con `git mv` para conservar el historial y actualizar los enlaces en la misma unidad.

**Aviso de alcance:** la búsqueda de referencias con `grep -r` recorrió también las carpetas de instalación `planb-local-*` y `planb-hubspot-*` de la raíz. Solo devolvió **nombres** de archivos (`runtime.mjs` y `server.mjs`, que llevan `LEEME-V2.1.md` empaquetado); no se abrió ni se leyó ningún dato. Las búsquedas siguientes se limitaron a `scripts/` y `server/`. Si se repite, conviene excluir `planb-*`, `data/` y `delivery/`.

## G3 · Límite de tamaño de informes: `tools/coordination/report-size.mjs`

Comprobación **independiente** de `board.mjs` y `core.mjs` (reservados por Codex en 346 y 376). Solo lee.

```bash
node tools/coordination/report-size.mjs                       # lista lo que supera 30 KB
node tools/coordination/report-size.mjs --task <ID> --check   # antes de submit: los .md de coordinación del encargo
node tools/coordination/report-size.mjs RUTA... --limit 40 --json
```

- Límite por defecto: **30 KB**, como proponía el informe. El borde exacto no cuenta como exceso.
- Revisa los `.md` de primer nivel de `coordination/reports` y `coordination/reviews`. Las subcarpetas, por ejemplo `coordination/reports/anexos/`, no cuentan: ahí van los anexos.
- `--task` lee los `files` del encargo en `board.json`. Un informe declarado que no existe **no** se da por bueno.
- Sin `--check` solo informa. Con `--check` sale con código 1 si algo supera el límite y con 2 si hay un error de uso.

**Hoy, sobre 562 informes y revisiones, 6 superan 30 KB:**

| KB | Informe |
| --- | --- |
| 537,7 | `CODEX-LAB-035.md` |
| 90,4 | `CLAUDE-FABLE-UI-GRAFITO.md` |
| 47,2 | `CLAUDE-HS-006-sonnet.md` |
| 41,8 | `CLAUDE-INFORME-MEJORAS-GEMINI-2026-11-13.md` |
| 37,2 | `CLAUDE-RESCUE-KIT-116.md` |
| 33,2 | `CLAUDE-UI-011-test-plan.md` |

Propuesta para Codex: aplicar `--check` solo a encargos nuevos, es decir, ejecutarlo dentro de `submit` cuando se libere `board.mjs`. Los seis antiguos no se tocan, salvo `CODEX-LAB-035.md` (538 KB, 18 veces el límite), que cuesta leer en cada revisión.

Pruebas: `node --test tools/coordination/report-size.test.mjs` → **3/3**, en carpetas temporales del sistema y sin tocar el tablón real.

## G4 · Protocolo de órdenes directas: `docs/protocolo-ordenes-directas.md`

Pone por escrito lo que ya se hacía a mano cuando el usuario ordena tocar archivos reservados por otro agente:

1. comprobar que la orden viene del usuario y su alcance;
2. ver las reservas;
3. tomar huellas y una copia de antes;
4. abrir un encargo de reconciliación;
5. avisar en el chat antes de editar;
6. hacer el cambio mínimo, conservando el trabajo sin presentar del dueño;
7. tomar huellas de después y avisar;
8. presentar, y que el dueño re-presente.

Incluye lo que una orden directa **no** autoriza y una plantilla JSON de encargo. La automatización que pedía el informe, abrir el encargo y avisar solos, exige tocar `board.mjs` y `core.mjs`. Por eso queda como propuesta de subcomando `reconcile` para Codex.

## Huellas (SHA-256)

| Archivo | Huella |
| --- | --- |
| `tools/coordination/report-size.mjs` | `8222d7dfa4c1cba5df4cd13858bbd493aecd13459c44ede959caeaba37dadf6c` |
| `tools/coordination/report-size.test.mjs` | `a32855507531165cb0f1db1698b3e838a9a4f20362db904782561c81d978b636` |
| `docs/protocolo-ordenes-directas.md` | `bd084be166819478cebbbe211ffa93eda5b1fc115fce41985f878def9cae8c2d` |
