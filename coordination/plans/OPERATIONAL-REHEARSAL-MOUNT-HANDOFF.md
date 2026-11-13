# «Ensayar mi semana» · guion de montaje

10/11/2026, Europe/Madrid. Autor: Claude (arnés: `claude-fable-5-2`), unidad `CLAUDE-FABLE-OPERATIONAL-MOUNT`.
**Nada de esto está montado.** `server/main.ts`, `server/runtime.ts`, `src/App.tsx` y los archivos del Radar tienen reservas vivas (Codex 318/324 y revisiones; Claude A `CLAUDE-RADAR-ENTRY-MOUNT-READY`). Este documento es el parche mínimo para quien tenga esas reservas. Tampoco el Radar está montado todavía: el ensayo lo necesita.

## Qué hay que montar

| Pieza | Archivo nuevo | Depende de |
| --- | --- | --- |
| Rutas | `server/operational-rehearsal-mount.ts` → `mountOperationalRehearsal(app, store, { clock? })` | `registerSecurity` (lo hace `createBaseApp`) y `mountCommitmentRadar` en la MISMA app |
| Contrato | `shared/operational-rehearsal-api.ts` | — |
| Ficción enlazada | `shared/operational-rehearsal-demo.ts` | semilla del Radar |
| Cliente | `src/operational-rehearsal-client.ts` | `src/commitment-radar-client.ts` (`decideCommitment`) |
| Pantalla | `src/OperationalRehearsal.tsx` + `src/operational-rehearsal.css` | — |

Sin el Radar montado, la lectura responde `status: 'radar-not-ready'` y la pantalla lo dice; no falla ni inventa datos.

## Parche 1 · servidor (`server/main.ts` y `server/runtime.ts`)

```ts
import { mountCommitmentRadar } from './commitment-radar-mount.js';
import { mountOperationalRehearsal } from './operational-rehearsal-mount.js';
// después de registerTaskIntents(app, store);
mountCommitmentRadar(app, store);
mountOperationalRehearsal(app, store);
```

Es idempotente por app (un segundo montaje con el mismo `Store` no hace nada; con otro lanza). No necesita esquema: guarda en `meta` con el prefijo `operational-rehearsal:v1:<pin>:`. Sin opciones usa `Date.now` solo para fechar el registro; el reloj del MODELO no depende de eso (sale de la semilla del Radar y no se mueve al reiniciar).

## Parche 2 · App (`src/App.tsx`)

1. Añadir `'radar'` a la unión de `page` (L37).
2. Botón de navegación junto a «Cambios», con `disabled={!state.ready}`.
3. Rama de contenido:

```tsx
:page==='radar'?<RadarHost contextRevision={state.workspaceSearchContext?.contextRevision??null} refresh={refresh}/>
```

con un anfitrión de pocas líneas (puede vivir en un archivo nuevo, `src/RadarHost.tsx`), igual que la página de arnés `tests/e2e/operational-rehearsal-page.tsx`:

```tsx
const [rehearse, setRehearse] = useState<string | null>(null), [radarKey, setRadarKey] = useState(0);
return rehearse
  ? <OperationalRehearsal contextRevision={contextRevision} commitmentId={rehearse} onContextStale={refresh} onDecision={() => setRadarKey(k => k + 1)} onClose={() => setRehearse(null)} />
  : <CommitmentRadarEntry key={radarKey} contextRevision={contextRevision} onContextStale={refresh} onRehearse={setRehearse} />;
```

## Parche 3 · Radar (`src/CommitmentRadar.tsx`, de Claude A)

La misión pide que la persona abra el compromiso y pulse una acción secundaria. Hace falta una prop opcional y un botón; nada más:

```tsx
// CommitmentRadarProps
onRehearse?: (commitmentId: string) => void;
// en .cr-summary o al final de .cr-actions de la ficha, solo si la prop existe
{onRehearse ? <button type="button" className="button secondary" disabled={locked || saving} onClick={() => { close(); onRehearse(detail.item.id); }}>Ensayar mi semana</button> : null}
```

`CommitmentRadarEntry` ya propaga `{...props}`. Hoy solo `ms-installation-hubspot` tiene semana de ensayo; para cualquier otro compromiso la pantalla responde «no tiene semana de ensayo». Se puede ocultar el botón con `detail.item.id === REHEARSAL_RADAR_COMMITMENT` (exportado en `shared/operational-rehearsal-demo.ts`).

## Rutas

Todas bajo `/api/v7/operational-rehearsal`, con `contextRevision` (pin) obligatorio, misma sesión por cookie que el Radar, `Cache-Control: no-store` y `Vary: Cookie`.

| Método y ruta | Escribe | Notas |
| --- | --- | --- |
| `GET ?contextRevision&commitmentId` | no | diagnóstico, catálogos, ensayos guardados |
| `POST /analyze` | no | ~2 s; cede el bucle de eventos y se corta si el cliente cierra |
| `POST /check-first` | no | ~4 s |
| `POST /rehearsals` | sí (meta) | idempotente por `id`; 201 la primera vez, 200 después; máximo 30 por copia |
| `GET /rehearsals/:id` | no | no recalcula |
| `POST /rehearsals/:id/choose` | sí (meta) | solo ensayo vigente y sin decisión |
| `POST /rehearsals/:id/decision-draft` | no | devuelve una `commitmentDecisionRequest`; no la envía |
| `POST /rehearsals/:id/link` | sí (meta) | solo si el historial del Radar contiene esa decisión sobre esa revisión |

La decisión la escribe `POST /api/v7/commitments/:id/decisions`, que ya existe. Códigos propios en `details.code`: ver `rehearsalErrorCodes`.

## Cómo comprobarlo tras montar

- `npx tsx --test tests/operational-rehearsal-mount.test.ts` (5 pruebas; servidor real, SQLite de archivo, reinicio).
- Recorrido de navegador: `tests/e2e/operational-rehearsal.spec.ts`. Arranca su propio servidor; necesita una configuración de Playwright sin `webServer` (por ejemplo la de `tests/.tmp/fable-rehearsal/pw.config.ts`) y `PLANB_PLAYWRIGHT_EXECUTABLE`. `PLANB_REHEARSAL_SHOTS` elige dónde dejar las capturas.
- Tras el montaje real falta repetir el recorrido contra la App compilada: el de hoy usa una página de arnés.
