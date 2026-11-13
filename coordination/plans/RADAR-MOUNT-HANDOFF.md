# Radar · guion de montaje para el coordinador

9/11/2026, Europe/Madrid. Autor: Claude A. Unidad `CLAUDE-RADAR-ENTRY-MOUNT-READY`. Para `CODEX-COMMITMENT-RADAR-MOUNT`. **Este documento no monta nada**: App, `server/main.ts` y la candidata son del coordinador. Todo lo probado aquí pasó por un arnés con servidor real, no por la App.

## Qué se monta

Un solo componente: `CommitmentRadarEntry` (`src/CommitmentRadarEntry.tsx`). Contiene al `CommitmentRadar` (lista, ficha, alternativas, cronología, exportación); no montes `CommitmentRadar` aparte ni una segunda entrada en otra ruta.

```tsx
<CommitmentRadarEntry
  contextRevision={state.workspaceSearchContext?.contextRevision ?? null}   // pin de /api/v2/state; null = sin copia activa
  commitmentId={optionalExactId}      // abre ese compromiso (deep link desde Continuidad u otra pantalla)
  onContextStale={() => refresh()}    // el servidor dijo que la copia cambió: relee el estado para obtener el pin vigente
  clock={undefined}                   // solo pruebas con servidor de reloj fijo; en producto no se pasa
/>
```

Servidor: `mountCommitmentRadar(app, store, { clock })` (ya aceptado) registra `/api/v7/commitment-radar` (capacidad y activación) y `/api/v7/commitments*`. Sin ese registro el componente recibe 404 y lo muestra como error de lectura, **nunca como vacío**.

## Estados que la entrada distingue (los publica el servidor)

| Estado | Qué ve la persona | Escrituras |
| --- | --- | --- |
| sin pin / copia inactiva | «No hay una copia de ensayo activa…» (no consulta nada) | 0 |
| copia no ficticia | «solo trabaja con una copia de datos ficticios…» | 0 |
| escenario sin inicializar | explicación + 3 advertencias + **«Activar el escenario de ensayo»** (acción explícita) | 0 hasta pulsar |
| no disponible / error | aviso con «Reintentar» (no se asume vacío) | 0 |
| disponible | banda de procedencia («creado el …», «guardado en disco» o «solo en memoria») + Radar | 0 al leer |

Activar hace **un** `POST /api/v7/commitment-radar/activate` con el pin (201 la primera vez, 200 después) y crea la semilla persistente 289/291 con el instante del reloj del servidor; ese instante se conserva al reiniciar y leer Hoy no crea datos. **R2 (315):** la espera de la activación tiene plazo propio de 15 s (transporte, cabeceras y cuerpo, aunque el transporte ignore la cancelación). Al vencer la entrada dice que NO se sabe si el escenario se creó, libera «Actualizar estado» y «Activar», no reenvía nada y descarta cualquier respuesta posterior (también tras nueva lectura, cambio de pin, bloqueo o desmontaje). Solo una nueva pulsación de la persona puede iniciar otro POST.

## Rótulos de procedencia (requisito del encargo)

Cada vínculo muestra el proveedor como «HubSpot · datos de ensayo · no conectado», «Pedidos ficticios · no conectado», etc. (`multisystemProviderLabels`), y la ficha lista las tres advertencias de `multisystemDisclosures`. **No cambies estos textos para sugerir conexión**: un login web o una lectura real de HubSpot no convierte los pedidos ni los tickets ficticios en reales.

## Requisitos del anfitrión

- `Modal` de `components.tsx` (ya en la App); CSS propio en `commitment-radar.css` (lo importa el componente).
- Escuchar `planb:locked`: la entrada y el Radar se retiran solos; quien monta debe además ocultarlos al bloquear.
- Un solo montaje por pantalla (hay un pin por instancia).
- `covers` del resumen 283 **no** cambia por montar el Radar.

## Guion de recorrido para la candidata (dueño: coordinador + Claude A)

1. Con la copia ficticia activa, abrir la entrada del Radar → «Activar el escenario de ensayo» → 201; la banda dice «creado ahora» y la lista muestra 2 en riesgo, 4 sin confirmar, 2 sin riesgo detectado.
2. Recargar: banda sin «creado ahora»; **0 POST** nuevos (solo el de activar).
3. Abrir `ms-installation-hubspot`: causa (pedido retenido), vencimiento, tres fuentes con rótulo de ensayo; `ms-same-id-two-accounts`: dos candidatos con el mismo ID de pedido, sin vínculo.
4. Alternativas (retrasar dos días / buscar stock) → llevar al formulario → responsable → confirmar → **1** POST de decisión; simular, leer y exportar: 0.
5. Descargar HTML y JSON de la misma lectura.
6. Reiniciar el ejecutable sobre la misma base: mismo `seedAt`, mismo historial y revisión.
7. Dos pestañas (una decide, la otra conserva borrador → 409), cambio de copia (409 de contexto retira todo) y bloqueo real (401): repetir en la candidata con contraseña de ensayo nueva.

## Pendiente y dueño

| Pendiente | Dueño |
| --- | --- |
| Registrar `mountCommitmentRadar` en `server/main.ts` y montar la entrada en `App.tsx` (reservas seriales) | Codex |
| Repetir el guion con frontend y servidor compilados, teclado y 1440/390/320 | Codex + Claude A |
| 401 real con sesión bloqueada (el arnés no tiene contraseña) | Codex |
| Informe HTML legible a 320 px (reserva 305) | Codex |
| Relevo operativo | unidad propia tras este recorrido |
