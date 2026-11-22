// Plan B Verifica · prueba de referencia de la migración: la empresa migrada (fase 4).
// Parte de la empresa vigilada de la misma variante: su última captura es la del cierre. El comprador la migra a un CRM
// ficticio de otro proveedor («pipedrive», cuenta del comprador) con sus propios IDs y guarda el ID de origen en `hubspot_id`.
// Con `traps: true` siembra seis trampas, cada una en registros distintos:
//   12 contactos no llegan · 2 contactos llegan duplicados · 5 importes llegan multiplicados por 100 (céntimos) ·
//   3 fechas de cierre llegan como «31/12/2026» · 4 oportunidades cuelgan de otra empresa · 3 empresas antiguas reviven.
// Como en las otras pruebas de referencia, lo esperado se anota MIENTRAS se siembra, no aplicando el verificador.
import { MIGRATION_EXPORT_FORMAT, MIGRATION_MAP_FORMAT, type MigrationExport, type MigrationMap } from '../migration-verifier.js';
import { buildWatchedCompany, WATCH_CLOSING_AT, WATCH_SALT } from './empresa-vigilada.js';
import { OBJECT_LABEL, type EquivalenceFindingKind, type EquivalenceObject, type EquivalenceReport, type EquivalenceVerdict } from './equivalence.js';
import type { VerificaCapture } from './model.js';
import { buildWatchReport, type WatchReport } from './watch.js';

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();
/** El informe se pide tres semanas después del cierre, con la migración ya hecha. */
export const MIGRATION_AS_OF = iso(Date.parse(WATCH_CLOSING_AT) + 21 * DAY);
/** La misma sal que la vigilancia: los seudónimos del informe y del parte coinciden. */
export const MIGRATION_SALT = WATCH_SALT;
export const TARGET_PROVIDER = 'pipedrive';
export const TARGET_ACCOUNT = 'comprador-ficticio';

type FindingKey = `${EquivalenceObject}:${EquivalenceFindingKind}`;
export interface ExpectedEquivalence {
  verdict: EquivalenceVerdict;
  objects: Record<EquivalenceObject, { closing: number; target: number; intact: number }>;
  /** Registros por hallazgo. Un hallazgo que no está aquí no debe aparecer. */
  findings: Partial<Record<FindingKey, number>>;
}

export interface MigratedCompany {
  /** La última captura de la vigilancia. */
  closing: VerificaCapture;
  /** El parte de vigilancia, cuya última captura es `closing`. */
  watch: WatchReport;
  target: MigrationExport;
  map: MigrationMap;
  asOf: string;
  salt: string;
  expected: ExpectedEquivalence;
  /** Nombres, correos e IDs del cierre y del destino que nunca pueden salir en el informe. */
  forbidden: string[];
}

type Row = MigrationExport['objects'][number]['rows'][number];
const STATUS = { open: 'abierta', won: 'ganada', lost: 'perdida' } as const;
const spanishDate = (day: string) => day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);

export function buildMigratedCompany(options: { traps: boolean }): MigratedCompany {
  const { traps } = options;
  const watched = buildWatchedCompany({ traps });
  const closing = watched.captures.at(-1)!;
  const watch = buildWatchReport({ signing: watched.signing, captures: watched.captures, asOf: watched.asOf, salt: watched.salt });
  const asOf = Date.parse(MIGRATION_AS_OF);

  const orgId = new Map(closing.companies.map((c, i) => [c.id, 'org-' + (1001 + i)]));
  const org = (companyId: string | null) => (companyId ? orgId.get(companyId) ?? null : null);
  const organizations: Row[] = closing.companies.map(c => ({ id: orgId.get(c.id)!, values: { name: c.name, hubspot_id: c.id } }));
  let persons: Row[] = closing.contacts.map((p, i) => ({ id: 'per-' + (1001 + i), values: { name: p.name, email: p.email, org_id: org(p.companyId), hubspot_id: p.id } }));
  const deals: Row[] = closing.deals.map((d, i) => ({ id: 'neg-' + (1001 + i), values: { title: d.name, value: d.amount, status: STATUS[d.status], close_date: d.closeDate, org_id: org(d.companyId), hubspot_id: d.id } }));

  const closingCounts = { companies: closing.companies.length, contacts: closing.contacts.length, deals: closing.deals.length };
  const expected: ExpectedEquivalence = {
    verdict: 'no-differences-in-scope',
    objects: {
      companies: { ...pair(closingCounts.companies), intact: closingCounts.companies },
      contacts: { ...pair(closingCounts.contacts), intact: closingCounts.contacts },
      deals: { ...pair(closingCounts.deals), intact: closingCounts.deals },
    },
    findings: {},
  };
  const extraNames: string[] = [];

  if (traps) {
    expected.verdict = 'differences-found';
    // Contactos: 12 se quedan fuera y 2 llegan dos veces, con el mismo hubspot_id.
    const lost = closing.contacts.filter((_, i) => i % 20 === 3).slice(0, 12).map(p => p.id);
    const twice = closing.contacts.filter((_, i) => i % 20 === 7).slice(0, 2).map(p => p.id);
    const copies = persons.filter(r => twice.includes(String(r.values.hubspot_id))).map((r, k) => ({ id: 'per-' + (9001 + k), values: { ...r.values } }));
    persons = [...persons.filter(r => !lost.includes(String(r.values.hubspot_id))), ...copies];
    expected.objects.contacts = { closing: closingCounts.contacts, target: closingCounts.contacts - lost.length + copies.length, intact: closingCounts.contacts - lost.length - twice.length };
    expected.findings['contacts:absent'] = lost.length;
    expected.findings['contacts:doubtful'] = twice.length;

    // Oportunidades: solo las que tienen importe, fecha y empresa, para que cada trampa se note en un solo campo.
    const eligible = deals.filter(r => typeof r.values.value === 'number' && r.values.value > 0 && r.values.close_date && r.values.org_id);
    const cents = eligible.filter((_, i) => i % 20 === 1).slice(0, 5);
    const dates = eligible.filter((_, i) => i % 20 === 5).slice(0, 3);
    const relinked = eligible.filter((_, i) => i % 20 === 9).slice(0, 4);
    for (const r of cents) r.values.value = (r.values.value as number) * 100;
    for (const r of dates) r.values.close_date = spanishDate(String(r.values.close_date));
    for (const r of relinked) {
      const at = organizations.findIndex(o => o.id === r.values.org_id);
      r.values.org_id = organizations[(at + 1) % organizations.length]!.id;
    }
    const touched = cents.length + dates.length + relinked.length;
    expected.objects.deals = { closing: closingCounts.deals, target: closingCounts.deals, intact: closingCounts.deals - touched };
    expected.findings['deals:changed'] = cents.length;
    expected.findings['deals:uncertain'] = dates.length;
    expected.findings['deals:relation-broken'] = relinked.length;

    // Empresas: tres de una exportación antigua, con IDs que ya no están en el cierre.
    for (let k = 1; k <= 3; k++) {
      extraNames.push('Cliente Ficticio Antiguo ' + k + ' S.L.');
      organizations.push({ id: 'org-' + (9000 + k), values: { name: extraNames.at(-1)!, hubspot_id: 'c9' + String(k).padStart(2, '0') } });
    }
    expected.objects.companies = { closing: closingCounts.companies, target: closingCounts.companies + 3, intact: closingCounts.companies };
    expected.findings['companies:extra'] = 3;
  }

  const target: MigrationExport = {
    format: MIGRATION_EXPORT_FORMAT, provider: TARGET_PROVIDER, accountId: TARGET_ACCOUNT, exportedAt: iso(asOf - DAY), timezone: null,
    objects: [
      { objectType: 'organizations', coverage: 'complete', declaredTotal: organizations.length, rows: organizations },
      { objectType: 'persons', coverage: 'complete', declaredTotal: persons.length, rows: persons },
      { objectType: 'deals', coverage: 'complete', declaredTotal: deals.length, rows: deals },
    ],
  };
  const byId = { source: '$id', target: 'hubspot_id', normalize: 'exact' } as const;
  const toCompany = { sourceField: 'companyId', sourceObject: 'companies', targetField: 'org_id', targetObject: 'organizations' };
  const map: MigrationMap = {
    format: MIGRATION_MAP_FORMAT,
    sourceProvider: closing.source, sourceAccountId: closing.id, targetProvider: TARGET_PROVIDER, targetAccountId: TARGET_ACCOUNT,
    confirmedBy: 'Equipo de migración ficticio', confirmedAt: iso(asOf - 2 * DAY),
    objects: [
      { sourceObject: 'companies', targetObject: 'organizations', matchKey: [byId], acknowledgeIdEquivalence: true, relations: [],
        fields: [{ source: 'name', target: 'name', type: 'text', normalize: 'trim', required: true, relevant: true }] },
      { sourceObject: 'contacts', targetObject: 'persons', matchKey: [byId], acknowledgeIdEquivalence: true, relations: [toCompany],
        fields: [
          { source: 'name', target: 'name', type: 'text', normalize: 'trim', required: true, relevant: true },
          { source: 'email', target: 'email', type: 'text', normalize: 'email', required: false, relevant: true },
        ] },
      { sourceObject: 'deals', targetObject: 'deals', matchKey: [byId], acknowledgeIdEquivalence: true, relations: [toCompany],
        fields: [
          { source: 'name', target: 'title', type: 'text', normalize: 'trim', required: true, relevant: true },
          { source: 'amount', target: 'value', type: 'number', normalize: 'exact', required: false, relevant: true },
          { source: 'status', target: 'status', type: 'text', normalize: 'exact', required: true, relevant: true, valueMap: { ...STATUS } },
          { source: 'closeDate', target: 'close_date', type: 'date', normalize: 'exact', required: false, relevant: true },
        ] },
    ],
  };

  const forbidden = [
    ...closing.owners.map(o => o.name), ...closing.companies.map(c => c.name), ...closing.contacts.flatMap(c => [c.name, c.email ?? '']), ...closing.deals.map(d => d.name), ...extraNames,
    ...(['owners', 'companies', 'contacts', 'deals'] as const).flatMap(kind => closing[kind].map(r => '"' + r.id + '"')),
    ...target.objects.flatMap(o => o.rows.map(r => '"' + r.id + '"')),
  ].filter(Boolean);

  return { closing, watch, target, map, asOf: MIGRATION_AS_OF, salt: MIGRATION_SALT, expected, forbidden };
}

const pair = (n: number) => ({ closing: n, target: n });

/** Diferencias entre un informe de equivalencia y lo esperado. Vacío = la prueba pasa. */
export function checkEquivalence(report: EquivalenceReport, expected: ExpectedEquivalence): string[] {
  const problems: string[] = [];
  if (report.verdict !== expected.verdict) problems.push('veredicto: ' + report.verdict + ', se esperaba ' + expected.verdict);
  for (const [object, want] of Object.entries(expected.objects) as [EquivalenceObject, ExpectedEquivalence['objects'][EquivalenceObject]][]) {
    const got = report.objects.find(o => o.object === object);
    if (!got) { problems.push(OBJECT_LABEL[object] + ': falta'); continue; }
    for (const key of ['closing', 'target', 'intact'] as const) if (got[key] !== want[key]) problems.push(OBJECT_LABEL[object] + '.' + key + ': ' + got[key] + ', se esperaba ' + want[key]);
  }
  const got = new Map(report.findings.map(f => [f.object + ':' + f.kind, f.figures.records]));
  for (const [key, want] of Object.entries(expected.findings)) if (got.get(key) !== want) problems.push(key + ': ' + (got.get(key) ?? 'falta') + ', se esperaba ' + want);
  for (const key of got.keys()) if (!(key in expected.findings)) problems.push(key + ': no se esperaba');
  return problems;
}
