# Misión maestra · Trabajo en paralelo de Claude (ordenador de `D:\AI\Plan-B-CRM-v2.1`)

Archivo propio para no chocar con `registro-colaboracion.md`, que edita el agente del otro ordenador. Cuando convenga, se puede pasar su contenido a ese registro.

**Regla de convivencia.** Mientras el otro agente sigue la lista «Siguiente, en este orden» de `00-LEEME.md`, Claude no toca:

- Cambios (`ChangesView.tsx`);
- el menú (`navigation.ts`, `Sidebar.tsx`);
- Hoy y Agenda;
- las listas (`RecordsPage.tsx`);
- la limpieza A0-L;
- `consola.css` y `faro.css`;
- `00-LEEME.md` y `registro-colaboracion.md`.

## 21/11/2026 · A4 Paquete de vuelta: motor y ruta (sin interfaz)

**Qué resuelve.** En producción Plan B solo lee HubSpot: la devolución automática está bloqueada a propósito (`server/recovery.ts`, `preview` → 403). Tras una caída, el trabajo hecho en la copia tiene que volver al CRM de forma revisable. El paquete convierte los cambios pendientes en CSV con el formato de importación de HubSpot, más un informe de lo que no entra y por qué.

**Qué hay:**

- **`shared/return-package.ts`**, lógica pura:
  - `buildReturnPackage`, `csvCell` y `pendingByRecord`.
  - Un CSV por objeto y tipo: `plan-b-vuelta-<objeto>-actualizar.csv` con `Record ID`, y `…-crear.csv` sin ID.
  - Solo entran los cambios posteriores a la marca de devolución, varias ediciones de un registro en una sola fila.
- **`server/return-package-api.ts`**: `POST /api/v3/return-package`, registrada en `server/v2.ts` (una línea, salvo en el paquete independiente).
  - Con `readHubspot: true` (por defecto) lee HubSpot con la conexión del mismo portal y detecta conflictos.
  - Máximo 500 lecturas por paquete, con lectura en modo solo lectura en producción.
  - Sin conexión responde 422 y no inventa la comprobación.
  - Con `readHubspot: false` genera el paquete y avisa de que no se han comprobado conflictos.

**Garantías** (las pide la revisión cruzada de Copilot):

| Garantía | Cómo |
| --- | --- |
| Identidad congelada | Portal, captura, revisión local y tramo de cambios van en el paquete. La revisión es la misma que exige `/api/v3/manual-recovery/verify` (probado) |
| Nada se da por devuelto | Generar no escribe en HubSpot ni en la copia, ni mueve la marca (probado). El resumen manda a comprobar por relectura |
| Conflictos | Campo cambiado en los dos lados → fuera del CSV y en el informe con base, copia y HubSpot. Lo ya igual no se importa. Lo ausente o archivado no se recrea |
| Vacíos | Vaciar un campo no se puede con una celda vacía (la importación la ignora) → fuera e informado |
| Relaciones y solo lectura | Fuera. Las relaciones se informan para revisarlas a mano |
| IDs | Solo ID numérico canónico (del registro o del mapeo confirmado). Si no, fuera e informado |
| Fórmulas | Celdas que empiezan por `=`, `@`, tabulador o retorno, o por `+`/`-` seguido de algo que no es un número, llevan un apóstrofo delante y se listan. Teléfonos `+34…` e importes negativos intactos |

**Comprobación:**

- `tests/return-package.test.ts` 7/7 y `tests/return-package-api.test.ts` 2/2.
- Tres mutaciones (sin conflictos, sin protección de fórmulas, sin vaciados) hacen fallar una prueba cada una.
- `tsc` sin errores.
- `docs/api.md` regenerado (183 rutas; ya le faltaban 11 de otros cambios) y `api-client-routes` al día.
- Pruebas de devolución y recuperación manual en verde.

**Límites, dicho claro:**

- **No probado contra un HubSpot real.** Falta validar en un portal de prueba o sandbox que la importación mapea las columnas por nombre interno, los formatos de fecha y las casillas múltiples con `;`. Necesita autorización de la usuaria; no se hace en el otro ordenador.
- **Sin interfaz todavía.** El botón «Descargar paquete de vuelta» y la vista del informe van en **Cambios**, que ahora es del otro agente (B4.3). Propuesta: cuando termine B4.3, lo anota en el registro y uno de los dos lo monta. El contrato es la respuesta de la ruta (`files[].csv`, `skipped[]`, `summary[]`, `identity`).
- Después de importar, la vuelta se acredita con la comprobación manual existente. A10-1 (unir el parte de incidente con la vuelta) sigue pendiente.
