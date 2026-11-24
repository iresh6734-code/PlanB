// Plan B Verifica · paquete del comprador (Mega Plan 3, fase 1). Solo lleva lo que se puede compartir: el informe, el parte de
// vigilancia, el informe de equivalencia y las respuestas declaradas del vendedor, elegidos uno a uno. Nunca autorizaciones,
// actas completas, fuentes, sal ni copia custodiada. Lleva la cabeza del expediente privado (secuencia y huella), para que el
// comprador la tenga fuera del equipo del vendedor y se pueda detectar después un recorte de la cola.
// La huella acredita integridad respecto a un valor de referencia: no dice quién emitió el documento ni que las cifras
// comerciales sean exactas.
import { parseEquivalenceReport, verifyEquivalenceReport, type EquivalenceReport } from './equivalence.js';
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

export interface PackageCheck { kind: PackageDocument['kind'] | 'package'; label: string; ok: boolean; problem: string | null }
export interface PackageVerification { intact: boolean; checks: PackageCheck[] }

/** Comprueba sin conexión el paquete entero y cada documento con el verificador de su formato. */
export function verifyPackage(raw: unknown): PackageVerification {
  const pkg = raw as BuyerPackage;
  const checks: PackageCheck[] = [];
  const outer = !!pkg && pkg.format === PACKAGE_FORMAT && Array.isArray(pkg.documents) && packageFingerprint(pkg) === pkg.fingerprint;
  checks.push({ kind: 'package', label: 'El paquete', ok: outer, problem: outer ? null : 'La huella del paquete no coincide: algo se ha añadido, quitado o retocado.' });
  const reports = new Set<string>();
  for (const doc of Array.isArray(pkg?.documents) ? pkg.documents : []) {
    let ok = false, problem: string | null = null;
    try {
      if (doc.kind === 'report') { const r = parseReport(doc.content); ok = verifyReport(r) && r.fingerprint === doc.fingerprint; if (ok) reports.add(r.fingerprint); }
      else if (doc.kind === 'watch') { const w = parseWatchReport(doc.content); ok = verifyWatchReport(w) && w.fingerprint === doc.fingerprint; }
      else if (doc.kind === 'equivalence') { const e = parseEquivalenceReport(doc.content); ok = verifyEquivalenceReport(e) && e.fingerprint === doc.fingerprint; }
      else if (doc.kind === 'answers') { ok = doc.content?.format === ANSWERS_FORMAT && verifyAnswers(doc.content) && doc.content.fingerprint === doc.fingerprint; }
      else problem = 'Documento de un tipo que este visor no conoce.';
    } catch { ok = false; }
    if (!ok && !problem) problem = 'Su huella no coincide con su contenido.';
    checks.push({ kind: doc.kind, label: KIND_LABEL[doc.kind] ?? 'Un documento', ok, problem });
  }
  // Las respuestas tienen que contestar a un informe que esté en el mismo paquete.
  for (const doc of Array.isArray(pkg?.documents) ? pkg.documents : []) {
    if (doc.kind === 'answers' && doc.content && !reports.has(doc.content.report)) {
      checks.push({ kind: 'answers', label: 'Las respuestas del vendedor', ok: false, problem: 'Contestan a un informe que no está en el paquete.' });
    }
  }
  return { intact: checks.every(c => c.ok), checks };
}
