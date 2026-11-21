# API de Plan B · inventario generado

Generado por `node tools/api/inventory.mjs` a partir de los servidores reales: cada entrada se arranca en una carpeta temporal con datos vacíos, sin red exterior ni puertos, y se anotan las rutas que declara. **No editar a mano**: regenerar con el mismo comando y comprobar con `--check`.

**Entradas:** `main` = App local completa (`server/main.ts`) · `runtime` = App independiente (paquete portátil) (`server/runtime.ts`) · `equipo` = Servicio de equipo en modo demo (`server/team/main.ts`)

**Límites:** solo aparecen las rutas que cada entrada declara con su configuración por defecto. El servicio de equipo se inventaría en modo demo: faltan las rutas del piloto local (`PLANB_TEAM_LOCAL_PILOT`), las del modo gestionado (por ejemplo `/internal/dispatch`) y las que dependen de credenciales (OAuth de HubSpot, Google, Copilot o identidad gestionada). Tampoco están los servidores propios de la sala y la cápsula de rescate (`server/rescue-room-api.ts`, `server/rescue-capsule-api.ts`), que solo arrancan desde sus scripts de demostración. `HEAD` se omite porque Fastify lo añade a cada `GET`. Tampoco aparece la ruta de archivos estáticos (`/*`), que solo se registra cuando existe `dist/`. La comprobación de permisos de cada ruta no forma parte de este inventario.

## Resumen

| Grupo | Rutas | main | runtime | equipo |
| --- | --- | --- | --- | --- |
| v2 | 50 | 50 | 34 | 0 |
| v3 | 4 | 4 | 2 | 0 |
| v4 | 10 | 10 | 10 | 0 |
| v5 | 5 | 5 | 0 | 0 |
| v6 | 2 | 2 | 0 | 0 |
| v7 | 38 | 38 | 36 | 0 |
| sin versión | 19 | 19 | 13 | 0 |
| team | 54 | 0 | 0 | 54 |
| fuera de /api | 1 | 0 | 0 | 1 |
| **Total** | **183** | **128** | **95** | **55** |

## v2

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| POST | `/api/v2/auth/lock` | ● | ● |  | `server/security.ts` |
| POST | `/api/v2/auth/login` | ● | ● |  | `server/security.ts` |
| POST | `/api/v2/auth/setup` | ● | ● |  | `server/security.ts` |
| GET | `/api/v2/auth/status` | ● | ● |  | `server/security.ts` |
| GET | `/api/v2/candidate` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/candidate/discard` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/captures` | ● |  |  | `server/v2.ts` |
| GET | `/api/v2/captures/compare` | ● | ● |  | `server/capture-comparison.ts` |
| GET | `/api/v2/changes` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/changes/undo-last` | ● | ● |  | `server/undo.ts` |
| POST | `/api/v2/connection` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/connection/inspect` | ● |  |  | `server/v2.ts` |
| DELETE | `/api/v2/connection/read-check` | ● |  |  | `server/hubspot-read-check-api.ts` |
| GET | `/api/v2/connection/read-check` | ● |  |  | `server/hubspot-read-check-api.ts` |
| POST | `/api/v2/connection/read-check` | ● |  |  | `server/hubspot-read-check-api.ts` |
| GET | `/api/v2/continuity` | ● | ● |  | `server/v2.ts` |
| GET | `/api/v2/continuity/response-queue` | ● | ● |  | `server/response-queue.ts` |
| POST | `/api/v2/drills` | ● | ● |  | `server/v2.ts` |
| GET | `/api/v2/drills/:id/report` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/export/encrypted` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/export/package` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/history/prepare` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/import/csv/apply` | ● |  |  | `server/csv-import.ts` |
| POST | `/api/v2/import/csv/preview` | ● |  |  | `server/csv-import.ts` |
| POST | `/api/v2/jobs/:id/cancel` | ● | ● |  | `server/v2.ts` |
| GET | `/api/v2/records/:entity` | ● | ● |  | `server/v2.ts` |
| GET | `/api/v2/records/:entity/:id` | ● | ● |  | `server/v2.ts` |
| GET | `/api/v2/records/:entity/:id/then` | ● | ● |  | `server/record-history.ts` |
| POST | `/api/v2/records/merge` | ● | ● |  | `server/record-merge.ts` |
| GET | `/api/v2/records/merge-preview` | ● | ● |  | `server/record-merge.ts` |
| GET | `/api/v2/records/merges` | ● | ● |  | `server/record-merge.ts` |
| POST | `/api/v2/records/merges/:id/release` | ● | ● |  | `server/record-merge.ts` |
| POST | `/api/v2/records/merges/:id/undo` | ● | ● |  | `server/record-merge.ts` |
| POST | `/api/v2/restore` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/return/apply` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/return/approve` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/return/check` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/return/decisions` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/return/preview` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/return/refresh` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/return/verify-uncertain` | ● |  |  | `server/v2.ts` |
| POST | `/api/v2/schedule` | ● |  |  | `server/v2.ts` |
| GET | `/api/v2/search` | ● | ● |  | `server/workspace-search.ts` |
| GET | `/api/v2/search-record` | ● | ● |  | `server/workspace-search.ts` |
| POST | `/api/v2/services` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/session/begin` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v2/session/end` | ● | ● |  | `server/v2.ts` |
| GET | `/api/v2/state` | ● | ● |  | `server/app.ts` |
| GET | `/api/v2/views/:entity` | ● | ● |  | `server/saved-views.ts` |
| POST | `/api/v2/views/:entity` | ● | ● |  | `server/saved-views.ts` |

## v3

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| GET | `/api/v3/diagnostics` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v3/manual-recovery/verify` | ● |  |  | `server/v2.ts` |
| POST | `/api/v3/recovery-copy/confirm` | ● | ● |  | `server/v2.ts` |
| POST | `/api/v3/return-package` | ● |  |  | `server/return-package-api.ts` |

## v4

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| POST | `/api/v4/activate-reviewed` | ● | ● |  | `server/activation-review.ts` |
| GET | `/api/v4/activation-review` | ● | ● |  | `server/activation-review.ts` |
| POST | `/api/v4/agent-runs` | ● | ● |  | `server/v4.ts` |
| GET | `/api/v4/agents` | ● | ● |  | `server/v4.ts` |
| GET | `/api/v4/export-summary` | ● | ● |  | `server/v4.ts` |
| GET | `/api/v4/integrations` | ● | ● |  | `server/v4.ts` |
| POST | `/api/v4/proposals/:id/approve` | ● | ● |  | `server/v4.ts` |
| POST | `/api/v4/proposals/:id/execute` | ● | ● |  | `server/v4.ts` |
| POST | `/api/v4/proposals/:id/reject` | ● | ● |  | `server/v4.ts` |
| GET | `/api/v4/today` | ● | ● |  | `server/v4.ts` |

## v5

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| GET | `/api/v5/team-sync` | ● |  |  | `server/team-sync.ts` |
| POST | `/api/v5/team-sync/edit` | ● |  |  | `server/team-sync.ts` |
| POST | `/api/v5/team-sync/link` | ● |  |  | `server/team-sync.ts` |
| POST | `/api/v5/team-sync/run` | ● |  |  | `server/team-sync.ts` |
| POST | `/api/v5/team-sync/unlink` | ● |  |  | `server/team-sync.ts` |

## v6

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| POST | `/api/v6/team-sync/edit` | ● |  |  | `server/team-sync.ts` |
| GET | `/api/v6/workspace` | ● |  |  | `server/team-sync.ts` |

## v7

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| GET | `/api/v7/commitment-radar` | ● | ● |  | `server/commitment-radar-mount.ts` |
| POST | `/api/v7/commitment-radar/activate` | ● | ● |  | `server/commitment-radar-mount.ts` |
| GET | `/api/v7/commitments` | ● | ● |  | `server/commitments.ts` |
| GET | `/api/v7/commitments/:id` | ● | ● |  | `server/commitments.ts` |
| POST | `/api/v7/commitments/:id/decisions` | ● | ● |  | `server/commitments.ts` |
| GET | `/api/v7/continuity/evidence` | ● | ● |  | `server/continuity-evidence-api.ts` |
| GET | `/api/v7/copy-review/context` | ● |  |  | `server/copy-inspection.ts` |
| POST | `/api/v7/copy-review/inspect` | ● |  |  | `server/copy-inspection.ts` |
| GET | `/api/v7/date-check-review/decisions` | ● | ● |  | `server/date-check-review-mount.ts` |
| GET | `/api/v7/date-check-review/decisions/:id` | ● | ● |  | `server/date-check-review-mount.ts` |
| POST | `/api/v7/date-check-review/decisions/:id/outcome` | ● | ● |  | `server/date-check-review-mount.ts` |
| POST | `/api/v7/date-check/analyze` | ● | ● |  | `server/date-check-mount.ts` |
| GET | `/api/v7/date-check/catalog` | ● | ● |  | `server/date-check-mount.ts` |
| GET | `/api/v7/date-check/checks` | ● | ● |  | `server/date-check-mount.ts` |
| POST | `/api/v7/date-check/checks` | ● | ● |  | `server/date-check-mount.ts` |
| GET | `/api/v7/date-check/checks/:id` | ● | ● |  | `server/date-check-mount.ts` |
| POST | `/api/v7/date-check/checks/:id/confirm` | ● | ● |  | `server/date-check-mount.ts` |
| POST | `/api/v7/date-check/demo/revision` | ● | ● |  | `server/date-check-mount.ts` |
| GET | `/api/v7/local-operations` | ● | ● |  | `server/local-operations.ts` |
| POST | `/api/v7/local-operations/reviews` | ● | ● |  | `server/local-operations.ts` |
| GET | `/api/v7/local-operations/work` | ● | ● |  | `server/local-operations.ts` |
| GET | `/api/v7/local-operations/work-summary` | ● | ● |  | `server/work-summary-api.ts` |
| GET | `/api/v7/operational-rehearsal` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| POST | `/api/v7/operational-rehearsal/analyze` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| POST | `/api/v7/operational-rehearsal/check-first` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| POST | `/api/v7/operational-rehearsal/rehearsals` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| GET | `/api/v7/operational-rehearsal/rehearsals/:id` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| POST | `/api/v7/operational-rehearsal/rehearsals/:id/choose` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| POST | `/api/v7/operational-rehearsal/rehearsals/:id/decision-draft` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| POST | `/api/v7/operational-rehearsal/rehearsals/:id/link` | ● | ● |  | `server/operational-rehearsal-mount.ts` |
| GET | `/api/v7/task-intents` | ● | ● |  | `server/task-intents-api.ts` |
| GET | `/api/v7/task-intents/:attemptId` | ● | ● |  | `server/task-intents-api.ts` |
| POST | `/api/v7/task-intents/:attemptId/abandon` | ● | ● |  | `server/task-intents-api.ts` |
| POST | `/api/v7/task-intents/:attemptId/accept` | ● | ● |  | `server/task-intents-api.ts` |
| GET | `/api/v7/task-intents/:attemptId/check` | ● | ● |  | `server/task-intents-api.ts` |
| POST | `/api/v7/task-intents/attempts` | ● | ● |  | `server/task-intents-api.ts` |
| GET | `/api/v7/task-revision/:id` | ● | ● |  | `server/task-revision.ts` |
| PATCH | `/api/v7/task-revision/:id` | ● | ● |  | `server/task-revision.ts` |

## sin versión

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| POST | `/api/activate` | ● | ● |  | `server/app.ts` |
| GET | `/api/changes` | ● | ● |  | `server/app.ts` |
| POST | `/api/disconnect` | ● | ● |  | `server/app.ts` |
| GET | `/api/export/bundle` | ● | ● |  | `server/app.ts` |
| GET | `/api/export/changes` | ● | ● |  | `server/app.ts` |
| GET | `/api/export/package` | ● | ● |  | `server/app.ts` |
| POST | `/api/generate` | ● |  |  | `server/generator.ts` |
| GET | `/api/health` | ● | ● |  | `server/security.ts` |
| POST | `/api/import/fixture` | ● |  |  | `server/generator.ts` |
| POST | `/api/import/hubspot` | ● |  |  | `server/generator.ts` |
| POST | `/api/import/snapshot` | ● |  |  | `server/generator.ts` |
| POST | `/api/probe` | ● | ● |  | `server/app.ts` |
| GET | `/api/records` | ● | ● |  | `server/app.ts` |
| GET | `/api/records/:entity` | ● | ● |  | `server/app.ts` |
| POST | `/api/records/:entity` | ● | ● |  | `server/app.ts` |
| PATCH | `/api/records/:entity/:id` | ● | ● |  | `server/app.ts` |
| GET | `/api/settings/ai` | ● |  |  | `server/generator.ts` |
| PUT | `/api/settings/ai` | ● |  |  | `server/generator.ts` |
| GET | `/api/state` | ● | ● |  | `server/app.ts` |

## team

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| GET | `/api/team/config` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/demo/session` |  |  | ● | `server/team/app.ts` |
| GET | `/api/team/device/bootstrap` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/device/exchange` |  |  | ● | `server/team/app.ts` |
| GET | `/api/team/health` |  |  | ● | `server/team/app.ts` |
| GET | `/api/team/spaces` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces` |  |  | ● | `server/team/app.ts` |
| GET | `/api/team/spaces/:tenant` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/conflicts/:id` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/devices` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/devices/:id/revoke` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/hubspot/private` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/hubspot/private-production` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/import` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/invites` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/jobs` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/members` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/oauth/hubspot/begin` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/oauth/hubspot/complete` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/oauth/hubspot/disconnect` |  |  | ● | `server/team/app.ts` |
| GET | `/api/team/spaces/:tenant/records` |  |  | ● | `server/team/app.ts` |
| POST | `/api/team/spaces/:tenant/records` |  |  | ● | `server/team/app.ts` |
| GET | `/api/team/spaces/:tenant/v6/capture-diff` |  |  | ● | `server/team/hubspot-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/commercial` |  |  | ● | `server/team/commercial-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/copilot` |  |  | ● | `server/team/copilot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/copilot/begin` |  |  | ● | `server/team/copilot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/copilot/complete` |  |  | ● | `server/team/copilot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/copilot/disconnect` |  |  | ● | `server/team/copilot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/copilot/local-settings` |  |  | ● | `server/team/copilot-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/copilot/preview/:opportunity` |  |  | ● | `server/team/copilot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/copilot/runs` |  |  | ● | `server/team/copilot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/copilot/runs/:id/apply` |  |  | ● | `server/team/copilot-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/customers/:contact` |  |  | ● | `server/team/customers.ts` |
| POST | `/api/team/spaces/:tenant/v6/customers/:contact/actions` |  |  | ● | `server/team/customers.ts` |
| POST | `/api/team/spaces/:tenant/v6/customers/:contact/actions/:id` |  |  | ● | `server/team/customers.ts` |
| GET | `/api/team/spaces/:tenant/v6/file-links` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/file-links` |  |  | ● | `server/team/commercial-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/file-links/:id/context` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/file-links/:id/detach` |  |  | ● | `server/team/commercial-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/files` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/files/picker/begin` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/files/picker/cancel` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/files/picker/complete` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/google/begin` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/google/complete` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/google/disconnect` |  |  | ● | `server/team/commercial-routes.ts` |
| GET | `/api/team/spaces/:tenant/v6/hubspot/:contact` |  |  | ● | `server/team/hubspot-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/proposals` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/proposals/:id/approve` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/proposals/:id/edit` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/proposals/:id/execute` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/proposals/:id/reconcile` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/sheets/:id/import` |  |  | ● | `server/team/commercial-routes.ts` |
| POST | `/api/team/spaces/:tenant/v6/sheets/preview` |  |  | ● | `server/team/commercial-routes.ts` |

## fuera de /api

| Método | Ruta | main | runtime | equipo | Declarada en |
| --- | --- | :---: | :---: | :---: | --- |
| POST | `/internal/jobs/:tenant/:id` |  |  | ● | `server/team/app.ts` |
