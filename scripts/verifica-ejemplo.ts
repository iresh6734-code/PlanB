import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
import { buildMigratedCompany, MIGRATION_AS_OF } from '../shared/verifica/empresa-migrada.js';
import { buildWatchedCompany, WATCH_CLOSING_AT } from '../shared/verifica/empresa-vigilada.js';
// Verifica · archivos de ejemplo de la empresa ficticia, para probar a mano la sala limpia y el verificador sin tocar
// ningún CRM: dos capturas, las facturas en CSV (como una exportación de Holded) y lo que declara el vendedor.
// Para la vigilancia, la captura de la firma (firma.json) y las semanales (semana-N.json); con trampas falta la semana 3.
// Todo es inventado. Escribe en una carpeta nueva; si ya existe, no hace nada.
//   npx tsx scripts/verifica-ejemplo.ts <carpeta> [--sin-trampas]
//   npx tsx scripts/verifica-sala-limpia.ts --previous <carpeta>/antes.json --latest <carpeta>/ahora.json --invoices <carpeta>/facturas.csv
//     --declarations <carpeta>/declaraciones.json --report informe.json --custody copia.json --key-out llave.txt
// y después se abre informe.json en verifica.html, y se comprueba con copia.json y la llave.
//   npx tsx scripts/verifica-vigilancia.ts --signing <carpeta>/firma.json --capture <carpeta>/semana-1.json ... --salt sal.txt
//     --report parte.json --as-of 2026-12-26
// y después se abre parte.json en verifica.html.
// Para la migración, la captura del cierre (cierre.json, la misma que la última semana), lo que llegó al CRM del comprador
// (destino.json) y el mapa de campos (mapa.json):
//   npx tsx scripts/verifica-migracion.ts --closing <carpeta>/cierre.json --target <carpeta>/destino.json --map <carpeta>/mapa.json
//     --salt sal.txt --watch parte.json --report equivalencia.json --work-list lista.csv --as-of 2027-01-16
// y después se abre equivalencia.json en verifica.html. lista.csv lleva los IDs reales: no sale del equipo.

export function exampleFiles(traps: boolean): Map<string, string> {
  const company = buildTrapCompany({ traps });
  const names = new Map(company.latest.companies.map(c => [c.id, c.name]));
  const day = (at: string) => at.slice(8, 10) + '/' + at.slice(5, 7) + '/' + at.slice(0, 4);
  const money = (n: number) => n.toFixed(2).replace('.', ',');
  const csv = ['Núm.;Fecha;Contacto;Base imponible;Referencia',
    ...company.invoices.map(f => [f.id, day(f.issuedAt), '"' + (f.companyId ? names.get(f.companyId) ?? '' : '') + '"', money(f.amount), f.dealRef ?? ''].join(';'))];
  return new Map([
    ['antes.json', JSON.stringify(company.previous, null, 2) + '\n'],
    ['ahora.json', JSON.stringify(company.latest, null, 2) + '\n'],
    ['facturas.csv', csv.join('\r\n') + '\r\n'],
    ['declaraciones.json', JSON.stringify(company.declarations, null, 2) + '\n'],
  ]);
}

/** Capturas de la vigilancia: firma.json y semana-N.json. La fecha del parte de ejemplo es WATCH_CLOSING_AT. */
export function watchExampleFiles(traps: boolean): Map<string, string> {
  const watched = buildWatchedCompany({ traps });
  return new Map([
    ['firma.json', JSON.stringify(watched.signing, null, 2) + '\n'],
    ...watched.captures.map(c => [c.id + '.json', JSON.stringify(c, null, 2) + '\n'] as [string, string]),
  ]);
}

/** Migración: cierre.json, destino.json y mapa.json. La fecha del informe de ejemplo es MIGRATION_AS_OF. */
export function migrationExampleFiles(traps: boolean): Map<string, string> {
  const migrated = buildMigratedCompany({ traps });
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  return new Map([['cierre.json', json(migrated.closing)], ['destino.json', json(migrated.target)], ['mapa.json', json(migrated.map)]]);
}

async function main(argv: string[]): Promise<number> {
  const folder = argv.find(a => !a.startsWith('--'));
  if (!folder || argv.some(a => a.startsWith('--') && a !== '--sin-trampas')) { process.stderr.write('Uso: npx tsx scripts/verifica-ejemplo.ts <carpeta-nueva> [--sin-trampas]\n'); return 2; }
  try { await mkdir(folder); } catch { process.stderr.write('No se crea ' + folder + ': ya existe o no se puede crear. Elige una carpeta nueva.\n'); return 1; }
  const traps = !argv.includes('--sin-trampas'), watch = watchExampleFiles(traps), migration = migrationExampleFiles(traps);
  for (const [name, text] of [...exampleFiles(traps), ...watch, ...migration]) await writeFile(join(folder, name), text, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write('Empresa ficticia escrita en ' + folder + ': antes.json, ahora.json, facturas.csv y declaraciones.json.\n'
    + 'Vigilancia: ' + [...watch.keys()].join(', ') + ' (parte con --as-of ' + WATCH_CLOSING_AT.slice(0, 10) + ').\n'
    + 'Migración: ' + [...migration.keys()].join(', ') + ' (informe con --as-of ' + MIGRATION_AS_OF.slice(0, 10) + ').\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { process.stderr.write('No se pudieron escribir los archivos de ejemplo.\n'); process.exitCode = 1; });
}
