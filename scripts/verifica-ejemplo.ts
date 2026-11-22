import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrapCompany } from '../shared/verifica/empresa-con-trampas.js';
// Verifica · archivos de ejemplo de la empresa ficticia, para probar a mano la sala limpia y el verificador sin tocar
// ningún CRM: dos capturas, las facturas en CSV (como una exportación de Holded) y lo que declara el vendedor.
// Todo es inventado. Escribe en una carpeta nueva; si ya existe, no hace nada.
//   npx tsx scripts/verifica-ejemplo.ts <carpeta> [--sin-trampas]
//   npx tsx scripts/verifica-sala-limpia.ts --previous <carpeta>/antes.json --latest <carpeta>/ahora.json --invoices <carpeta>/facturas.csv
//     --declarations <carpeta>/declaraciones.json --report informe.json --custody copia.json --key-out llave.txt
// y después se abre informe.json en verifica.html, y se comprueba con copia.json y la llave.

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

async function main(argv: string[]): Promise<number> {
  const folder = argv.find(a => !a.startsWith('--'));
  if (!folder || argv.some(a => a.startsWith('--') && a !== '--sin-trampas')) { process.stderr.write('Uso: npx tsx scripts/verifica-ejemplo.ts <carpeta-nueva> [--sin-trampas]\n'); return 2; }
  try { await mkdir(folder); } catch { process.stderr.write('No se crea ' + folder + ': ya existe o no se puede crear. Elige una carpeta nueva.\n'); return 1; }
  for (const [name, text] of exampleFiles(!argv.includes('--sin-trampas'))) await writeFile(join(folder, name), text, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write('Empresa ficticia escrita en ' + folder + ': antes.json, ahora.json, facturas.csv y declaraciones.json.\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { process.stderr.write('No se pudieron escribir los archivos de ejemplo.\n'); process.exitCode = 1; });
}
