# Revisión independiente 325 · Motor del gemelo operativo

10 de noviembre de 2026, Europe/Madrid. **Dictamen vigente: solicitar R3 por F4.** R2 supera las cuatro sondas iniciales. El primer dictamen se conserva a continuación y la revisión de R2 figura al final.

En `tests/.tmp/operational325-slO2sK` se congelaron las 22 rutas presentadas de CORE-1 y CORE-2, el esquema de compromisos aceptado, el test de revisión y `package.json`. **54/57** con tipos focales limpios, cero omitidas y sin red. Pasan las 53 pruebas de Claude y el control de horizonte de un minuto. Se reprodujeron las 160 comparaciones del planificador con el oráculo del autor y los 322 escenarios de CORE-2. El manifiesto conserva los hashes del corte. Las pruebas son del motor y sus funciones puras.

| Hallazgo | Caso reproducido | Condición de aceptación |
| --- | --- | --- |
| F1 · P1 · Conflicto falso por capacidad desconocida | La instalación Norte depende del pedido Sur. El único técnico capaz de hacer el pedido tiene horario desconocido. El pedido se marca indeterminado, pero Norte aparece como conflicto por sí sola y `whatWouldMakeItWork` devuelve `no`. | Sigue dependencias confirmadas entre compromisos y conserva el dato faltante. Norte y Sur quedan indeterminados, con `alreadyWorks:'unknown'` para Norte. Un caso con horario conocido y falta real de capacidad sigue pudiendo resultar inviable. |
| F2 · P2 · Horizonte admitido que falla en el motor | `operationalModel.safeParse` admite 30 segundos. `compileModel` trabaja con minutos completos y rechaza esa entrada al calcular un horizonte de cero. | Contrato y motor aplican el mismo mínimo. Rechazo al validar 30 segundos y control positivo en un minuto exacto. |
| F3 · P2 · Consulta de condiciones interrumpida en el límite | Una rama válida de 16 supuestos alcanza la búsqueda de una fecha de material. La propia función añade el 17.º supuesto y termina en `ZodError`. | La rama aceptada devuelve un resultado tipado. Si una condición no se puede explorar por el límite, el resultado lo indica sin afirmar que se comprobó. Revisa el mismo límite en comparaciones y relajaciones. |

En F1, `indeterminate` de `operational-planner.ts` comprueba el horario de los trabajos directos del compromiso. La búsqueda usa el cierre de dependencias, pero clasifica la falta de horario de un predecesor externo como falta de una asignación viable. La comprobación de incertidumbre necesita recorrer ese mismo cierre y distinguir un horario desconocido de uno conocido sin huecos.

La prueba independiente está en `tests/operational-core-independent-325.test.ts`. Claude puede añadir sus propias regresiones en las diez rutas reservadas de CORE-1. Repite CORE-2 sobre el corte corregido antes de promover el contrato a la composición. El montaje y la persistencia se revisan en sus entregas correspondientes.

## R2 · Nuevo fallo al invertir el orden de los trabajos

Se cotejaron las diez rutas presentadas de CORE-1 R2. Cambian el esquema `8c2c49e1…`, el planificador `3c5ad39d…`, sus pruebas `0f4b0a61…` y el informe. CORE-2 y SERVICES conservan sus presentaciones. En `tests/.tmp/operational325-r2-CcHIIG` pasan **65/65**, incluidos los cuatro casos iniciales de 325. Typecheck focal limpio.

**F4 · P2.** Se invierte el orden del array de trabajos manteniendo identidades, recursos, plazos y dependencias. La instalación Norte y su ticket se agregan a la cola de Ana en el orden de entrada. Si el ticket va primero, queda esperando a la instalación y la instalación queda detrás del ticket. El planificador genera un bloqueo circular que no existe en los datos. Norte pasa de `indeterminate` por un horario desconocido a `not-completed` con `ordering-deadlock`. La quinta sonda fija ambas permutaciones y exige preservar la causa `unknown-capacity`.

En `tests/.tmp/operational325-r2-sN9HOS` pasan **65/66** y falla solo F4. En `tests/.tmp/operational325-causal-Adp7vC` se agrega cada trabajo incierto después de sus dependencias también inciertas. Pasan **66/66**. Ambos cortes tienen tipos limpios. Se restauró el planificador de la copia y se cotejaron las huellas. Las cuatro sondas originales mantienen sus aserciones.

Para R3, conserva la incertidumbre y su causa aunque se permuten los trabajos, y comprueba cadenas que comparten el mismo recurso. Las secuencias factibles ya elegidas conservan su posición. Mantén las diez reservas y repite CORE-2 y SERVICES. El cambio experimental queda en la copia del revisor.
