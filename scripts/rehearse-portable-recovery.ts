import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { Store } from '../server/store.js';
import { encodePortable } from '../server/crypto.js';
import { rehearsePortableRecovery } from '../server/recovery-rehearsal.js';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
if (!args.length || args.length === 1 && args[0] === '--help') {
  process.stdout.write('Plan B · Ensayo de recuperación con datos ficticios nuevos\nUso: node --import tsx scripts/rehearse-portable-recovery.ts --run-fixture\nSin --run-fixture solo muestra ayuda. Crea una carpeta nueva en tests/.tmp/recovery-rehearsals, restaura por API sin listener y comprueba otro proceso.\nNo lee copias, bases, perfiles o instalaciones existentes. Conserva una base ficticia y un informe sin datos de fichas.\nNo prueba interfaz, paquete instalado, otro equipo o RTO garantizado.\n');
} else if (args.length === 1 && args[0] === '--run-fixture') {
  try {
    const store = new Store(':memory:'), snapshot = makeFixture();
    let raw: string; const password = 'fixture-' + randomUUID();
    try {
      store.importSnapshot(snapshot); store.saveGeneration(makeDemoSpec(snapshot), { provider: 'demo', model: null, generatedAt: new Date().toISOString(), prompt: '', approved: false }); store.activate();
      store.saveRecord('contacts', { phone: 'solo-cambio-ficticio-050' }, 'contact-1');
      raw = encodePortable(store.bundle(), password);
    } finally { store.close(); }
    const report = rehearsePortableRecovery({ raw, password });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exitCode = report.status === 'passed' ? 0 : 1;
  } catch { process.stderr.write('No se pudo preparar el ensayo ficticio. No se ha restaurado ninguna instalación existente.\n'); process.exitCode = 2; }
} else {
  process.stderr.write('Argumentos no admitidos. Usa --help o --run-fixture; no se aceptan rutas o contraseñas.\n'); process.exitCode = 2;
}
