# Comprobar una fecha · guion de montaje

11 de noviembre de 2026. Unidad `CLAUDE-OPUS-DATE-CHECK-FLOW`. Todo lo montable está en archivos nuevos. **No he tocado** `server/main.ts`, `server/runtime.ts` (reservados por `CODEX-A4-SERVER-MOUNT-318`), `src/App.tsx` ni `src/RadarHost.tsx`. Este es el parche mínimo y aditivo para que lo aplique su propietario sobre las huellas vigentes.

## Servidor (`server/main.ts` y `server/runtime.ts`, mismo cambio en los dos)

```ts
// junto a los otros montajes
import { mountDateCheck } from './date-check-mount.js';
// después de mountOperationalRehearsal(app, store);
mountDateCheck(app, store);
```

`mountDateCheck` registra solo rutas bajo `/api/v7/date-check`. Es idempotente por instancia de Fastify, no sustituye el manejador de errores y no necesita el Radar. Exige una copia de ensayo activa (`isTestData`) y el pin en cada petición. Fuera de ficción responde `DATE_CHECK_CONTEXT_CHANGED`.

## App (`src/App.tsx`)

1. Importa el componente: `import { DateCheck } from './DateCheck.js';`.
2. Añade `'date-check'` a la unión de `page`.
3. Añade el botón de navegación junto a Radar, con el icono que prefiera el propietario (por ejemplo, `CalendarDays`, que ya se importa):

```tsx
<button className={'nav-item '+(page==='date-check'?'active':'')} aria-current={page==='date-check'?'page':undefined} disabled={!state.ready} onClick={()=>{setPage('date-check');setSelected(null);}}><CalendarDays size={19}/>Comprobar una fecha</button>
```

4. Añade la rama de render antes de la de `radar`:

```tsx
:page==='date-check'?<DateCheck contextRevision={state.workspaceSearchContext?.contextRevision??null} onContextStale={()=>void refresh()}/>
```

El encargo admite la entrada desde Hoy o desde Radar. Desde Hoy bastaría una línea de acceso que haga `setPage('date-check')`, igual que `RehearsalTodayEntry`. Lo decide el propietario de `App.tsx`.

## Comprobaciones tras montar

- Ejecutar `tests/e2e/date-check.spec.ts` contra la App compilada, sustituyendo la página de arnés por la navegación real.
- `npm test` incluye `tests/date-check-mount.test.ts`, `tests/operational-date-check.test.ts` y `tests/operational-inventory.test.ts`.
- `dist/` y `build/` del piloto no se tocan hasta que Codex prepare la candidata.
