// CLAUDE-PERF-BUDGETS · Captura ficticia de tamaño fijo para medir rendimiento.
// Solo datos inventados y deterministas (misma semilla, mismos registros). Nunca lee datos reales.
import { makeFixture } from '../../shared/fixtures.js';
import { MAX_RECORDS, type CrmRecord, type CrmSnapshot, type Link } from '../../shared/model.js';

/** Reparto por entidad de una captura de `total` registros: proporción parecida a una cartera comercial. */
export function distribution(total: number) {
  if (!Number.isInteger(total) || total < 4 || total > MAX_RECORDS) throw new RangeError('total debe estar entre 4 y ' + MAX_RECORDS);
  const companies = Math.max(1, Math.floor(total * 0.15));
  const deals = Math.max(1, Math.floor(total * 0.2));
  const tasks = Math.max(1, Math.floor(total * 0.15));
  return { companies, contacts: total - companies - deals - tasks, deals, tasks };
}

/** Generador congruente lineal: reproducible y sin dependencias. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}

const FIRST = ['Lucía', 'Pablo', 'Ana', 'Marcos', 'Elena', 'Diego', 'Marta', 'Sergio', 'Clara', 'Hugo', 'Laura', 'David', 'Sara', 'Álvaro',
  'Paula', 'Javier', 'Nerea', 'Iván', 'Celia', 'Adrián', 'Vera', 'Raúl', 'Noa', 'Leo', 'Irene', 'Óscar', 'Alba', 'Rubén', 'Carmen', 'Íker'];
const LAST = ['Martín', 'García', 'Ruiz', 'López', 'Santos', 'Navarro', 'Vega', 'Romero', 'Molina', 'Ortega', 'Castro', 'Gil', 'Soler',
  'Ramos', 'Torres', 'Medina', 'Blanco', 'Cano', 'Luna', 'Pascual', 'León', 'Ríos', 'Suárez', 'Ferrer', 'Iglesias', 'Peña', 'Mora'];
const COMPANY = ['Estudio', 'Taller', 'Grupo', 'Servicios', 'Consultoría', 'Distribuciones', 'Laboratorio', 'Casa', 'Agencia', 'Talleres'];
const PLACE = ['Arce', 'Norte', 'Sur', 'Atlas', 'Olmo', 'Brisa', 'Luma', 'Faro', 'Roble', 'Cierzo', 'Alba', 'Duna', 'Sierra', 'Vela', 'Ribera'];
const SUBJECT = ['Preparar propuesta', 'Revisar los detalles', 'Llamar para seguimiento', 'Enviar documentación', 'Confirmar reunión'];
const DEAL = ['Rediseño web', 'Nueva identidad', 'Campaña digital', 'Mantenimiento anual', 'Auditoría'];

const day = (n: number) => '2026-' + String(n % 12 + 1).padStart(2, '0') + '-' + String(n % 28 + 1).padStart(2, '0');

/**
 * Captura ficticia con exactamente `total` registros, relaciones coherentes y la misma estructura que `makeFixture('agency')`.
 * `isTestData` siempre es verdadero: el servidor la trata como datos de prueba.
 */
export function perfSnapshot(total = MAX_RECORDS, seed = 20261118): CrmSnapshot {
  const base = makeFixture('agency');
  const counts = distribution(total);
  const next = random(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  const records: CrmRecord[] = [];
  for (let i = 1; i <= counts.companies; i++) records.push({ id: 'company-' + i, entity: 'companies', values: {
    name: pick(COMPANY) + ' ' + pick(PLACE) + ' ' + i, domain: 'https://empresa-' + i + '.example.com', phone: '900 ' + String(i).padStart(6, '0') } });
  for (let i = 1; i <= counts.contacts; i++) {
    const firstname = pick(FIRST), lastname = pick(LAST) + ' ' + pick(LAST);
    records.push({ id: 'contact-' + i, entity: 'contacts', values: {
      firstname, lastname,
      email: (firstname + '.' + lastname.replace(' ', '.') + '.' + i).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '@example.com',
      phone: '600 ' + String(i).padStart(6, '0'), company_id: 'company-' + (1 + Math.floor(next() * counts.companies)),
      service: pick(['web', 'brand', 'marketing']) } });
  }
  const stages = base.stages.map(stage => stage.id);
  for (let i = 1; i <= counts.deals; i++) records.push({ id: 'deal-' + i, entity: 'deals', values: {
    dealname: pick(DEAL) + ' · ' + i, amount: 500 + Math.floor(next() * 40000), dealstage: pick(stages),
    company_id: 'company-' + (1 + Math.floor(next() * counts.companies)), contact_id: 'contact-' + (1 + Math.floor(next() * counts.contacts)),
    service: pick(['web', 'brand', 'marketing']), closedate: day(i) } });
  for (let i = 1; i <= counts.tasks; i++) records.push({ id: 'task-' + i, entity: 'tasks', values: {
    subject: pick(SUBJECT) + ' · ' + i, due_date: day(i * 7), status: next() < 0.25 ? 'completed' : 'pending',
    contact_id: 'contact-' + (1 + Math.floor(next() * counts.contacts)), deal_id: 'deal-' + (1 + Math.floor(next() * counts.deals)),
    notes: 'Registro ficticio para medir rendimiento.' } });
  const links: Link[] = records.flatMap(record => {
    const entity = base.entities.find(e => e.id === record.entity)!;
    return entity.fields.filter(f => f.type === 'reference' && record.values[f.key]).map(f => ({
      fromEntity: record.entity, fromId: record.id, toEntity: f.referenceEntity!, toId: String(record.values[f.key]), label: f.key }));
  });
  return {
    ...base, id: 'perf-' + total, name: 'Cartera ficticia de rendimiento', capturedAt: '2026-11-18T12:00:00.000Z',
    source: { kind: 'fixture', accountId: 'perf-fixture', isTestData: true, description: 'Captura sintética para medir rendimiento. No procede de ninguna cuenta.' },
    records, links,
    manifest: { complete: true, expectedCounts: { ...counts }, expectedLinks: links.length }
  };
}
