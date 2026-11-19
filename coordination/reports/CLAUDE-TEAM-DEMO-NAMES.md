# CLAUDE-TEAM-DEMO-NAMES · Datos de demostración con la voz de la App

**Autor:** Claude (Opus 5.5) · **Fecha:** 19/11/2026 · **Origen:** caso 1 de la revisión 438 de CLAUDE-TEAM-D8.

## Qué cambió

| Archivo | Cambio |
| --- | --- |
| `server/team/demo.ts` | Las dos empresas de la demo pasan de «Empresa ficticia Arce/Faro» a «Empresa de prueba Arce/Faro», según `docs/voz.md` |
| `tests/e2e/customers.spec.ts` | Espera el nombre nuevo, en una sola línea |

## Verificación

- `team` 7/7, `commercial` 18/18, `team-sync-ui` 12/12 y `team-voice-d8` 4/4, que comprueba que no queda «ficticia» en la demo.
- E2E `customers` (arnés aislado y recompilado): el caso de la ficha falla antes de la línea cambiada, al pulsar «Lucía Martín» en el inicio del equipo, que está rediseñado. El otro caso pasa. Es un fallo previo, ajeno a este cambio.

## Huellas

| Archivo | Antes | Después |
| --- | --- | --- |
| `server/team/demo.ts` | `69209e33078e` | `c183678555f0` |
| `tests/e2e/customers.spec.ts` | `55a36bf00ec9` | `a7d783e392d4` |
