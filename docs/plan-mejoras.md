# Plan de mejoras de Plan B

Análisis del 19/11/2026 sobre la rama `planb-v0.3-local`. Se ha hecho leyendo el código, sin servidores, sin pruebas de navegador y sin datos reales. Las referencias a archivos y líneas corresponden a esa fecha.

## Normas para trabajar sin alertas corporativas

- No ejecutar nada que llame a DPAPI ni a PowerShell (`ProtectedData`, `Get-CimInstance`): `server/crypto.ts` fuera del modo de prueba, servidores demo, la batería de Playwright, `tools/preview` ni las pruebas `relay-packaged` / `portable-lifecycle`.
- Validar solo con pruebas unitarias en modo prueba (`npx tsx --require ./tests/setup-unit-env.cjs --test tests/X.test.ts`) y `npm run build`.
- No tocar `data/`, `planb-local-*`, `.env*` ni claves. Lo que se guarde en el navegador son identificadores o preferencias, nunca contenido de registros.
- En exportación, inspección de copias y protección, cambiar solo la presentación; nunca el cifrado ni la contraseña.
- Al acabar cada sesión: commit y push a `origin/planb-v0.3-local`.

## Hecho en esta sesión

| Mejora | Dónde |
|---|---|
| La paleta de órdenes (Ctrl J) muestra arriba las 4 últimas órdenes usadas. Guarda solo los identificadores de las órdenes, nunca los registros abiertos. | `app-shell/commands.ts`, `CommandPalette.tsx` |
| Cuando un filtro o una vista inteligente oculta todas las filas, ya no aparece «Todavía no hay registros». Ahora dice «Ningún registro con este filtro» y ofrece «Quitar filtros». | `app-shell/RecordsPage.tsx` |
| Al exportar a CSV solo una página, aparece un aviso con cuántos registros contiene y cuántos hay en total. | `RecordsPage.tsx` |
| La paginación usa `RECORD_PAGE_SIZE` en lugar de un 50 escrito a mano. | `RecordsPage.tsx` |
| Una sola regla de «vencida»: Hoy y «Despachar vencidas» usan el mismo día de Madrid, también cuando la fecha incluye hora. | `task-display.ts` (`dueDay`), `app-shell/focus.ts` |
| «Despachar vencidas» permite posponer al próximo lunes, además de a mañana (tecla L). | `FocusRun.tsx`, `focus.ts` (`nextMonday`) |
| Continuidad y Cambios dejan de consultar el estado cada 2,5 s mientras la pestaña está oculta, y lo leen al momento al volver a ella. | `app-shell/poll.ts`, `ContinuityHome.tsx`, `ChangesView.tsx` |
| (1) Los avisos de éxito del desplegable de la tabla, de mover en el tablero y de «Mañana» llevan un botón «Deshacer» (mismo deshacer de 8 s que el aviso global). | `RecordsPage.tsx`, `App.tsx` |
| (5) El desplegable de la tabla guarda al elegir con el ratón, pero con el teclado las flechas y las letras solo recorren: Intro o salir del campo guarda, Escape lo revierte. Se marca con borde discontinuo mientras está pendiente. | `app-shell/InlineSelect.tsx` |
| (17) «N cambios» es un botón propio en la barra superior que abre Cambios (sin la palabra en móvil), y el menú móvil muestra el número en «Continuidad». | `TopBar.tsx`, `MobileNav.tsx`, `cuaderno.css` |
| (20) Si falla una lectura periódica de Continuidad, aparece «No se pudo actualizar. Lo que ves es la lectura de hace X», que desaparece al recuperarse. Cambios ya mostraba su error. `/v6/workspace` sigue en silencio a propósito: solo activa un acceso opcional y un 404 es normal sin espacio de equipo. | `app-shell/poll.ts` (`useReadHealth`, `staleReadNote`), `ContinuityHome.tsx` |
| (7) Vistas inteligentes de oportunidades: «Cierre pasado», «Cierran esta semana» y «Sin fecha de cierre», solo con etapas abiertas y si hay un campo de fecha de cierre. Las vistas «Vencidas» y «Para hoy» de tareas usan ahora el día de Madrid (`dueDay`). | `app-shell/saved-views.ts` |
| (10) Barrido de la mañana: «Despachar» puede incluir las tareas que vencen hoy (selector antes de empezar, orden «Barrido de la mañana» en Ctrl J). La tarjeta marca «Vence hoy». | `focus.ts` (`pendingTasks`), `FocusRun.tsx`, `App.tsx` |
| (8) Importar CSV avisa de posibles duplicados (mismo nombre, o mismo sitio web en empresas) frente a la copia y a filas anteriores del archivo. No bloquea: la casilla «Omitir los posibles duplicados» los descarta al importar, con la misma marca de la vista previa. | `shared/csv-import.ts` (`duplicateWarnings`), `server/csv-import.ts`, `CsvImport.tsx` |
| (6) Confirmación dentro de la propia ventana (`InlineConfirm`) en lugar del `confirm()` del navegador al cerrar la importación con vista previa y al abrir un registro relacionado con cambios sin guardar. En `CustomerDossier`, `CommercialWorkspace` y `TeamApp` se mantiene el `confirm()`: sus pruebas (unitarias y e2e) dependen del diálogo nativo. | `ui/index.tsx`, `CsvImport.tsx`, `app-shell/RelatedPanel.tsx` |
| (14) Nombres, grupos y tonos de las tareas de Hoy en una sola tabla (`TASK_BUCKETS`), usada por la lista de Hoy y las etiquetas. Los textos no cambian. | `task-display.ts`, `LocalOperations.tsx` |
| (12) Atajos `G D` (despachar vencidas) y `G B` (barrido de la mañana), también en la ayuda «?». | `app-shell/useShortcuts.ts`, `App.tsx` |
| (22) «Parte para compartir» explica debajo, a la vista, qué contiene (antes solo en el `title`). | `ContinuityHome.tsx`, `faro.css` |
| Continuidad · Estado: franja de preparación (veredicto, «n de 5», cinco trazos y siguiente paso con botón que lo ejecuta), regla de seis constantes de la copia y «Si HubSpot cae ahora», que dice línea a línea qué tendrías (antigüedad, clientes/empresas/oportunidades/tareas, prueba, copia fuera del PC, cambios sin devolver). Cada paso de la preparación explica su estado. | `app-shell/continuity-insights.ts`, `ContinuityHome.tsx`, `continuity-insights.css` |
| Continuidad · Copias: regla de las últimas 24 horas y libro de capturas agrupado por día, con filtros (Todas, Hoy, 7 días, Más pequeñas), variación de tamaño respecto a la anterior, aviso cuando encoge más del 15 % y «Mostrar N más» en lugar del corte fijo a 12. | `continuity-insights.ts` (`hourlyCaptures`, `captureLedger`), `ContinuityHome.tsx` |
| Continuidad · Operaciones: «Fiabilidad de los procesos» con el porcentaje correcto por capturas, simulacros y devoluciones y el último fallo de cada uno (los cancelados no cuentan). | `continuity-insights.ts` (`jobStats`), `ContinuityHome.tsx` |

(11) No se hace: la jornada es en memoria por decisión revisada (recargar o salir de Hoy la descarta, con barreras de identidad de la copia). Guardarla exigiría rediseñar esas barreras.

## Mejoras de lo que ya existe

Esfuerzo: S = pequeño, M = medio, L = grande. «Interfaz» = solo cambia la interfaz; «servidor» = necesita cambios en la API.

### Vender: listas, tablero y fichas

1. **Deshacer en el aviso tras un cambio rápido** (desplegable en la tabla, mover en el tablero, «Mañana»). El servidor ya devuelve el id del cambio. S, interfaz.
2. **Tablero con todas las oportunidades del proceso.** Hoy solo usa la página cargada de 50, así que los totales por etapa engañan. Hay que reutilizar la lectura por páginas de `focus.ts`. M, interfaz.
3. **Orden y filtro en el servidor** (`sort=`, `campo=valor`), para que los recuentos y el orden cubran todos los registros. M, servidor.
4. **Selección múltiple con cambio en bloque** de etapa, responsable, estado o fecha. M, interfaz (un guardado por registro).
5. **El desplegable de la tabla guarda solo al confirmar.** Con el teclado, recorrer las opciones con las flechas puede guardar sin querer. S, interfaz.
6. **Cambiar los `confirm()` del navegador por el Modal de la app** en `RelatedPanel`, `CustomerDossier`, `CommercialWorkspace` y `CsvImport`. S, interfaz.
7. **Vista inteligente «Sin próximo paso / parada».** Usaría `deal-insights.ts` y `saved-views.ts`. S, interfaz.
8. **Duplicados** (correo, nombre de empresa) en el panel de calidad y en la vista previa del CSV. M, interfaz primero.

### El día: Hoy, Inicio y tareas

9. **Botones Hecha / Posponer ▾ en cada fila de Hoy**, sin tener que abrir la tarea. M, interfaz.
10. **«Despachar» que incluya también las próximas 24 h**, como barrido de la mañana. S, interfaz.
11. **Guardar el plan de «Organizar mi jornada» por día** en el navegador. Solo identificadores y minutos; hoy se pierde al recargar. S–M, interfaz.
12. **Atajos nuevos:** `G D` para Despachar, `G J` para la jornada, y `H` / `P` sobre la fila enfocada de Hoy. S, interfaz.
13. **Crear un seguimiento al completar una tarea** (`task-preset.ts`). M, interfaz.
14. **Un solo mapa de etiquetas de grupo**, que hoy está repetido en `LocalOperations.tsx` y `task-display.ts`. S, interfaz.
15. **Accesibilidad de la cola:** semántica de tabla real y progreso anunciado en «Despachar». S, interfaz.

### Continuidad y devolución

16. **Un único panel «¿Puedo fiarme de mi copia?»** con la antigüedad, los recuentos por objeto, el último simulacro y la última devolución, en verde, ámbar o rojo. Reúne lo que hoy está en ocho pantallas. M, interfaz.
17. **«N cambios por devolver» también en la barra superior y en el menú móvil.** El menú lateral ya lo muestra. S, interfaz.
18. **Asistente de devolución por pasos:** revisar → conflictos → diferencia final → enviar o hacerlo a mano → justificante. Sustituye al `<details>` plegado. M, interfaz.
19. **Lista de comprobación imprimible en la recuperación manual,** con el progreso de cada cambio. S, interfaz.
20. **Avisar de los errores de lectura que hoy se tragan** (`catch(()=>{})` en `ContinuityHome` y en `/v6/workspace`), con el texto «última lectura hace X». S, interfaz.
21. **Dividir `App.tsx`** (20 `useState`, 15 `useEffect`) en contextos, y cargar más tarde `Protection`, `CsvImport` y `HomeOverview`. M, interfaz.
22. **Explicar «Parte para compartir» con texto visible,** no solo en `title`. S, interfaz.

## Funciones nuevas propuestas

| # | Función | Para qué | Esfuerzo | Alcance |
|---|---|---|---|---|
| N1 | **Revisión semanal**: hechas, pospuestas, aún vencidas y seguimientos sin fecha | Cerrar la semana con un vistazo | M–L | Necesita una lectura en el servidor |
| N2 | **Registrar actividad rápida** (llamada, nota, siguiente tarea) desde la ficha y desde la tarjeta | Anotar sin abrir formularios | M | Interfaz, más servidor si hace falta un tipo nuevo |
| N3 | **Comprobar la devolución**: releer HubSpot después de devolver y casar cada cambio | Demostrar que el CRM recibió los cambios | M | Servidor, solo lectura |
| N4 | **Simulacro de 5 minutos que termina generando el pasaporte** | Convertir el ensayo en evidencia | M | Interfaz |
| N5 | **Línea de tiempo de diferencias entre copias** (altas, cambios, bajas) | Detectar pérdidas de datos | M | Interfaz, sobre la comparación existente |
| N6 | **Recordatorio dentro de la app** cuando una tarea vence durante la sesión | Avisar sin notificaciones externas | S–M | Interfaz |
| N7 | **Vistas guardadas en la copia local**, en lugar del navegador | Tener las mismas vistas en los dos ordenadores | S–M | Servidor, datos sin cifrar |
| N8 | **Archivar con deshacer** | Limpiar duplicados tras importar | M | Servidor; antes, revisar cómo afecta a la devolución a HubSpot |

## Orden recomendado

1. Seguridad y confianza inmediatas: 1, 5, 17 y 20.
2. Trabajo diario más rápido: 9, 12, 10 y 11.
3. Datos correctos en grande: 2 y 3.
4. Confianza en la continuidad: 16, 18 y 19.
5. Funciones nuevas, empezando por N1 y N2.
