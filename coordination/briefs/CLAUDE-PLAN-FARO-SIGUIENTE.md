# Plan B · siguiente plan de producto y diseño («Faro 2»)

Redactado por Claude el 11/11/2026 a petición del usuario. Es una propuesta: nada de esto está empezado. Parte del estado desplegado en el CRM 4331 a las 16:07 (identidad Faro, tercera pasada).

## Punto de partida, sin adornos

Lo que hay hoy funciona y tiene identidad, pero está construido encima de deuda:

- **Estilos:** diez hojas globales apiladas (unos 309 KB de CSS en ~55 archivos). La capa Faro gana a las anteriores a base de especificidad (`html body …`) y varios `!important`. Cada cambio visual nuevo cuesta más que el anterior.
- **Estructura:** `App.tsx` reúne navegación, atajos, registros, tablero y modales en un solo componente de líneas muy largas. No hay componentes compartidos de «hoja», «fila», «etiqueta» o «cabecera»: cada apartado trae los suyos.
- **Apartados a medias:** Evidencia e impacto y Operaciones (dentro de Continuidad) solo recibieron color; el espacio de equipo (`/team`) no se ha abierto; Preparación, Cambios y Copia de equipo están adaptados, no repensados.
- **Verificación:** los E2E del repositorio no se han ejecutado desde el rediseño y varios necesitarán adaptarse (pestañas de Continuidad, pie de registros, recordar apartado). La batería completa da 27 fallos cuyo origen previo no está demostrado.
- **Coordinación:** el encargo `CLAUDE-FABLE-UI-GRAFITO` cambió tres veces tras presentarse y sigue sin reabrir.

Un plan ambicioso que ignore esto se cae a la segunda pantalla. Por eso la fase 0 va primero.

## Fase 0 · Cimientos (lo que hace posible el resto)

| Qué | Resultado | Cómo se comprueba |
| --- | --- | --- |
| Un solo sistema de estilos | Tokens y componentes en una hoja base; las diez capas históricas se retiran por apartados, sin `html body` ni `!important` | Capturas idénticas antes/después en las 18 vistas × 4 resoluciones |
| Biblioteca de componentes | `Hoja`, `Cabecera`, `Fila`, `Etiqueta`, `Tabla`, `Pestañas`, `Vacío`, `Cargando`, `Aviso` en TSX, usados por todos los apartados | Cada componente con su prueba y su página de muestra |
| Partir `App.tsx` | Marco, navegación, atajos y página de registros en módulos propios | Tipos limpios y pruebas de `App` en verde |
| Red de seguridad visual | Capturas de referencia automáticas por vista y resolución | Un script que falla si una vista cambia sin querer |
| Línea base honesta | Batería completa y E2E ejecutados con y sin el rediseño; E2E adaptados | Lista de fallos propios (a cero) y ajenos (documentados) |
| Tablón al día | Encargo reabierto y presentado de nuevo | Lo reabre Codex o el usuario; Claude no puede |

## Fase 1 · Terminar lo que quedó a medias

- **Continuidad · Evidencia:** convertir pasaporte y mapa de impacto en un «expediente» de una pantalla: cinco preguntas, cada una con su respuesta, su fecha y su grado de prueba, y el detalle bajo demanda.
- **Continuidad · Operaciones:** hoy repite la lista de Hoy con tarjetas largas. Proponer fusionarla con Hoy (un único lugar para las tareas) y dejar en Continuidad solo «qué cambió».
- **Espacio de equipo (`/team`):** auditoría y rediseño completos con la misma identidad; es media aplicación y no se ha tocado.
- **Preparación:** asistente de cuatro pasos de una pantalla cada uno, con el resultado de cada paso a la vista.
- **Estados:** vacío, cargando (esqueletos en lugar de «Leyendo…»), error y sin permiso, diseñados una vez y usados en todas partes.
- **Modo oscuro** y **móvil real** (hoy el móvil es una adaptación, no un diseño).

## Fase 2 · Funciones que ahorran trabajo

Todas usan datos que la app ya tiene. Las marcadas con (S) necesitan cambios de servidor y, por tanto, encargo coordinado con Codex.

- **Paleta de órdenes:** Ctrl K pasa de buscador a centro de mando: buscar, ir a un apartado, crear, «abrir la tarea más antigua», «ensayar mi semana».
- **Ficha 360 del cliente:** una sola vista con sus tareas, oportunidades, cambios locales y compromisos, en una línea de tiempo.
- **Tablero vivo:** arrastrar una oportunidad entre etapas, respetando las reglas que ya valida la app al guardar.
- **Edición en línea y deshacer:** cambiar un valor en la tabla sin abrir la ficha; deshacer el último guardado local. (S) para deshacer.
- **Vistas guardadas y filtros:** «mis vencidas», «oportunidades de más de 3.000 €», recordadas por usuario.
- **Calidad de los datos:** avisar de fichas incompletas, posibles duplicados y tareas sin fecha, con arreglo en dos clics.
- **Mi jornada:** modo enfoque que recorre las tareas elegidas una a una.
- **Resumen de la semana:** qué se cerró, qué se retrasó y qué viene, listo para copiar o imprimir.

## Fase 3 · Continuidad como experiencia, no como formulario

- **Simulacro guiado:** recorrido paso a paso de «el CRM se ha caído»: abrir la copia, encontrar un cliente, cerrar una tarea, exportar. Al terminar, un parte con lo comprobado y lo que no.
- **Cronología de la copia:** capturas, pruebas y exportaciones en una línea de tiempo, con los huecos a la vista.
- **Comparar dos capturas:** qué cambió en el CRM entre una y otra. (S)
- **Parte de continuidad compartible:** una página para enseñar a un socio o a un auditor qué está demostrado y qué no.
- **Avisos que llegan a tiempo:** copia antigua, prueba caducada o exportación pendiente, también en Inicio y en el menú.

## Fase 4 · Calidad que se nota aunque no se vea

- **Velocidad:** el paquete principal supera los 500 kB; cargar cada apartado solo cuando se abre.
- **Accesibilidad auditada:** teclado completo, lector de pantalla y contraste revisados apartado por apartado con la lista WCAG 2.1 AA.
- **Primer uso:** recorrido inicial de tres pasos para quien abre Plan B por primera vez.
- **Tipografía propia empaquetada:** una familia con licencia libre servida desde la app, para que la identidad no dependa de que el equipo tenga Sitka. Requiere tu visto bueno para descargarla.
- **Textos:** repaso completo de la voz de la interfaz (qué dice cada botón, cada error y cada estado vacío).

## Orden propuesto

1. Fase 0 completa. Sin ella, cada fase siguiente se encarece.
2. Fase 1 por este orden: Evidencia y Operaciones, estados, `/team`, Preparación, modo oscuro.
3. Fase 2 empezando por paleta de órdenes, ficha 360 y tablero vivo, que son las de más uso diario.
4. Fases 3 y 4 intercaladas según lo que más te importe.

Cada pasada termina igual: capturas, pruebas, informe y despliegue solo si lo pides.

## Lo que necesito que decidas

1. **Alcance de servidor:** las funciones (S) tocan reglas y persistencia. ¿Las preparo como encargos para Codex o quedan fuera?
2. **`/team`:** ¿entra en este plan o lo dejamos para otro?
3. **Fusionar Operaciones con Hoy:** elimina una pantalla; ¿de acuerdo?
4. **Tipografía empaquetada:** ¿autorizas descargar una familia libre?
5. **Prioridad:** ¿primero cimientos (recomendado) o primero funciones visibles?
