// Plan B Verifica · modelo de entrada y de hallazgos (docs/plan-b-verifica-plan-de-producto.md).
// Es independiente del lector: una captura de HubSpot, Pipedrive o una exportación se traducen a esta forma
// antes de aplicar las reglas. Todo es puro: sin red, sin disco, sin reloj del sistema.

/** Un valor de propiedad con el instante en que quedó fijado (historial de cambios del CRM). */
export interface HistoryEntry { value: number | string | null; at: string }

export type DealStatus = 'open' | 'won' | 'lost';

export interface VerificaDeal {
  id: string;
  name: string;
  companyId: string | null;
  ownerId: string | null;
  status: DealStatus;
  amount: number | null;
  createdAt: string;
  /** Fecha prevista de cierre (abiertas) o fecha de cierre (ganadas y perdidas), AAAA-MM-DD. */
  closeDate: string | null;
  /** Historial de importe y de fecha de cierre, del más antiguo al más reciente. null si el lector no lo trajo. */
  history: { amount: HistoryEntry[]; closeDate: HistoryEntry[] } | null;
}

export interface VerificaCompany { id: string; name: string; customer: boolean }
export interface VerificaContact { id: string; name: string; email: string | null; companyId: string | null }
export interface VerificaOwner { id: string; name: string }

/** Una lectura completa del CRM. `historyAvailable` dice si el lector trajo el historial de propiedades. */
export interface VerificaCapture {
  id: string;
  capturedAt: string;
  source: 'fixture' | 'hubspot' | 'pipedrive' | 'export';
  historyAvailable: boolean;
  owners: VerificaOwner[];
  companies: VerificaCompany[];
  contacts: VerificaContact[];
  deals: VerificaDeal[];
}

/** Una línea de la exportación de facturas (Holded u otra). `dealRef` es la referencia a la oportunidad si la factura la lleva. */
export interface VerificaInvoice { id: string; companyId: string | null; amount: number; issuedAt: string; dealRef: string | null }

/** Lo que declara el vendedor. Nunca se da por observado. */
export interface VerificaDeclarations { openPipelineAmount?: number; activeCustomers?: number; renewalRate?: number }

export type VerificaBasis = 'observed' | 'declared' | 'unverified';

export const RULE_IDS = ['window-inflation', 'close-date-pushed', 'won-without-invoice', 'owner-concentration', 'bulk-deletion', 'declared-renewal'] as const;
export type VerificaRuleId = typeof RULE_IDS[number];

/** Una referencia seudonimizada a un registro, con su importe si lo tiene. Nunca lleva nombres. */
export interface FindingItem { ref: string; amount: number | null; note?: string }

export interface VerificaFinding {
  rule: VerificaRuleId;
  title: string;
  /** true si la cifra se sale de lo normal y el informe debe señalarla. */
  alarm: boolean;
  basis: VerificaBasis;
  summary: string;
  figures: Record<string, number>;
  items: FindingItem[];
  /** Huellas de las capturas de las que sale la cifra. */
  captures: string[];
}

/** Lo que no se pudo comprobar y por qué (segunda página del informe). */
export interface NotVerified { rule: VerificaRuleId; topic: string; reason: string }
