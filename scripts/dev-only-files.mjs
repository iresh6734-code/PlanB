// Código de ensayo que solo sirve en la carpeta del repositorio: escribe en `tests/.tmp` de la carpeta del código.
// Ni el kit de relevo (`build-relay-kit.mjs`) ni las fuentes de la entrega (`package-demo.ts`) lo llevan.
import path from 'node:path';

export const DEV_ONLY_FILES = Object.freeze([
  'server/recovery-rehearsal.ts',
  'server/recovery-rehearsal-worker.ts',
  'scripts/rehearse-portable-recovery.ts',
  'tests/recovery-rehearsal.test.ts',
  'tests/recovery-rehearsal-cli.test.ts',
  'tests/independent-rehearsal-contracts.test.ts',
]);

/** `true` si `source` (ruta absoluta o relativa a `repo`) es uno de los archivos solo de desarrollo. */
export function isDevOnly(repo, source) {
  return DEV_ONLY_FILES.includes(path.relative(path.resolve(repo), path.resolve(repo, source)).split(path.sep).join('/'));
}
