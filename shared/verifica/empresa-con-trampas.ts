// Plan B Verifica · prueba de referencia: la empresa con trampas (docs/plan-b-verifica-plan-de-producto.md).
// Una distribuidora B2B FICTICIA: 300 clientes, 6 comerciales, 12 meses de historia y una exportación de facturas.
// Determinista (generador con semilla) y sin datos reales. Con `traps: true` siembra las seis trampas;
// con `traps: false` es la misma empresa sana, que no debe dar ningún aviso.
// El resultado esperado se anota MIENTRAS se siembra, no aplicando las reglas: así la prueba no se da la razón a sí misma.
import type { HistoryEntry, VerificaBasis, VerificaCapture, VerificaCompany, VerificaContact, VerificaDeal, VerificaDeclarations, VerificaInvoice, VerificaOwner, VerificaRuleId } from './model.js';
import type { VerificaReport } from './report.js';

const DAY = 86_400_000, HOUR = 3_600_000;
export const TRAP_AS_OF = '2026-11-20T09:00:00.000Z';
const NOW = Date.parse(TRAP_AS_OF);
const START = NOW - 365 * DAY, PREVIOUS_AT = NOW - 7 * DAY, WINDOW_START = NOW - 42 * DAY;
/** Sal fija solo para la empresa ficticia; un informe real usa una sal secreta del vendedor. */
export const TRAP_SALT = 'empresa-con-trampas · sal de prueba';

export type ExpectedFigure = number | { min?: number; max?: number };
export interface ExpectedFinding { alarm: boolean; basis: VerificaBasis; figures: Record<string, ExpectedFigure> }

export interface TrapCompany {
  asOf: string;
  salt: string;
  previous: VerificaCapture;
  latest: VerificaCapture;
  invoices: VerificaInvoice[];
  declarations: VerificaDeclarations;
  expected: Record<VerificaRuleId, ExpectedFinding>;
  /** Textos que nunca pueden aparecer en el informe: nombres, correos e identificadores del CRM. */
  forbidden: string[];
}

/** mulberry32: pequeño, determinista y suficiente para importes de prueba. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (t: number) => new Date(t).toISOString();
const dateOnly = (t: number) => iso(t).slice(0, 10);
const pad = (n: number) => String(n).padStart(3, '0');
const companyId = (n: number) => 'c' + pad(n);

export function buildTrapCompany(options: { traps: boolean }): TrapCompany {
  const { traps } = options;
  const random = seeded(20261120);
  const owners: VerificaOwner[] = ['Ana', 'Bruno', 'Carla', 'David', 'Elena', 'Fermín'].map((name, i) => ({ id: 'o' + (i + 1), name: 'Comercial Ficticio ' + name }));
  const companies: VerificaCompany[] = Array.from({ length: 300 }, (_, i) => ({ id: companyId(i + 1), name: 'Cliente Ficticio ' + (i + 1) + ' S.L.', customer: true }));
  const allContacts: VerificaContact[] = Array.from({ length: 325 }, (_, i) => ({ id: 'p' + pad(i + 1), name: 'Persona Ficticia ' + (i + 1), email: 'persona' + (i + 1) + '@cliente' + (i + 1) + '.example', companyId: companyId((i % 300) + 1) }));

  const deals: VerificaDeal[] = [];
  const deal = (id: string, created: number, amount: number, status: VerificaDeal['status'], ownerId: string, company: string, close: number): VerificaDeal => {
    const d: VerificaDeal = { id, name: 'Oportunidad ficticia ' + id, companyId: company, ownerId, status, amount, createdAt: iso(created), closeDate: dateOnly(close), history: { amount: [{ value: amount, at: iso(created) }], closeDate: [{ value: dateOnly(close), at: iso(created) }] } };
    deals.push(d);
    return d;
  };
  const pushClose = (d: VerificaDeal, at: number, to: number) => { d.history!.closeDate.push({ value: dateOnly(to), at: iso(at) }); d.closeDate = dateOnly(to); };
  const raiseAmount = (d: VerificaDeal, at: number, by: number) => { d.amount = (d.amount ?? 0) + by; d.history!.amount.push({ value: d.amount, at: iso(at) }); };

  // Actividad normal: 6 oportunidades por semana durante 52 semanas. Las de más de 90 días ya se cerraron casi todas.
  const baseline: VerificaDeal[] = [];
  for (let w = 0; w < 52; w++) for (let i = 0; i < 6; i++) {
    const idx = w * 6 + i, created = START + w * 7 * DAY + i * DAY + 10 * HOUR;
    const amount = 4000 + Math.floor(random() * 161) * 100;
    const old = NOW - created > 90 * DAY;
    const status: VerificaDeal['status'] = old ? (['won', 'won', 'won', 'lost', 'open'] as const)[idx % 5]! : 'open';
    const owner = traps && status === 'open' ? (idx % 10 < 6 ? (idx % 2 === 0 ? 'o1' : 'o2') : 'o' + (3 + (idx % 4))) : 'o' + ((idx % 6) + 1);
    const d = deal('d' + String(idx + 1).padStart(4, '0'), created, amount, status, owner, companyId(((idx * 7) % 240) + 1), created + (status === 'open' ? 90 : 45) * DAY);
    // Una abierta antigua con la fecha vencida se aplaza una vez: es lo normal.
    if (status === 'open' && created + 90 * DAY < NOW) pushClose(d, created + 90 * DAY, NOW + 30 * DAY);
    baseline.push(d);
  }
  // En las dos variantes: tres ganadas hace 10 días, aún sin facturar (normal), y una abierta aplazada tres veces (aislada).
  const recentWins = [1, 2, 3].map(n => deal('r0' + n, NOW - 80 * DAY, 9000, 'won', 'o' + n, companyId(10 + n), NOW - 10 * DAY));
  const legit = deal('l01', NOW - 75 * DAY, 6000, 'open', 'o3', companyId(50), NOW - 45 * DAY);
  pushClose(legit, NOW - 55 * DAY, NOW - 30 * DAY); pushClose(legit, NOW - 35 * DAY, NOW - 15 * DAY); pushClose(legit, NOW - 20 * DAY, NOW + 5 * DAY);

  const middleAged = baseline.filter(d => d.status === 'open' && Date.parse(d.createdAt) >= NOW - 90 * DAY && Date.parse(d.createdAt) <= NOW - 50 * DAY);
  let raised: VerificaDeal[] = [], pushed: VerificaDeal[] = [];
  if (traps) {
    // Trampa 1: 14 oportunidades grandes creadas en la ventana de venta y 6 subidas de importe.
    for (let k = 0; k < 14; k++) deal('w' + String(k + 1).padStart(2, '0'), NOW - (40 - 2 * k) * DAY, 30000 + k * 2000, 'open', k % 2 ? 'o2' : 'o1', companyId(20 + k), NOW + 50 * DAY);
    raised = middleAged.slice(0, 6);
    for (const d of raised) raiseAmount(d, NOW - 20 * DAY, 25000);
    // Trampa 2: 7 abiertas aplazadas tres veces.
    pushed = middleAged.slice(6, 13);
    for (const d of pushed) { const c = Date.parse(d.createdAt); pushClose(d, c + 10 * DAY, c + 120 * DAY); pushClose(d, c + 25 * DAY, c + 150 * DAY); pushClose(d, c + 40 * DAY, c + 180 * DAY); }
  }

  // Facturas: una por ganada con su referencia, y una cuota trimestral por cliente sin referencia.
  const won = baseline.filter(d => d.status === 'won');
  const missing = traps ? won.filter((_, i) => i % 10 === 0).slice(0, 12) : [];
  const ambiguous = traps ? won.filter((_, i) => i % 10 === 5).slice(0, 4) : [];
  const invoices: VerificaInvoice[] = [];
  for (const d of won) {
    if (missing.includes(d)) continue;
    invoices.push({ id: 'f-' + d.id, companyId: d.companyId, amount: d.amount ?? 0, issuedAt: iso(Date.parse(d.closeDate!) + 10 * DAY), dealRef: ambiguous.includes(d) ? null : d.id });
  }
  // Trampa 6: 45 clientes «activos» sin ninguna factura en 12 meses (en la empresa sana, 6).
  const uninvoicedFrom = traps ? 256 : 295;
  for (let n = 1; n <= 300; n++) {
    if (n >= uninvoicedFrom) continue;
    for (let q = 0; q < 4; q++) invoices.push({ id: 'q-' + companyId(n) + '-' + q, companyId: companyId(n), amount: 300 + (n % 7) * 100, issuedAt: iso(START + (q * 91 + (n % 60) + 1) * DAY), dealRef: null });
  }

  // Trampa 5: entre las dos capturas desaparecen 80 contactos (en la sana, 3 se van y 5 llegan).
  const previousContacts = allContacts.slice(0, 320);
  const latestContacts = traps ? allContacts.slice(0, 240) : [...allContacts.slice(0, 317), ...allContacts.slice(320, 325)];

  const latest: VerificaCapture = { id: 'captura-2', capturedAt: TRAP_AS_OF, source: 'fixture', historyAvailable: true, owners, companies, contacts: latestContacts, deals };
  const previous: VerificaCapture = { id: 'captura-1', capturedAt: iso(PREVIOUS_AT), source: 'fixture', historyAvailable: true, owners, companies, contacts: previousContacts, deals: deals.filter(d => Date.parse(d.createdAt) <= PREVIOUS_AT).map(d => asOf(d, PREVIOUS_AT)) };

  const declarations: VerificaDeclarations = traps ? { renewalRate: 0.92, activeCustomers: 340, openPipelineAmount: 2_100_000 } : { renewalRate: 0.92, activeCustomers: 300 };

  const sumOf = (list: VerificaDeal[]) => list.reduce((total, d) => total + (d.amount ?? 0), 0);
  const inWindow = deals.filter(d => Date.parse(d.createdAt) >= WINDOW_START);
  const pushedAll = [...pushed, legit];
  const uninvoiced = 300 - (uninvoicedFrom - 1);
  const expected: Record<VerificaRuleId, ExpectedFinding> = {
    'window-inflation': { alarm: traps, basis: 'observed', figures: { createdCount: inWindow.length, createdAmount: sumOf(inWindow), raisedCount: raised.length, raisedAmount: raised.length * 25000, baselinePeriods: 7 } },
    'close-date-pushed': { alarm: traps, basis: 'observed', figures: { pushedCount: pushedAll.length, pushedAmount: sumOf(pushedAll) } },
    'won-without-invoice': { alarm: traps, basis: 'observed', figures: { missingCount: missing.length, missingAmount: sumOf(missing), ambiguousCount: ambiguous.length, ambiguousAmount: sumOf(ambiguous), recentCount: recentWins.length } },
    'owner-concentration': { alarm: traps, basis: 'observed', figures: { owners: 6, top2Pct: traps ? { min: 55 } : { max: 45 } } },
    'bulk-deletion': { alarm: traps, basis: 'observed', figures: traps ? { before: 320, after: 240, deleted: 80, added: 0, retained: 1 } : { before: 320, after: 322, deleted: 3, added: 5, retained: 0 } },
    'declared-renewal': { alarm: traps, basis: 'declared', figures: { customers: 300, invoicedCustomers: 300 - uninvoiced, uninvoicedCustomers: uninvoiced, declaredRatePct: 92, declaredActive: traps ? 340 : 300 } },
  };

  const forbidden = [
    ...owners.map(o => o.name), ...companies.map(c => c.name), ...allContacts.flatMap(c => [c.name, c.email ?? '']),
    ...deals.map(d => d.name), ...deals.map(d => '"' + d.id + '"'), ...companies.map(c => '"' + c.id + '"'),
  ].filter(Boolean);

  return { asOf: TRAP_AS_OF, salt: TRAP_SALT, previous, latest, invoices, declarations, expected, forbidden };
}

/** El estado de una oportunidad en un instante anterior, recortando su historial. */
function asOf(d: VerificaDeal, at: number): VerificaDeal {
  const upTo = (entries: HistoryEntry[]) => entries.filter(entry => Date.parse(entry.at) <= at);
  const amount = upTo(d.history!.amount), close = upTo(d.history!.closeDate);
  return { ...d, amount: (amount.at(-1)?.value as number | undefined) ?? d.amount, closeDate: (close.at(-1)?.value as string | undefined) ?? d.closeDate, history: { amount, closeDate: close } };
}

/** Diferencias entre un informe y el resultado esperado. Vacío = la prueba de referencia pasa. */
export function checkReference(report: VerificaReport, expected: Record<VerificaRuleId, ExpectedFinding>): string[] {
  const problems: string[] = [];
  for (const [rule, want] of Object.entries(expected) as [VerificaRuleId, ExpectedFinding][]) {
    const got = report.findings.find(f => f.rule === rule);
    if (!got) { problems.push(rule + ': falta el hallazgo'); continue; }
    if (got.alarm !== want.alarm) problems.push(rule + ': aviso ' + got.alarm + ', se esperaba ' + want.alarm);
    if (got.basis !== want.basis) problems.push(rule + ': base ' + got.basis + ', se esperaba ' + want.basis);
    for (const [key, figure] of Object.entries(want.figures)) {
      const value = got.figures[key];
      if (typeof value !== 'number') { problems.push(rule + '.' + key + ': falta'); continue; }
      if (typeof figure === 'number' ? value !== figure : (figure.min !== undefined && value < figure.min) || (figure.max !== undefined && value > figure.max)) {
        problems.push(rule + '.' + key + ': ' + value + ', se esperaba ' + JSON.stringify(figure));
      }
    }
  }
  return problems;
}
