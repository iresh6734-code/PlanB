# CLAUDE-UI-STATES-D3 · Error con qué hacer y límite de error en los apartados diferidos

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora D3 del informe, por orden del usuario. `src/App.tsx` y `src/faro.css` se editaron con su autorización.

## Qué había

- **Cargando** y **vacío** ya tenían piezas comunes (`Skeleton` y `EmptyState`, de la fase 0 de Faro).
- **El error no las tenía.** La lista de registros decía «vuelve a seleccionar la sección», sin botón.
- **Los apartados que se descargan al visitarlos no tenían límite de error.** Si su archivo no llegaba (servidor local cerrado o, lo más habitual, una pestaña abierta antes de un despliegue nuevo que cambió esos archivos), React tiraba **toda la App**.

## Cambio

- **`src/ui/index.tsx`:**
  - `ErrorState`: alerta con qué pasó, la tranquilidad de que los datos siguen ahí y una acción;
  - `PageErrorBoundary`: si un apartado falla al cargar o al pintarse, enseña el error en su sitio con «Recargar la página» y el resto de la App sigue funcionando. Registra el detalle en la consola.
- **`src/app-shell/lazy-pages.tsx`:** los once apartados diferidos pasan por el límite de error, con el nombre del apartado en el aviso («No se pudo abrir Cambios»).
- **`src/app-shell/RecordsPage.tsx`:** el error de la lista usa `ErrorState` con **Reintentar**, que vuelve a pedir la página (`App.tsx` pasa `onRetry`).
- **`src/faro.css`:** estilo `ui-error`.

| Archivo | SHA-256 |
| --- | --- |
| `src/ui/index.tsx` | antes `ed841b63…0533` · después `c73eb775…cca0` |
| `src/app-shell/lazy-pages.tsx` | antes `9bf3d493…78cb` · después `ad1e31ed…df79` |
| `src/app-shell/RecordsPage.tsx` | antes `466469df…414d` · después `6ce2c2a1…ae4d` |
| `tests/ui-states.test.ts` (nuevo) | `ca95686e…e2` |
| `src/App.tsx` (compartido) | antes `87d2c1e9…e310` · después `38288b0f…296` |
| `src/faro.css` (compartido) | antes `27b42db5…cd` · después `8a4ab10a…cec` |

## Verificación

- `tests/ui-states.test.ts` **3/3**:
  - `ErrorState`: alerta, botón solo con acción y etiqueta propia;
  - `PageErrorBoundary`: deja pasar su contenido y, tras un error, muestra «No se pudo abrir…» con «Recargar la página», o «Reintentar» si recibe `onRetry`;
  - comprobación de que todos los apartados diferidos pasan por el límite y de que la lista ofrece reintentar.
- `ui-kit` 6/6 (9/9 juntas), `ui-journeys` 60/60, `auth-parent` 4/4, `independent-interface-contexts` 47/47, `design-tokens` 10/10 y `record-list` 3/3. `tsc` 0.
- **Navegador, provocando los fallos de verdad** (ensayo aislado):
  - con el archivo de Cambios bloqueado, `/continuidad/cambios` muestra «No se pudo abrir Cambios…» con «Recargar la página». El menú sigue funcionando e Inicio se abre después con normalidad;
  - con la petición de clientes bloqueada, la lista muestra «No se pudieron cargar los registros…» con Reintentar; al dejarla pasar y pulsar Reintentar aparecen las 24 filas.

## Límites

- «Sin permiso» no tiene pieza propia: la App local tiene un solo operador y la falta de sesión ya la gestiona `Protection`. Queda para `/team`, que sí tiene roles.
- Otros apartados siguen mostrando sus errores con su propio estilo. Unificarlos se hará al pasar cada uno al sistema de estilos único (B3).
