// Plan B Verifica · paquete del comprador (Mega Plan 3, fase 1). Solo lleva lo que se puede compartir: el informe, el parte de
// vigilancia, el informe de equivalencia y las respuestas declaradas del vendedor, elegidos uno a uno. Nunca autorizaciones,
// actas completas, fuentes, sal ni copia custodiada. Lleva la cabeza del expediente privado (secuencia y huella), para que el
// comprador la tenga fuera del equipo del vendedor y se pueda detectar después un recorte de la cola.
// La huella acredita integridad respecto a un valor de referencia: no dice quién emitió el documento ni que las cifras
// comerciales sean exactas.
import { parseEquivalenceReport, verifyEquivalenceReport, type EquivalenceReport } from './equivalence.js';
import { RULE_IDS } from './model.js';
import { ANSWERS_FORMAT, verifyAnswers, type AnswersDocument } from './preguntas.js';
import { fingerprintOf, parseReport, verifyReport, type VerificaReport } from './report.js';
import { parseWatchReport, verifyWatchReport, type WatchReport } from './watch.js';

export const PACKAGE_FORMAT = 'verifica-paquete-comprador-v1';
export const PACKAGE_NOTICE = 'Cada huella acredita que el documento no ha cambiado desde que se emitió. No acredita quién lo emitió ni que las cifras comerciales sean exactas.';

export type PackageDocument =
  | { kind: 'report'; fingerprint: string; content: VerificaReport }
  | { kind: 'watch'; fingerprint: string; content: WatchReport }
  | { kind: 'equivalence'; fingerprint: string; content: EquivalenceReport }
  | { kind: 'answers'; fingerprint: string; content: AnswersDocument };

export interface BuyerPackage {
  format: typeof PACKAGE_FORMAT;
  createdAt: string;
  /** Identificador opaco del encargo; el nombre no viaja. */
  engagement: string;
  ledgerHead: { sequence: number; fingerprint: string } | null;
  notice: string;
  documents: PackageDocument[];
  fingerprint: string;
}

export function packageFingerprint(pkg: Omit<BuyerPackage, 'fingerprint'> | BuyerPackage): string {
  const { fingerprint: _ignored, ...body } = pkg as BuyerPackage;
  return fingerprintOf(body);
}

export function buildPackage(input: { engagement: string; createdAt: string; ledgerHead: BuyerPackage['ledgerHead']; documents: PackageDocument[] }): BuyerPackage {
  if (!input.documents.length) throw new Error('El paquete necesita al menos un documento.');
  const body: Omit<BuyerPackage, 'fingerprint'> = { format: PACKAGE_FORMAT, createdAt: new Date(input.createdAt).toISOString(),
    engagement: input.engagement, ledgerHead: input.ledgerHead, notice: PACKAGE_NOTICE, documents: input.documents };
  return { ...body, fingerprint: packageFingerprint(body) };
}

export const packageToJson = (pkg: BuyerPackage): string => JSON.stringify(pkg, null, 2) + '\n';

const KIND_LABEL: Record<PackageDocument['kind'], string> = { report: 'El informe', watch: 'El parte de vigilancia', equivalence: 'El informe de equivalencia', answers: 'Las respuestas del vendedor' };

export interface PackageCheck { kind: PackageDocument['kind'] | 'package' | 'document' | 'reference'; label: string; ok: boolean; problem: string | null }
export interface PackageVerification {
  intact: boolean;
  checks: PackageCheck[];
  reference: 'absent' | 'matched' | 'mismatch';
  /** Usar esta lista para abrir documentos del paquete en el visor. */
  documents: PackageDocument[];
}

const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function outerIntact(pkg: unknown): pkg is BuyerPackage {
  if (!object(pkg) || pkg.format !== PACKAGE_FORMAT || !Array.isArray(pkg.documents) || pkg.documents.length === 0
    || !hex(pkg.fingerprint) || typeof pkg.engagement !== 'string' || !pkg.engagement || !instant(pkg.createdAt) || typeof pkg.notice !== 'string') return false;
  const head = pkg.ledgerHead;
  if (head !== null && (!object(head) || typeof head.sequence !== 'number' || !Number.isSafeInteger(head.sequence) || head.sequence < 1 || !hex(head.fingerprint))) return false;
  try { return packageFingerprint(pkg as unknown as BuyerPackage) === pkg.fingerprint; }
  catch { return false; }
}

function checkDocument(raw: unknown): PackageDocument | null {
  if (!object(raw) || !hex(raw.fingerprint) || !object(raw.content)) return null;
  const { fingerprint, content } = raw;
  try {
    switch (raw.kind) {
      case 'report': {
        const parsed = parseReport(content);
        return verifyReport(parsed) && parsed.fingerprint === fingerprint ? { kind: 'report', fingerprint, content: parsed } : null;
      }
      case 'watch': {
        const parsed = parseWatchReport(content);
        return verifyWatchReport(parsed) && parsed.fingerprint === fingerprint ? { kind: 'watch', fingerprint, content: parsed } : null;
      }
      case 'equivalence': {
        const parsed = parseEquivalenceReport(content);
        return verifyEquivalenceReport(parsed) && parsed.fingerprint === fingerprint ? { kind: 'equivalence', fingerprint, content: parsed } : null;
      }
      case 'answers': {
        if (content.format !== ANSWERS_FORMAT || !hex(content.report) || !Array.isArray(content.answers) || !content.answers.length
          || !content.answers.every(answer => object(answer) && (RULE_IDS as readonly unknown[]).includes(answer.question)
            && typeof answer.text === 'string' && !!answer.text.trim() && instant(answer.answeredAt))) return null;
        const parsed = content as unknown as AnswersDocument;
        return verifyAnswers(parsed) && parsed.fingerprint === fingerprint ? { kind: 'answers', fingerprint, content: parsed } : null;
      }
      default: return null;
    }
  } catch { return null; }
}

/** Comprueba sin conexión el paquete entero y cada documento con el verificador de su formato. */
export function verifyPackage(raw: unknown, expectedFingerprint?: string): PackageVerification {
  const checks: PackageCheck[] = [];
  const outer = outerIntact(raw);
  checks.push({ kind: 'package', label: 'El paquete', ok: outer, problem: outer ? null : 'La huella del paquete no coincide: algo se ha añadido, quitado o retocado.' });
  let reference: PackageVerification['reference'] = 'absent';
  if (expectedFingerprint !== undefined) {
    const expected = expectedFingerprint.trim().toLowerCase();
    reference = outer && hex(expected) && expected === raw.fingerprint ? 'matched' : 'mismatch';
    checks.push({ kind: 'reference', label: 'Huella recibida por separado', ok: reference === 'matched',
      problem: reference === 'matched' ? null : 'El paquete no coincide con la huella de referencia.' });
  }
  const entries: unknown[] = object(raw) && Array.isArray(raw.documents) ? raw.documents : [];
  const documents: PackageDocument[] = [];
  const kinds = new Set<PackageDocument['kind']>();
  for (const entry of entries) {
    const doc = checkDocument(entry);
    const key = object(entry) && typeof entry.kind === 'string' && Object.hasOwn(KIND_LABEL, entry.kind) ? entry.kind as PackageDocument['kind'] : null;
    const repeated = doc !== null && kinds.has(doc.kind);
    if (doc && !repeated) { kinds.add(doc.kind); documents.push(doc); }
    checks.push({ kind: key ?? 'document', label: key ? KIND_LABEL[key] : 'Un documento', ok: !!doc && !repeated,
      problem: repeated ? 'El paquete repite este documento.' : doc ? null : key ? 'Su contenido no es válido o su huella no coincide.' : 'Documento de un tipo que este visor no conoce.' });
  }
  const report = documents.find(doc => doc.kind === 'report');
  const watch = documents.find(doc => doc.kind === 'watch');
  for (const doc of documents) {
    if (doc.kind === 'answers' && doc.content.report !== report?.fingerprint) {
      checks.push({ kind: 'answers', label: 'Las respuestas del vendedor', ok: false, problem: 'Contestan a un informe que no está en el paquete.' });
    }
    if (doc.kind === 'equivalence' && watch && doc.content.closing.watch && doc.content.closing.watch !== watch.fingerprint) {
      checks.push({ kind: 'equivalence', label: 'El informe de equivalencia', ok: false, problem: 'Cita un parte de vigilancia distinto del que se incluyó en el paquete.' });
    }
  }
  const intact = checks.every(check => check.ok);
  return { intact, checks, reference, documents: intact ? documents : [] };
}
