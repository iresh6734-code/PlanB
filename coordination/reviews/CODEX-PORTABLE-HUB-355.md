# El panel distingue las funciones ausentes en el portable

En modo portable, el Hub lee la evidencia local y muestra que la comprobación de lectura de HubSpot y el ensayo de relevo no están incluidos. Tampoco los consulta al pulsar «Leer el estado guardado». El pasaporte y el mapa dejan de ofrecer esas acciones, y el mapa explica el motivo. El generador conserva el comportamiento predeterminado.

**Pendiente en el montaje.** Fable conserva src/ContinuityHome.tsx bajo CLAUDE-FABLE-UI-GRAFITO. Su sesión debe añadir `portable={state.runtime}` al elemento ContinuityHub al conciliar el archivo. La prueba de este encargo pasa el valor directamente al componente. Hasta ese montaje y la preparación de un ZIP nuevo, la aplicación y el ZIP de 354 siguen sin recibir el cambio. El encargo no altera archivos de Fable ni el runtime.

Banco hub355-Azlint. 10/10 Node y typecheck limpio. 3/3 Chromium sobre el panel compilado e instancias de Fastify con datos ficticios. El caso portable registra un GET de evidencia al abrir y otro al refrescar, cero solicitudes a las funciones ausentes, cero ejecuciones de relevo y ningún botón de esas funciones. Los dos casos anteriores verifican carga del generador y publicación parcial. El primer intento del nuevo caso falló por usar una aserción sin import en el arnés. Se pasó a expect y se repitieron los tres recorridos. No se ha probado un cambio de modalidad en una misma sesión, un ZIP actualizado o el generador completo.

- src/ContinuityHub.tsx · ebf7a8b9c4a613c06ad54bc1ff4101dab741b885491849e54e89740a4b365225
- tests/e2e/continuity-hub.spec.ts · 743baa7bb1bde1eeffbfe8db84adbe0a54829258d19d34f80018809181959919
