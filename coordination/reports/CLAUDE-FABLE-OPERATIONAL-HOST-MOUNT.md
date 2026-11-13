# CLAUDE-FABLE-OPERATIONAL-HOST-MOUNT · «Ensayar mi semana» montado en la App

10/11/2026, Europe/Madrid. Autor: Claude (arnés: `claude-fable-5-2`).

## Autorización y alcance

El usuario ordenó de forma expresa («Aplícalo tú») aplicar el parche de montaje aunque los archivos del host tuvieran reservas. Avisé antes por el canal a todos los agentes. Edité cuatro archivos que NO son míos, con cambios mínimos y solo aditivos; no revertí ni reordené nada de su contenido. El tablón no permite reservarlos (colisión), así que esta unidad reserva solo los archivos nuevos y deja aquí el diff exacto.

**Consecuencia para Codex y Claude A:** las huellas de estos cuatro archivos cambiaron. Las entregas en revisión que los incluyen (entre otras 318/324 sobre `main.ts` y `runtime.ts`, las revisiones de `App.tsx` y `CLAUDE-RADAR-ENTRY-MOUNT-READY` sobre `CommitmentRadar.tsx`) deben volver a presentarse sobre el estado nuevo.

| Archivo ajeno | Huella anterior | Huella actual |
| --- | --- | --- |
| `server/main.ts` | `44988a72bf490743…` | `4ef6b3473fd8578ff11514776d6174cc2734cfa12b5dfd8a0fd1023adc35bb7b` |
| `server/runtime.ts` | `783a31eceadbc15d…` | `bb7dcb650ce980dba7c3dc573b22c2e315b2f7ce285e59902c3067b957055e7f` |
| `src/App.tsx` | `bacf2aeca8e02822…` | `bf87c2caed23e85f176a961e712f8789ea892c9ec5fb03aa608bb9e2b5b9f855` |
| `src/CommitmentRadar.tsx` | `60224e3b553fdf69…` | `c0d93957143d3f60d9404f1a669da3b50cde51a746af197ac322630a58c98685` |

## Diff exacto

```diff
### server/main.ts
17a18,19
> import { mountCommitmentRadar } from './commitment-radar-mount.js';
> import { mountOperationalRehearsal } from './operational-rehearsal-mount.js';
37a40,42
> // Radar de compromisos y «Ensayar mi semana»: solo ficción, exigen copia de ensayo activa y no llaman a ningún proveedor.
> mountCommitmentRadar(app, store);
> mountOperationalRehearsal(app, store);
### server/runtime.ts
8a9,10
> import { mountCommitmentRadar } from './commitment-radar-mount.js';
> import { mountOperationalRehearsal } from './operational-rehearsal-mount.js';
17a20,22
> // Radar de compromisos y «Ensayar mi semana»: solo ficción, exigen copia de ensayo activa y no llaman a ningún proveedor.
> mountCommitmentRadar(app, store);
> mountOperationalRehearsal(app, store);
### src/App.tsx
2c2
< import { ArrowRight, Bot, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, Database, Download, GitBranch, ListTodo, PlugZap, Plus, Search, Settings2, ShieldCheck, Unplug, Users, X } from 'lucide-react';
---
> import { ArrowRight, Bot, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, Database, Download, GitBranch, ListTodo, PlugZap, Radar, Plus, Search, Settings2, ShieldCheck, Unplug, Users, X } from 'lucide-react';
18a19
> import { RadarHost } from './RadarHost.js';
37c38
<   const [page, setPage] = useState<'continuity' | 'changes' | 'prepare' | 'workspace' | 'export' | 'today' | 'agents' | 'integrations' | 'team-sync'>('continuity');
---
>   const [page, setPage] = useState<'continuity' | 'changes' | 'prepare' | 'workspace' | 'export' | 'today' | 'agents' | 'integrations' | 'team-sync' | 'radar'>('continuity');
157a159
>         <button className={'nav-item '+(page==='radar'?'active':'')} aria-current={page==='radar'?'page':undefined} disabled={!state.ready} onClick={()=>{setPage('radar');setSelected(null);}}><Radar size={19}/>Radar</button>
183a186
>       :page==='radar'?<RadarHost contextRevision={state.workspaceSearchContext?.contextRevision??null} refresh={()=>void refresh()}/>
### src/CommitmentRadar.tsx
25a26,27
>   /** Acción secundaria de la ficha: abrir «Ensayar mi semana» para este compromiso. Si no se pasa, el botón no aparece. */
>   onRehearse?: (commitmentId: string) => void;
95c97
< export function CommitmentRadar({ contextRevision, commitmentId = null, onContextStale, clock = Date.now }: CommitmentRadarProps) {
---
> export function CommitmentRadar({ contextRevision, commitmentId = null, onContextStale, onRehearse, clock = Date.now }: CommitmentRadarProps) {
263c265,266
<             {detail.item.closure ? <p className="cr-line"><strong>Cierre:</strong> {detail.item.closure.basis === 'observed' ? 'con evidencia observada, confirmado por una persona' : 'manual'} · {detail.item.closure.note}</p> : null}</div>
---
>             {detail.item.closure ? <p className="cr-line"><strong>Cierre:</strong> {detail.item.closure.basis === 'observed' ? 'con evidencia observada, confirmado por una persona' : 'manual'} · {detail.item.closure.note}</p> : null}
>             {onRehearse ? <div className="cr-actions"><button type="button" className="button secondary" disabled={locked || saving} onClick={() => { const id = detail.item.id; close(); onRehearse(id); }}>Ensayar mi semana</button></div> : null}</div>
```

Archivos nuevos: `src/RadarHost.tsx` (alterna Radar y ensayo) y `tests/e2e/operational-rehearsal-app.spec.ts`.

## Qué hay ahora en la App

- Navegación: entrada «Radar» junto a «Cambios», deshabilitada sin copia activa.
- Vista Radar: `CommitmentRadarEntry` (capacidad, activación explícita del escenario de ensayo, lista y ficha).
- Ficha del compromiso: botón secundario «Ensayar mi semana», que cierra la ficha y abre el ensayo de ese compromiso.
- Servidor: `main.ts` y `runtime.ts` montan `mountCommitmentRadar` y `mountOperationalRehearsal` tras `registerTaskIntents`.

## Qué se probó

- `npx tsc --noEmit -p .` → 0 errores.
- `tests/e2e/operational-rehearsal-app.spec.ts` → 1/1 en Chromium headless-shell 1228. Cliente: la App REAL (`index.html` → `src/main.tsx` → `App.tsx`) compilada con vite a una carpeta temporal del sistema. Recorrido: navegación → Radar → activar escenario → ficha → «Ensayar mi semana» con teclado → ensayo → elegir → confirmar una decisión → volver y ver en la ficha responsable y siguiente paso → reiniciar el proceso → reencontrar decisión y ensayo sin escrituras nuevas → 390 y 320 px sin desbordamiento. Una sola decisión registrada, cero peticiones fuera de 127.0.0.1 y cero errores de página.
- `tests/e2e/operational-rehearsal.spec.ts` (página de arnés) → sigue 1/1.
- Capturas de la App inspeccionadas: ficha con el botón, ensayo, ficha con la decisión, reinicio, 390 y 320 (`tests/.tmp/fable-rehearsal/shots/app-*.png`).
- `npm test` completo: 2861 pruebas, 2830 pasan, 26 fallan, 1 omitida. Revisé las que tocan lo que edité y ninguna falla por este parche:
  - `task-intents-entrypoints` (A4 en main y runtime, 10 fallos con subpruebas): «La clave local requiere Windows o el entorno de pruebas original», al crear el `Store` de su propio arnés.
  - `continuity-evidence-mount` («the portable entry point does not register the main-only evidence route», 200 en vez de 404): es la ruta de evidencia de continuidad, que `runtime.ts` ya registraba antes de mi edición.
  - `independent-interface-contexts` G6: comprueba la línea `<Protection …>` de `App.tsx`, que no toqué.
  - El resto (capturas 099, cápsulas de rescate, 322, observaciones F1/F2, reapertura en disco) está en módulos que no edité. **No ejecuté la batería sobre el estado anterior**, así que no puedo certificar que las 26 fallaran ya antes; lo afirmo solo de las que examiné.

## Límites

- El servidor de la prueba se compone con `createBaseApp` y los mismos dos montajes; `main.ts` y `runtime.ts` no se arrancaron tal cual porque bloquean la instancia y sirven `dist/`. La prueba comprueba por texto que ambos contienen las dos llamadas. No hay prueba que arranque el binario real con el montaje.
- `dist/` y `build/` no se tocaron: la instalación piloto NO tiene este cambio hasta que alguien compile y despliegue.
- La vista Radar se muestra también en la compilación independiente (`runtime`); no decidí ocultarla allí.
- El botón aparece en la ficha de cualquier compromiso; hoy solo `ms-installation-hubspot` tiene semana de ensayo y para los demás la pantalla lo dice.
- No hay entrada desde Hoy.
- Las pruebas de navegador propias de Claude A sobre el Radar no se repitieron tras añadir la prop.
- Sin revisión ajena. `CONTEXTO-PROYECTO.md` sin tocar.

## Huellas SHA-256 de los archivos nuevos

```
f40f5e8f91680b05a712f2f29574d4c901f557b123f4a266124796d655c41fd1  src/RadarHost.tsx
c672b316e94498456ac2449f642f196b7b2dd838147c8f235ec15ddecee7b98d  tests/e2e/operational-rehearsal-app.spec.ts
```
