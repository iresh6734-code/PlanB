# CLAUDE-FABLE-OPERATIONAL-MOUNT · «Ensayar mi semana» listo para montar

10/11/2026, Europe/Madrid. Autor: Claude (arnés: `claude-fable-5-2`). El usuario pidió integrar el gemelo en la App. Un subagente Sonnet de solo lectura levantó el mapa del montaje del Radar; el código es mío.

## Resumen

El recorrido completo funciona en un navegador real contra un servidor real: abrir el ensayo de un compromiso del Radar, ver por qué no llega, ensayar, cancelar, comparar cinco respuestas, preguntar qué comprobar, confirmar una decisión, reiniciar el proceso y reencontrarla. **No está montado en la App.** `App.tsx`, `main.ts`, `runtime.ts` y la ficha del Radar tienen reservas vivas de Codex y Claude A, y editarlos invalidaría sus entregas en revisión; el parche exacto está en `coordination/plans/OPERATIONAL-REHEARSAL-MOUNT-HANDOFF.md`. La prueba de navegador usa una página de arnés, no la App compilada, así que la tercera puerta de la misión sigue abierta.

## Qué existe

| Archivo | Contenido |
| --- | --- |
| `shared/operational-rehearsal-demo.ts` | La empresa 12/3/2/20/8 desplazada para que su viernes sea la fecha del compromiso `ms-installation-hubspot`, que lleva id, título y revisión del Radar |
| `shared/operational-rehearsal-api.ts` | Contrato de las ocho rutas, con esquemas |
| `server/operational-rehearsal-mount.ts` | `mountOperationalRehearsal(app, store, { clock? })` |
| `src/operational-rehearsal-client.ts` | Cliente validado, errores propios, `planb:locked` en 401 |
| `src/OperationalRehearsal.tsx`, `src/operational-rehearsal.css` | Pantalla |
| `tests/operational-rehearsal-mount.test.ts` | 5 pruebas de servidor |
| `tests/e2e/operational-rehearsal.spec.ts`, `-page.tsx` | Recorrido en Chromium y su página de arnés |

## Decisiones de diseño que conviene revisar

- **Enlace con el Radar.** El servidor lee el compromiso por la ruta pública del Radar con la misma sesión, así la revisión es la que el Radar exigirá al confirmar. Solo `ms-installation-hubspot` tiene semana de ensayo; el resto de la empresa es ficción propia del ensayo y no existe en el Radar.
- **Reloj.** El modelo empieza el lunes de la semana cuyo viernes es la fecha del Radar. Sale de la semilla, no de `Date.now`: reiniciar o dejar pasar horas no cambia la revisión. Consecuencia: el «hoy» del ensayo es el lunes de esa semana, no el instante real.
- **Una decisión.** El ensayo prepara una `commitmentDecisionRequest` de tipo `assign`; la confirma el cliente del Radar por `POST /api/v7/commitments/:id/decisions`. El servidor solo anota la decisión si la encuentra en el historial del Radar para esa revisión. Sin lote.
- **Tras decidir**, la revisión del compromiso cambia y el ensayo pasa a histórico con decisión registrada. Es lo que pide la misión, y se ve en la lista de ensayos.
- **Confirmación reanudable.** Guardar, elegir, preparar, decidir y anotar usan las mismas claves; un reintento tras un resultado desconocido continúa desde el paso que falló.

## Qué se probó

`npx tsx --test tests/operational-*.test.ts` → 63/63 (58 anteriores + 5). `npx tsc --noEmit -p .` → 0 errores. Recorrido de navegador: 1/1 en Chromium headless-shell 1228, unos 22 s.

Servidor (SQLite de archivo cifrado con clave de prueba en carpeta temporal del sistema, reloj fijo):

- Sin copia de ensayo, sin semilla del Radar, sin Radar montado o con otro compromiso: no se ofrece ensayo y no se crea nada.
- Leer, ensayar con y sin perturbaciones, cambiar prioridad y preguntar qué comprobar no cambian ni un byte de `meta`, y la misma entrada da la misma respuesta.
- Guardar es idempotente por clave; otra entrada con la misma clave se rechaza.
- Preparar la decisión no escribe. Anotar una decisión que el Radar no tiene se rechaza.
- Repetir la decisión aceptada devuelve el mismo recibo y deja un solo evento. Anotar dos veces no cambia nada.
- Reinicio en proceso nuevo sobre el mismo archivo: ensayo, decisión y semilla intactos; arrancar, leer y reabrir no escriben ni vuelven a ensayar; el reloj del modelo no se mueve.
- El Radar sigue mostrando el compromiso en riesgo tras ensayar y decidir: nada lo da por resuelto.
- Copia bloqueada: 401 en lectura, ensayo y guardado; con sesión vuelve.

Navegador (servidor real en proceso propio con red exterior bloqueada):

- Sin escenario del Radar se explica qué falta. Entrada con la decisión y sus causas primero; el calendario va plegado.
- Teclado: Espacio en casillas y opciones, Intro para lanzar y para confirmar. El foco pasa al resultado, al recibo y al ensayo reabierto.
- Cancelar un ensayo en curso devuelve los controles y no deja resultado.
- Cambiar lo marcado tras ensayar atenúa el resultado anterior y bloquea elegir hasta ensayar de nuevo.
- Conflicto verificado, cinco respuestas con qué piden, qué mejoran y qué empeoran; calendario como barras decorativas más lista de texto equivalente.
- Peticiones registradas en servidor: antes de confirmar, solo la activación explícita del Radar escribe; al confirmar, exactamente una decisión y cuatro llamadas del registro. Cero peticiones fuera de `127.0.0.1` y cero errores de consola.
- Reinicio del proceso: el ensayo guardado aparece como histórico con decisión; reabrirlo no escribe; los tres rótulos (ensayo, decisión, resultado observado) siguen separados.
- 390 y 320 px: sin desbordamiento horizontal y controles de al menos 44 px.

Capturas inspeccionadas una a una (seis, en `tests/.tmp/fable-rehearsal/shots/`, carpeta temporal ignorada por git): 1440 entrada, comparar, decisión y reinicio; 390 y 320. La primera pasada reveló que la explicación hablaba de «Residencia Norte» mientras el compromiso del Radar se llama «Almacén Norte»; se renombraron trabajos y materiales del foco y se repitió todo.

## Límites

- **No montado y no probado en la App compilada.** No hay entrada desde Hoy. La entrada desde la ficha del Radar necesita el parche 3 del guion; el arnés usa un botón propio en su lugar.
- **Un solo compromiso enlazado** y una empresa de ficción fija. No hay proyección de fuentes reales al modelo.
- **Planes de tamaño real sin prueba de optimalidad**; la pantalla lo dice junto a las respuestas.
- **Tiempos**: ensayar tarda unos 2 s y «qué comprobar» unos 4 s en este equipo. El servidor cede el bucle de eventos y se corta si el cliente cierra, pero no se ha medido con varias peticiones simultáneas.
- **Accesibilidad**: comprobados teclado, foco, roles y tamaños táctiles. No se ha medido contraste computado ni se ha probado con lector de pantalla.
- **Sin mutantes** en esta unidad y sin revisión ajena. `CONTEXTO-PROYECTO.md` sin tocar.
- Hereda los hallazgos abiertos de CORE-1 (objetivo por niveles) y los contratos sin acordar.

## Huellas SHA-256

```
6cbfa792d961d01ddbaeba193d69a658790b7a130615f87f4a62861a3b63b695  shared/operational-rehearsal-demo.ts
e1a2998f033a378b8fd28285cc258ff7a372ba859be9b152c1c1f271af4abce7  shared/operational-rehearsal-api.ts
d16b3cba7705711154ccf584e82b24d614ef4ee07afa83b0e4729197a33593dc  server/operational-rehearsal-mount.ts
32678b1e5d1459b097f7e9285a85e25ebcdcfb8b7129a17096ee029e8e56bbd9  src/operational-rehearsal-client.ts
7b01f5fc6776dff86ed73ae17c8a0a3a0cc4eb300c204d335886558f2a94bb55  src/OperationalRehearsal.tsx
acaebf67c5c8b60154692e9faa884dbc6e4e46715d775a2c87c25e57147d307e  src/operational-rehearsal.css
f88a46274afe601bad827508451c870cc4734fe6b6acae352716b8188ad371ff  tests/operational-rehearsal-mount.test.ts
f62a91ff4f3ec87d13011d534155d8a05eb15abff5ecb4f97da29503722da3e3  tests/e2e/operational-rehearsal.spec.ts
6f6f4a36f2b71ac26dd0fe8cb789f619681f52c37732fb9280fb2f42f0d02064  tests/e2e/operational-rehearsal-page.tsx
ffc211eea50267ee1ef811ebdd400240c05ed386933cb3722230084b1236ad59  coordination/plans/OPERATIONAL-REHEARSAL-MOUNT-HANDOFF.md
```
