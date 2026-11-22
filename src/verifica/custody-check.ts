// Plan B Verifica · comprobación de la copia custodiada contra el informe abierto (fase 2). Todo ocurre en el navegador:
// la copia y la llave no se envían a ningún sitio.
import { CustodyError, custodyFingerprint, openCustody, parseCustody } from '../../shared/verifica/custody.js';
import { verifyReport, type VerificaReport } from '../../shared/verifica/report.js';

export interface CustodyOutcome { ok: boolean; message: string; custodyFingerprint?: string }

const ERRORS: Record<CustodyError['code'], string> = {
  BAD_KEY: 'La llave no tiene la forma esperada: empieza por vfk1- y sigue con 43 caracteres.',
  MALFORMED: 'Este archivo no es una copia custodiada de Verifica.',
  WRONG_KEY_OR_TAMPERED: 'No se abre: la llave no es la de esta copia, o la copia se ha modificado.',
  TOO_LARGE: 'La copia es demasiado grande para abrirla aquí.',
};

export async function checkCustody(report: VerificaReport, custodyText: string, key: string): Promise<CustodyOutcome> {
  try {
    const envelope = parseCustody(JSON.parse(custodyText));
    if (envelope.reportFingerprint !== report.fingerprint) return { ok: false, message: 'Esta copia es de otro informe, con huella ' + envelope.reportFingerprint.slice(0, 12) + '. No acredita este.' };
    const opened = await openCustody(envelope, key);
    const fingerprint = custodyFingerprint(envelope);
    if (!opened.reproduces) return { ok: false, message: 'La copia se abre, pero rehace un informe distinto. No acredita este informe.', custodyFingerprint: fingerprint };
    if (!verifyReport(report)) return { ok: false, message: 'La copia rehace el informe original, pero el que tienes abierto no coincide con su huella: se ha tocado después.', custodyFingerprint: fingerprint };
    return { ok: true, message: 'La copia rehace este informe exactamente.', custodyFingerprint: fingerprint };
  } catch (error) {
    if (error instanceof CustodyError) return { ok: false, message: ERRORS[error.code] };
    if (error instanceof SyntaxError) return { ok: false, message: ERRORS.MALFORMED };
    return { ok: false, message: 'No se pudo comprobar la copia en este navegador.' };
  }
}
