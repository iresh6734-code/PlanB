import { MIGRATION_EXPORT_FORMAT, MIGRATION_MAP_FORMAT, migrationExport, migrationMap, type MigrationExport, type MigrationMap } from './migration-verifier.js';

// EXPORTACIONES FICTICIAS HUBSPOT → PIPEDRIVE PARA EL VERIFICADOR DE MIGRACIONES (unidad Claude B · CLAUDE-MIGRATION-VERIFIER-CORE). Son datos de ensayo: proveedores «-fixture», cuentas «fixture-»,
// personas y empresas inventadas con dominios `.test`. No acreditan ningún proveedor ni son una migración real. El origen está en UTC (con «Z») y el destino en hora local de Madrid sin desfase,
// para ejercitar fechas con zona. Cada caso lleva el número que el motor debe producir en `migrationDemoExpectations` (oráculo escrito a mano, independiente del motor).
//
// Contactos → personas (clave: correo normalizado; el ID NO es clave):
//   iguales: ana, ben (correo con otras mayúsculas), ines (su ID 501 coincide con el de OTRA persona del destino: no se empareja por ID), mara
//   con diferencias: carla (teléfono), diego (apellido y hora), leo (falta una fecha obligatoria en el destino)      sin concluir: karla (hora local ambigua por cambio de hora)
//   ausente: elena      dudosos: felix (dos candidatos), gina ×2 (clave repetida en el origen)      sin clave: un contacto sin correo
//   destino: dos sobrantes (jose, con el ID 501, y zoe) y una persona sin correo
// Empresas → organizaciones (clave: dominio): iguales acme y delta; diferente beta (empleados); ausente gamma; sobrante omega.
// Oportunidades → oportunidades (clave: referencia de pedido): relación correcta (d1, d5, d6), ausente en el destino (d2), apuntando a otra (d3), a una inexistente (d4) y no verificable (d7, su empresa no existe en el destino); d5 con etapa sin traducir; d6 con importe distinto; d8 ausente.
type Scalar = string | number | boolean | null;
type Row = { id: string; values: Record<string, Scalar> };
const row = (id: string, values: Record<string, Scalar>): Row => ({ id, values });
const SOURCE = { provider: 'hubspot-fixture', accountId: 'fixture-hubspot-origin' } as const;
const TARGET = { provider: 'pipedrive-fixture', accountId: 'fixture-pipedrive-destino' } as const;

export const migrationDemoExpectations = {
  contact: { identical: 4, changed: 3, uncertain: 1, absent: 1, notFound: 0, doubtful: 3, missingKey: 1, matchedTargets: 8, extra: 2, unverifiedExtra: 0, doubtfulTargets: 3, unmatchedTargetKeyless: 1, relations: { total: 8, ok: 7, broken: 0, inconclusive: 1 } },
  company: { identical: 2, changed: 1, uncertain: 0, absent: 1, notFound: 0, doubtful: 0, missingKey: 0, matchedTargets: 3, extra: 1, unverifiedExtra: 0, doubtfulTargets: 0, unmatchedTargetKeyless: 0, relations: { total: 0, ok: 0, broken: 0, inconclusive: 0 } },
  deal: { identical: 5, changed: 1, uncertain: 1, absent: 1, notFound: 0, doubtful: 0, missingKey: 0, matchedTargets: 7, extra: 1, unverifiedExtra: 0, doubtfulTargets: 0, unmatchedTargetKeyless: 0, relations: { total: 7, ok: 3, broken: 3, inconclusive: 1 } },
} as const;

/** Exportaciones y mapa ficticios, ya validados con el esquema. Cada llamada devuelve copias independientes. */
export function createMigrationDemo(): { source: MigrationExport; target: MigrationExport; map: MigrationMap } {
  const contacts: Row[] = [
    row('1001', { email: 'ana@example.test', first_name: 'Ana', last_name: 'Ruiz', phone: '+34 600 000 001', company_id: 'co1', created_at: '2026-03-10T09:00:00Z', marketing_opt_in: true, nickname: null }),
    row('1002', { email: 'ben@example.test', first_name: 'Ben', last_name: 'Soto', phone: '+34 600 000 002', company_id: 'co1', created_at: '2026-03-11T10:30:00Z', marketing_opt_in: false, nickname: 'Benito' }),
    row('1003', { email: 'carla@example.test', first_name: 'Carla', last_name: 'Vega', phone: '+34 600 000 003', company_id: 'co2', created_at: '2026-03-12T08:00:00Z', marketing_opt_in: true, nickname: null }),
    row('1004', { email: 'diego@example.test', first_name: 'Diego', last_name: 'Mora', phone: '+34 600 000 004', company_id: 'co2', created_at: '2026-03-13T08:00:00Z', marketing_opt_in: true, nickname: null }),
    row('1005', { email: 'elena@example.test', first_name: 'Elena', last_name: 'Gil', phone: '+34 600 000 005', company_id: 'co1', created_at: '2026-03-14T08:00:00Z', marketing_opt_in: false, nickname: null }),
    row('1006', { email: 'felix@example.test', first_name: 'Félix', last_name: 'Pons', phone: '+34 600 000 006', company_id: 'co4', created_at: '2026-03-15T08:00:00Z', marketing_opt_in: true, nickname: null }),
    row('1007', { email: 'gina@example.test', first_name: 'Gina', last_name: 'Ortiz', phone: '+34 600 000 007', company_id: 'co4', created_at: '2026-03-16T08:00:00Z', marketing_opt_in: true, nickname: null }),
    row('1008', { email: 'gina@example.test', first_name: 'Gina', last_name: 'Ortiz', phone: '+34 600 000 007', company_id: 'co4', created_at: '2026-03-16T08:05:00Z', marketing_opt_in: true, nickname: null }),
    row('1009', { email: '', first_name: 'Hugo', last_name: 'Sin Correo', phone: '+34 600 000 009', company_id: 'co1', created_at: '2026-03-17T08:00:00Z', marketing_opt_in: false, nickname: null }),
    row('501', { email: 'ines@example.test', first_name: 'Inés', last_name: 'Cano', phone: '+34 600 000 010', company_id: 'co1', created_at: '2026-03-18T08:00:00Z', marketing_opt_in: true, nickname: null }),
    row('1011', { email: 'karla@example.test', first_name: 'Karla', last_name: 'Nieto', phone: '+34 600 000 011', company_id: 'co1', created_at: '2026-10-25T01:30:00Z', marketing_opt_in: true, nickname: null }),
    row('1012', { email: 'leo@example.test', first_name: 'Leo', last_name: 'Prado', phone: '+34 600 000 012', company_id: 'co4', created_at: '2026-04-01T10:00:00Z', marketing_opt_in: false, nickname: null }),
    row('1013', { email: 'mara@example.test', first_name: 'Mara', last_name: 'Luna', phone: '+34 600 000 013', company_id: 'co3', created_at: '2026-04-02T10:00:00Z', marketing_opt_in: true, nickname: null }),
  ];
  const companies: Row[] = [
    row('co1', { name: 'Acme Instalaciones', domain: 'acme.test', employees: 120 }), row('co2', { name: 'Beta Logística', domain: 'beta.test', employees: 40 }),
    row('co3', { name: 'Gamma Servicios', domain: 'gamma.test', employees: 15 }), row('co4', { name: 'Delta Taller', domain: 'delta.test', employees: 7 }),
  ];
  const deals: Row[] = [
    row('d1', { order_ref: 'PED-1', title: 'Instalación Norte', amount: 12000, stage: 'closedwon', close_date: '2026-05-01', company_id: 'co1' }),
    row('d2', { order_ref: 'PED-2', title: 'Instalación Sur', amount: 8000, stage: 'closedwon', close_date: '2026-05-02', company_id: 'co1' }),
    row('d3', { order_ref: 'PED-3', title: 'Reposición Este', amount: 3000, stage: 'qualified', close_date: '2026-05-03', company_id: 'co2' }),
    row('d4', { order_ref: 'PED-4', title: 'Reposición Oeste', amount: 4500, stage: 'qualified', close_date: '2026-05-04', company_id: 'co2' }),
    row('d5', { order_ref: 'PED-5', title: 'Proyecto Centro', amount: 9000, stage: 'legacy_stage', close_date: '2026-05-05', company_id: 'co1' }),
    row('d6', { order_ref: 'PED-6', title: 'Mantenimiento', amount: 1200, stage: 'closedwon', close_date: '2026-05-06', company_id: 'co4' }),
    row('d7', { order_ref: 'PED-7', title: 'Entrega Gamma', amount: 2000, stage: 'qualified', close_date: '2026-05-07', company_id: 'co3' }),
    row('d8', { order_ref: 'PED-8', title: 'Pedido sin migrar', amount: 700, stage: 'qualified', close_date: '2026-05-08', company_id: 'co1' }),
  ];
  const persons: Row[] = [
    row('p-1', { email: 'ana@example.test', name_first: 'Ana', name_last: 'Ruiz', phone: '+34600000001', org_id: 'o1', add_time: '2026-03-10 10:00:00', newsletter: 'true', nickname: null }),
    row('p-2', { email: 'BEN@Example.TEST', name_first: 'Ben', name_last: 'Soto', phone: '+34600000002', org_id: 'o1', add_time: '2026-03-11 11:30:00', newsletter: 'false', nickname: 'Benito' }),
    row('p-3', { email: 'carla@example.test', name_first: 'Carla', name_last: 'Vega', phone: '+34 600 999 003', org_id: 'o2', add_time: '2026-03-12 09:00:00', newsletter: 'true', nickname: null }),
    row('p-4', { email: 'diego@example.test', name_first: 'Diego', name_last: 'Moral', phone: '+34 600 000 004', org_id: 'o2', add_time: '2026-03-13 10:00:00', newsletter: 'true', nickname: null }),
    row('p-6a', { email: 'felix@example.test', name_first: 'Félix', name_last: 'Pons', phone: '+34 600 000 006', org_id: 'o4', add_time: '2026-03-15 09:00:00', newsletter: 'true', nickname: null }),
    row('p-6b', { email: 'felix@example.test', name_first: 'Félix', name_last: 'Pons', phone: '+34 600 000 006', org_id: 'o4', add_time: '2026-03-15 09:00:00', newsletter: 'true', nickname: null }),
    row('p-7', { email: 'gina@example.test', name_first: 'Gina', name_last: 'Ortiz', phone: '+34 600 000 007', org_id: 'o4', add_time: '2026-03-16 09:00:00', newsletter: 'true', nickname: null }),
    row('501', { email: 'jose@example.test', name_first: 'José', name_last: 'Blanco', phone: '+34 600 000 099', org_id: 'o2', add_time: '2026-02-01 09:00:00', newsletter: 'false', nickname: null }),
    row('777', { email: 'ines@example.test', name_first: 'Inés', name_last: 'Cano', phone: '+34 600 000 010', org_id: 'o1', add_time: '2026-03-18 09:00:00', newsletter: 'true', nickname: null }),
    row('p-11', { email: 'karla@example.test', name_first: 'Karla', name_last: 'Nieto', phone: '+34 600 000 011', org_id: 'o1', add_time: '2026-10-25 02:30:00', newsletter: 'true', nickname: null }),
    row('p-12', { email: 'leo@example.test', name_first: 'Leo', name_last: 'Prado', phone: '+34 600 000 012', org_id: 'o4', add_time: null, newsletter: 'false', nickname: null }),
    row('p-13', { email: 'mara@example.test', name_first: 'Mara', name_last: 'Luna', phone: '+34 600 000 013', org_id: 'o3', add_time: '2026-04-02 12:00:00', newsletter: 'true', nickname: null }),
    row('p-99', { email: 'zoe@example.test', name_first: 'Zoe', name_last: 'Alba', phone: '+34 600 000 098', org_id: 'o1', add_time: '2026-04-03 09:00:00', newsletter: 'true', nickname: null }),
    row('p-100', { email: null, name_first: 'Sin', name_last: 'Correo', phone: '+34 600 000 097', org_id: null, add_time: '2026-04-04 09:00:00', newsletter: 'false', nickname: null }),
  ];
  const orgs: Row[] = [
    row('o1', { name: 'Acme Instalaciones', domain: 'ACME.test', employees: 120 }), row('o2', { name: 'Beta Logística', domain: 'beta.test', employees: 45 }),
    row('o4', { name: 'Delta Taller', domain: 'delta.test', employees: 7 }), row('o9', { name: 'Omega Sistemas', domain: 'omega.test', employees: 3 }),
  ];
  const targetDeals: Row[] = [
    row('t-1', { ref: 'PED-1', title: 'Instalación Norte', value: 12000, status: 'won', expected_close: '2026-05-01', org_id: 'o1' }),
    row('t-2', { ref: 'PED-2', title: 'Instalación Sur', value: 8000, status: 'won', expected_close: '2026-05-02', org_id: null }),
    row('t-3', { ref: 'PED-3', title: 'Reposición Este', value: 3000, status: 'open', expected_close: '2026-05-03', org_id: 'o4' }),
    row('t-4', { ref: 'PED-4', title: 'Reposición Oeste', value: 4500, status: 'open', expected_close: '2026-05-04', org_id: 'o99' }),
    row('t-5', { ref: 'PED-5', title: 'Proyecto Centro', value: 9000, status: 'open', expected_close: '2026-05-05', org_id: 'o1' }),
    row('t-6', { ref: 'PED-6', title: 'Mantenimiento', value: 1250, status: 'won', expected_close: '2026-05-06', org_id: 'o4' }),
    row('t-7', { ref: 'PED-7', title: 'Entrega Gamma', value: 2000, status: 'open', expected_close: '2026-05-07', org_id: 'o1' }),
    row('t-99', { ref: 'PED-99', title: 'Pedido solo en destino', value: 100, status: 'open', expected_close: '2026-05-09', org_id: 'o1' }),
  ];
  const source: MigrationExport = { format: MIGRATION_EXPORT_FORMAT, ...SOURCE, exportedAt: '2026-11-08T08:00:00.000Z', timezone: 'UTC', objects: [
    { objectType: 'contact', coverage: 'complete', declaredTotal: contacts.length, rows: contacts },
    { objectType: 'company', coverage: 'complete', declaredTotal: companies.length, rows: companies },
    { objectType: 'deal', coverage: 'complete', declaredTotal: deals.length, rows: deals },
  ] };
  const target: MigrationExport = { format: MIGRATION_EXPORT_FORMAT, ...TARGET, exportedAt: '2026-11-08T09:00:00.000Z', timezone: 'Europe/Madrid', objects: [
    { objectType: 'person', coverage: 'complete', declaredTotal: persons.length, rows: persons },
    { objectType: 'organization', coverage: 'complete', declaredTotal: orgs.length, rows: orgs },
    { objectType: 'deal', coverage: 'complete', declaredTotal: targetDeals.length, rows: targetDeals },
  ] };
  const map: MigrationMap = {
    format: MIGRATION_MAP_FORMAT, sourceProvider: SOURCE.provider, sourceAccountId: SOURCE.accountId, targetProvider: TARGET.provider, targetAccountId: TARGET.accountId,
    confirmedBy: 'Persona de ensayo', confirmedAt: '2026-11-08T08:30:00.000Z',
    objects: [
      { sourceObject: 'contact', targetObject: 'person', acknowledgeIdEquivalence: false, matchKey: [{ source: 'email', target: 'email', normalize: 'email' }], fields: [
        { source: 'first_name', target: 'name_first', type: 'text', normalize: 'trim', required: true, relevant: true },
        { source: 'last_name', target: 'name_last', type: 'text', normalize: 'trim', required: true, relevant: true },
        { source: 'phone', target: 'phone', type: 'text', normalize: 'digits', required: false, relevant: true },
        { source: 'created_at', target: 'add_time', type: 'datetime', normalize: 'exact', required: true, relevant: true },
        { source: 'marketing_opt_in', target: 'newsletter', type: 'boolean', normalize: 'exact', required: false, relevant: true },
        { source: 'nickname', target: 'nickname', type: 'text', normalize: 'trim', required: false, relevant: true },
      ], relations: [{ sourceField: 'company_id', sourceObject: 'company', targetField: 'org_id', targetObject: 'organization' }] },
      { sourceObject: 'company', targetObject: 'organization', acknowledgeIdEquivalence: false, matchKey: [{ source: 'domain', target: 'domain', normalize: 'lower' }], fields: [
        { source: 'name', target: 'name', type: 'text', normalize: 'trim', required: true, relevant: true },
        { source: 'employees', target: 'employees', type: 'number', normalize: 'exact', required: false, relevant: true },
      ], relations: [] },
      { sourceObject: 'deal', targetObject: 'deal', acknowledgeIdEquivalence: false, matchKey: [{ source: 'order_ref', target: 'ref', normalize: 'trim' }], fields: [
        { source: 'title', target: 'title', type: 'text', normalize: 'trim', required: true, relevant: true },
        { source: 'amount', target: 'value', type: 'number', normalize: 'exact', required: true, relevant: true },
        { source: 'stage', target: 'status', type: 'text', normalize: 'lower', required: true, relevant: true, valueMap: { closedwon: 'won', qualified: 'open' } },
        { source: 'close_date', target: 'expected_close', type: 'date', normalize: 'exact', required: true, relevant: true },
      ], relations: [{ sourceField: 'company_id', sourceObject: 'company', targetField: 'org_id', targetObject: 'organization' }] },
    ],
  };
  return { source: migrationExport.parse(source), target: migrationExport.parse(target), map: migrationMap.parse(map) };
}
