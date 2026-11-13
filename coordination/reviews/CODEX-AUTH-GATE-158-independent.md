# Revisión independiente · orden de autenticación 158

4/11/2026, Europe/Madrid. Dictamen: **aceptar 158 para el alcance revisado**. Los tres archivos de la entrega coincidían con los hashes presentados antes y después de la repetición. No se modificaron las rutas del autor.

## Hallazgo y corrección revisados

El autor reprodujo que respuestas antiguas de autenticación o de estado podían volver a mostrar en la interfaz datos en memoria después de un bloqueo más reciente, o volver a bloquear la interfaz tras una apertura posterior. Su evidencia comprueba un 401 del backend en las situaciones indicadas; no demuestra una evasión del backend. El cambio en `App.tsx` secuencia las consultas de acceso, invalida lecturas antiguas en el bloqueo y comprueba que una apertura siga vigente antes de mostrar la interfaz. Las peticiones no se cancelan físicamente y los datos en memoria no se borran.

## Comprobaciones propias

- **4/4 DOM Chromium**, repetición de los cuatro casos del autor en su proyección congelada `tests/.tmp/auth158-cbec1c48-8600-4441-b5fd-82c3ccd16328/source`: respuestas antiguas tras bloqueo por evento y botón, bloqueo anterior tras login posterior, y lectura de estado anterior tras un nuevo bloqueo. Se usaron App y servidor reales con SQLite en memoria y credenciales ficticias; red externa bloqueada. La evidencia propia está en `tests/.tmp/codex-auth-review159-20261104`. Los cuatro procesos de servidor propios quedaron observados ausentes.
- **15/15 Node**: repetición de `tests/auth-parent.test.ts` y `tests/protection-ui.test.ts` sobre el checkout actual.
- La proyección coincidía con **241/241** entradas de su manifiesto; frente al checkout solo difería `debug.log`. Se revisó el diff de App frente al corte 155 y los tres hashes de submit.
- Se inspeccionaron los resultados del autor: su baseline de 155 declara cuatro fallos y el corte corregido diez casos DOM favorables; sus tres casos heredados 072 también figuran favorables. Esas cifras y el contraste causal inicial son del autor: **no se ha repetido aquí el baseline ni los nueve casos adicionales**. Esta revisión repitió sus pruebas, no escribió cuatro pruebas nuevas independientes.

La aprobación comprende las intercalaciones revisadas en una instancia y no equivale a auditoría completa de autenticación, pruebas multipestaña, otros navegadores o lectores de pantalla. La preview 4594 se sirvió desde el corte 155 en su última comprobación; aceptar código 158 no acredita que la preview se haya actualizado ni que siga iniciada ahora. No se han usado proveedores ni datos reales.
