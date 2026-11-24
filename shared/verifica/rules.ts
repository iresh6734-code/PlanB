// Plan B Verifica · las seis reglas de la prueba de referencia (docs/plan-b-verifica-plan-de-producto.md).
// Puras: reciben las capturas, las facturas y el instante del informe; no leen el reloj ni la red.
// Cada regla devuelve SIEMPRE su hallazgo con las cifras observadas; `alarm` solo se enciende cuando la cifra
// se sale de lo normal, para que una empresa sana no reciba falsos avisos.
import { assessShrink } from '../capture-quarantine.js';
import type { FindingItem, NotVerified, VerificaCapture, VerificaDeal, VerificaDeclarations, VerificaFinding, VerificaInvoice } from './model.js';

const DAY = 86_400_000;

/** Umbrales de la versión 1. Cambiarlos exige volver a pasar la prueba de referencia. */
export const THRESHOLDS = Object.freeze({
  /** Ventana de venta: lo creado o subido en las últimas 6 semanas. */
  windowDays: 42,
  /** Alarma si lo creado más lo subido en la ventana supera 1,5 veces la media de los periodos anteriores. */
  inflationFactor: 1.5,
  /** Periodos previos completos que hacen falta para comparar. */
  inflationMinPeriods: 3,
  inflationMaxPeriods: 7,
  /** Una oportunidad aplazada tres veces o más cuenta como aplazada. */
  pushedMinTimes: 3,
  /** Alarma si hay al menos 3 aplazadas o suman el 10 % de la cartera abierta. */
  pushedMinDeals: 3,
  pushedMinShare: 0.1,
  /** Ganadas en los últimos 30 días: aún es normal que no tengan factura. */
  invoiceGraceDays: 30,
  /** Una factura sin referencia cuenta como posible si coincide el cliente, el importe (±1 %) y la fecha. */
  invoiceAmountTolerance: 0.01,
  invoiceBeforeDays: 30,
  invoiceAfterDays: 120,
  /** Alarma si los dos primeros comerciales suman más de la mitad de la cartera, con 3 o más comerciales. */
  concentrationTop2: 0.5,
  concentrationMinOwners: 3,
  /** Alarma si desaparecen al menos 10 contactos y al menos el 5 % de los que había. */
  deletionMin: 10,
  deletionShare: 0.05,
  /** Alarma si más del 10 % de los clientes no tiene ninguna factura en 12 meses. */
  uninvoicedShare: 0.1,
  /** Alarma si el vendedor declara un 5 % más de clientes activos de los que tiene el CRM. */
  declaredCustomersSlack: 0.05,
  /** Alarma si la renovación declarada supera en 5 puntos la observada (solo con 24 meses de facturas). */
  renewalGap: 0.05,
});

export interface RuleContext {
  asOf: string;
  previous: VerificaCapture | null;
  latest: VerificaCapture;
  invoices: VerificaInvoice[] | null;
  declarations: VerificaDeclarations;
  /** Referencia estable y sin nombres para un registro. */
  pseudonym: (kind: 'deal' | 'company' | 'owner', id: string) => string;
  fingerprints: { previous: string | null; latest: string; invoices: string | null };
}

export interface RuleResult { finding: VerificaFinding; notVerified: NotVerified[] }

const time = (iso: string | null | undefined): number => iso ? Date.parse(iso) : Number.NaN;
const amountOf = (deal: VerificaDeal) => typeof deal.amount === 'number' && Number.isFinite(deal.amount) ? deal.amount : 0;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const round = (value: number) => Math.round(value);
const pct = (value: number) => Math.round(value * 1000) / 10;
const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const euros = (value: number) => EUR.format(value);
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** 1 · Oportunidades creadas o infladas en la ventana de venta. */
export function windowInflation(ctx: RuleContext): RuleResult {
  const now = time(ctx.asOf), windowStart = now - THRESHOLDS.windowDays * DAY, period = THRESHOLDS.windowDays * DAY;
  const deals = ctx.latest.deals;
  const created = deals.filter(deal => { const t = time(deal.createdAt); return t >= windowStart && t <= now; });
  const notVerified: NotVerified[] = [];
  const raised: { deal: VerificaDeal; increase: number }[] = [];
  if (ctx.latest.historyAvailable) {
    for (const deal of deals) {
      if (deal.status !== 'open' || !deal.history || time(deal.createdAt) >= windowStart) continue;
      const entries = deal.history.amount;
      const before = [...entries].reverse().find(entry => time(entry.at) < windowStart);
      const changedInWindow = entries.some(entry => time(entry.at) >= windowStart && time(entry.at) <= now);
      const increase = amountOf(deal) - (typeof before?.value === 'number' ? before.value : 0);
      if (before && changedInWindow && increase > 0) raised.push({ deal, increase });
    }
  } else {
    notVerified.push({ rule: 'window-inflation', topic: 'Importes subidos en la ventana de venta', reason: 'El lector no trajo el historial de importes; solo se cuentan las oportunidades creadas.' });
  }
  const earliest = Math.min(...deals.map(deal => time(deal.createdAt)).filter(Number.isFinite));
  const periods: number[] = [];
  for (let k = 1; k <= THRESHOLDS.inflationMaxPeriods; k++) {
    const start = windowStart - k * period, end = start + period;
    if (start < earliest) break;
    periods.push(sum(deals.filter(deal => { const t = time(deal.createdAt); return t >= start && t < end; }).map(amountOf)));
  }
  const createdAmount = sum(created.map(amountOf)), raisedAmount = sum(raised.map(entry => entry.increase));
  const total = createdAmount + raisedAmount;
  const baseline = periods.length ? sum(periods) / periods.length : 0;
  const comparable = periods.length >= THRESHOLDS.inflationMinPeriods && baseline > 0;
  if (!comparable) notVerified.push({ rule: 'window-inflation', topic: 'Comparación con meses anteriores', reason: 'No hay ' + THRESHOLDS.inflationMinPeriods + ' periodos completos de historia antes de la ventana de venta.' });
  const alarm = comparable && total > THRESHOLDS.inflationFactor * baseline;
  const items: FindingItem[] = [
    ...created.map(deal => ({ ref: ctx.pseudonym('deal', deal.id), amount: amountOf(deal), note: 'creada en la ventana' })),
    ...raised.map(entry => ({ ref: ctx.pseudonym('deal', entry.deal.id), amount: entry.increase, note: 'importe subido en la ventana' })),
  ];
  return {
    notVerified,
    finding: {
      rule: 'window-inflation', title: 'Cartera creada o inflada en las últimas ' + THRESHOLDS.windowDays / 7 + ' semanas', alarm, basis: 'observed',
      summary: plural(created.length, 'oportunidad creada', 'oportunidades creadas') + ' (' + euros(createdAmount) + ') y ' + plural(raised.length, 'subida', 'subidas') + ' de importe (' + euros(raisedAmount) + ') en la ventana de venta'
        + (comparable ? '; la media de los periodos anteriores es ' + euros(round(baseline)) + '.' : '.'),
      figures: { createdCount: created.length, createdAmount, raisedCount: raised.length, raisedAmount, totalAmount: total, baselineAmount: round(baseline), baselinePeriods: periods.length, ratioPct: comparable ? pct(total / baseline) : 0 },
      items, captures: [ctx.fingerprints.latest],
    },
  };
}

/** Cuántas veces se movió la fecha de cierre a una fecha posterior. */
export function postponements(deal: VerificaDeal): number {
  const dates = (deal.history?.closeDate ?? []).map(entry => typeof entry.value === 'string' ? time(entry.value) : Number.NaN).filter(Number.isFinite);
  let count = 0;
  for (let i = 1; i < dates.length; i++) if (dates[i]! > dates[i - 1]!) count++;
  return count;
}

/** 2 · Fechas de cierre aplazadas tres veces o más. */
export function closeDatePushed(ctx: RuleContext): RuleResult {
  const open = ctx.latest.deals.filter(deal => deal.status === 'open');
  if (!ctx.latest.historyAvailable) {
    return {
      notVerified: [{ rule: 'close-date-pushed', topic: 'Fechas de cierre aplazadas', reason: 'El lector no trajo el historial de la fecha de cierre; sin él no se puede saber cuántas veces se aplazó.' }],
      finding: { rule: 'close-date-pushed', title: 'Fechas de cierre aplazadas', alarm: false, basis: 'unverified', summary: 'Sin historial de la fecha de cierre: no comprobado.', figures: {}, items: [], captures: [ctx.fingerprints.latest] },
    };
  }
  const pushed = open.map(deal => ({ deal, times: postponements(deal) })).filter(entry => entry.times >= THRESHOLDS.pushedMinTimes);
  const pushedAmount = sum(pushed.map(entry => amountOf(entry.deal))), openAmount = sum(open.map(amountOf));
  const alarm = pushed.length >= THRESHOLDS.pushedMinDeals || (openAmount > 0 && pushedAmount / openAmount >= THRESHOLDS.pushedMinShare);
  return {
    notVerified: [],
    finding: {
      rule: 'close-date-pushed', title: 'Fechas de cierre aplazadas ' + THRESHOLDS.pushedMinTimes + ' veces o más', alarm, basis: 'observed',
      summary: plural(pushed.length, 'oportunidad abierta aplazada', 'oportunidades abiertas aplazadas') + ' ' + THRESHOLDS.pushedMinTimes + ' veces o más, por ' + euros(pushedAmount) + ' (' + (openAmount ? pct(pushedAmount / openAmount) : 0) + ' % de la cartera abierta).',
      figures: { pushedCount: pushed.length, pushedAmount, openAmount, sharePct: openAmount ? pct(pushedAmount / openAmount) : 0 },
      items: pushed.map(entry => ({ ref: ctx.pseudonym('deal', entry.deal.id), amount: amountOf(entry.deal), note: 'aplazada ' + entry.times + ' veces' })),
      captures: [ctx.fingerprints.latest],
    },
  };
}

/** 3 · Oportunidades ganadas sin factura. Por referencia es observado; solo por cliente e importe, sin comprobar. */
export function wonWithoutInvoice(ctx: RuleContext): RuleResult {
  if (!ctx.invoices) {
    return {
      notVerified: [{ rule: 'won-without-invoice', topic: 'Ganadas sin factura', reason: 'No se aportó la exportación de facturas.' }],
      finding: { rule: 'won-without-invoice', title: 'Ganadas sin factura', alarm: false, basis: 'unverified', summary: 'Sin exportación de facturas: no comprobado.', figures: {}, items: [], captures: [ctx.fingerprints.latest] },
    };
  }
  const now = time(ctx.asOf), graceStart = now - THRESHOLDS.invoiceGraceDays * DAY;
  const byRef = new Set(ctx.invoices.filter(invoice => invoice.dealRef).map(invoice => invoice.dealRef));
  const loose = ctx.invoices.filter(invoice => !invoice.dealRef);
  const used = new Set<string>();
  const missing: VerificaDeal[] = [], ambiguous: VerificaDeal[] = [], recent: VerificaDeal[] = [];
  const won = ctx.latest.deals.filter(deal => deal.status === 'won').sort((a, b) => a.id < b.id ? -1 : 1);
  for (const deal of won) {
    if (byRef.has(deal.id)) continue;
    const closed = time(deal.closeDate);
    const amount = amountOf(deal);
    const candidate = loose.find(invoice => !used.has(invoice.id) && invoice.companyId !== null && invoice.companyId === deal.companyId
      && amount > 0 && Math.abs(invoice.amount - amount) <= amount * THRESHOLDS.invoiceAmountTolerance
      && time(invoice.issuedAt) >= closed - THRESHOLDS.invoiceBeforeDays * DAY && time(invoice.issuedAt) <= closed + THRESHOLDS.invoiceAfterDays * DAY);
    // Una ganada reciente que ya tiene factura posible cuenta como tal; solo las que no la tienen están «aún sin facturar»
    // (fase B, 24/11/2026: con datos reales, una ganada del mismo día y ya facturada salía como sin facturar).
    if (candidate) { used.add(candidate.id); ambiguous.push(deal); }
    else if (Number.isFinite(closed) && closed > graceStart) recent.push(deal);
    else missing.push(deal);
  }
  const missingAmount = sum(missing.map(amountOf)), ambiguousAmount = sum(ambiguous.map(amountOf));
  return {
    notVerified: ambiguous.length ? [{ rule: 'won-without-invoice', topic: plural(ambiguous.length, 'ganada con factura posible', 'ganadas con factura posible'), reason: 'La factura no lleva referencia a la oportunidad; solo coinciden el cliente, el importe y la fecha.' }] : [],
    finding: {
      rule: 'won-without-invoice', title: 'Oportunidades ganadas sin factura', alarm: missing.length > 0, basis: 'observed',
      summary: plural(missing.length, 'ganada', 'ganadas') + ' sin ninguna factura (' + euros(missingAmount) + '); ' + plural(ambiguous.length, 'con factura solo por cliente e importe', 'con factura solo por cliente e importe') + ' (' + euros(ambiguousAmount) + ', sin comprobar); '
        + plural(recent.length, 'ganada', 'ganadas') + ' en los últimos ' + THRESHOLDS.invoiceGraceDays + ' días aún sin facturar.',
      figures: { wonCount: won.length, missingCount: missing.length, missingAmount, ambiguousCount: ambiguous.length, ambiguousAmount, recentCount: recent.length },
      items: [
        ...missing.map(deal => ({ ref: ctx.pseudonym('deal', deal.id), amount: amountOf(deal), note: 'sin factura' })),
        ...ambiguous.map(deal => ({ ref: ctx.pseudonym('deal', deal.id), amount: amountOf(deal), note: 'sin comprobar: solo coinciden cliente e importe' })),
      ],
      captures: [ctx.fingerprints.latest, ...(ctx.fingerprints.invoices ? [ctx.fingerprints.invoices] : [])],
    },
  };
}

/** 4 · Concentración de la cartera abierta por comercial. Los comerciales salen numerados, sin nombre. */
export function ownerConcentration(ctx: RuleContext): RuleResult {
  const open = ctx.latest.deals.filter(deal => deal.status === 'open');
  const byOwner = new Map<string, number>();
  for (const deal of open) byOwner.set(deal.ownerId ?? '', (byOwner.get(deal.ownerId ?? '') ?? 0) + amountOf(deal));
  const ranked = [...byOwner.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const openAmount = sum(ranked.map(([, amount]) => amount)), top2 = sum(ranked.slice(0, 2).map(([, amount]) => amount));
  const share = openAmount ? top2 / openAmount : 0;
  const enough = ranked.length >= THRESHOLDS.concentrationMinOwners;
  return {
    notVerified: enough ? [] : [{ rule: 'owner-concentration', topic: 'Concentración por comercial', reason: 'Con menos de ' + THRESHOLDS.concentrationMinOwners + ' comerciales con cartera, la concentración no dice nada.' }],
    finding: {
      rule: 'owner-concentration', title: 'Concentración por comercial', alarm: enough && share > THRESHOLDS.concentrationTop2, basis: 'observed',
      summary: 'Los dos primeros comerciales, de ' + ranked.length + ', suman el ' + pct(share) + ' % de la cartera abierta (' + euros(openAmount) + ').',
      figures: { owners: ranked.length, openAmount, top2Amount: top2, top2Pct: pct(share) },
      items: ranked.map(([owner, amount], index) => ({ ref: owner ? 'Comercial ' + (index + 1) : 'Sin comercial', amount })),
      captures: [ctx.fingerprints.latest],
    },
  };
}

/** 5 · Contactos borrados entre dos capturas, y si la captura queda retenida (cuarentena A2). */
export function bulkDeletion(ctx: RuleContext): RuleResult {
  if (!ctx.previous) {
    return {
      notVerified: [{ rule: 'bulk-deletion', topic: 'Borrados entre capturas', reason: 'Hace falta una segunda captura para comparar.' }],
      finding: { rule: 'bulk-deletion', title: 'Contactos borrados entre capturas', alarm: false, basis: 'unverified', summary: 'Una sola captura: no comprobado.', figures: {}, items: [], captures: [ctx.fingerprints.latest] },
    };
  }
  const before = new Set(ctx.previous.contacts.map(contact => contact.id)), after = new Set(ctx.latest.contacts.map(contact => contact.id));
  const deleted = [...before].filter(id => !after.has(id)).length, added = [...after].filter(id => !before.has(id)).length;
  const counts = (capture: VerificaCapture) => ({ contacts: capture.contacts.length, companies: capture.companies.length, deals: capture.deals.length });
  const retained = assessShrink(counts(ctx.previous), counts(ctx.latest), ctx.latest.capturedAt) !== null;
  const alarm = deleted >= THRESHOLDS.deletionMin && deleted >= before.size * THRESHOLDS.deletionShare;
  return {
    notVerified: [],
    finding: {
      rule: 'bulk-deletion', title: 'Contactos borrados entre capturas', alarm, basis: 'observed',
      summary: plural(deleted, 'contacto desaparece', 'contactos desaparecen') + ' y ' + plural(added, 'aparece', 'aparecen') + ' entre las dos capturas (' + before.size + ' → ' + after.size + ')' + (retained ? '; la captura nueva queda retenida.' : '.'),
      figures: { before: before.size, after: after.size, deleted, added, retained: retained ? 1 : 0 },
      items: [], captures: [...(ctx.fingerprints.previous ? [ctx.fingerprints.previous] : []), ctx.fingerprints.latest],
    },
  };
}

/** 6 · Renovación declarada: qué parte se puede contrastar con las facturas. */
export function declaredRenewal(ctx: RuleContext): RuleResult {
  const declared = ctx.declarations.renewalRate, declaredActive = ctx.declarations.activeCustomers;
  const customers = ctx.latest.companies.filter(company => company.customer);
  const notVerified: NotVerified[] = [];
  if (!ctx.invoices) {
    notVerified.push({ rule: 'declared-renewal', topic: 'Renovación declarada', reason: 'No se aportó la exportación de facturas.' });
    return { notVerified, finding: { rule: 'declared-renewal', title: 'Renovación declarada', alarm: false, basis: 'declared', summary: declared === undefined ? 'El vendedor no declara renovación.' : 'El vendedor declara un ' + pct(declared) + ' % de renovación; sin facturas no se puede contrastar.', figures: declared === undefined ? {} : { declaredRatePct: pct(declared) }, items: [], captures: [ctx.fingerprints.latest] } };
  }
  const now = time(ctx.asOf), yearAgo = now - 365 * DAY, twoYearsAgo = now - 730 * DAY;
  const invoicedIn = (from: number, to: number) => new Set(ctx.invoices!.filter(invoice => { const t = time(invoice.issuedAt); return t > from && t <= to && invoice.companyId; }).map(invoice => invoice.companyId!));
  const lastYear = invoicedIn(yearAgo, now);
  const invoiced = customers.filter(company => lastYear.has(company.id)).length, uninvoiced = customers.length - invoiced;
  const earliest = Math.min(...ctx.invoices.map(invoice => time(invoice.issuedAt)).filter(Number.isFinite));
  let observedRate: number | null = null;
  // Las facturas deben cubrir el año anterior desde su primer mes; si no, la renovación sale baja sin serlo.
  if (earliest <= twoYearsAgo + 31 * DAY) {
    const previousYear = invoicedIn(twoYearsAgo, yearAgo);
    observedRate = previousYear.size ? [...previousYear].filter(id => lastYear.has(id)).length / previousYear.size : null;
  } else if (declared !== undefined) {
    notVerified.push({ rule: 'declared-renewal', topic: 'Renovación del ' + pct(declared) + ' % declarada', reason: 'Las facturas cubren menos de 24 meses: la renovación de un año a otro no se puede calcular.' });
  }
  const alarm = (customers.length > 0 && uninvoiced / customers.length > THRESHOLDS.uninvoicedShare)
    || (declaredActive !== undefined && declaredActive > customers.length * (1 + THRESHOLDS.declaredCustomersSlack))
    || (declared !== undefined && observedRate !== null && declared - observedRate > THRESHOLDS.renewalGap);
  const figures: Record<string, number> = { customers: customers.length, invoicedCustomers: invoiced, uninvoicedCustomers: uninvoiced };
  if (declared !== undefined) figures.declaredRatePct = pct(declared);
  if (declaredActive !== undefined) figures.declaredActive = declaredActive;
  if (observedRate !== null) figures.observedRatePct = pct(observedRate);
  return {
    notVerified,
    finding: {
      rule: 'declared-renewal', title: 'Renovación y clientes activos declarados', alarm, basis: observedRate === null ? 'declared' : 'observed',
      summary: (declared === undefined ? 'El vendedor no declara renovación. ' : 'El vendedor declara un ' + pct(declared) + ' % de renovación' + (declaredActive === undefined ? '. ' : ' y ' + declaredActive + ' clientes activos. '))
        + 'El CRM tiene ' + customers.length + ' clientes; ' + invoiced + ' con factura en los últimos 12 meses y ' + uninvoiced + ' sin ninguna.'
        + (observedRate === null ? '' : ' Renovación observada: ' + pct(observedRate) + ' %.'),
      figures, items: [],
      captures: [ctx.fingerprints.latest, ...(ctx.fingerprints.invoices ? [ctx.fingerprints.invoices] : [])],
    },
  };
}

export const RULES = [windowInflation, closeDatePushed, wonWithoutInvoice, ownerConcentration, bulkDeletion, declaredRenewal] as const;
