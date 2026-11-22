// Verifica · fase 5: las cinco pruebas del plan, una por fase, contra las empresas ficticias. Nadie de fuera ve el
// producto hasta que pasen todas. Sin red ni archivos: solo el motor y los escenarios de prueba. Pasarlas aquí no
// valida nada con datos reales; eso se dice siempre junto al resultado.
import { findLeaks, runCleanRoom } from './clean-room.js';
import { openCustody } from './custody.js';
import { buildTrapCompany, checkReference, type TrapCompany } from './empresa-con-trampas.js';
import { buildMigratedCompany, checkEquivalence, type MigratedCompany } from './empresa-migrada.js';
import { buildWatchedCompany, checkWatch, type WatchedCompany } from './empresa-vigilada.js';
import { releaseEquivalence } from './migration.js';
import { RULE_IDS } from './model.js';
import { buildVerificaReport, parseReport, reportToJson, verifyReport, type ReportInput } from './report.js';
import { releaseWatchReport } from './watch.js';

export type GatePhase = 0 | 1 | 2 | 3 | 4;
export type GateStatus = 'passed' | 'failed' | 'pending';

export interface GateResult {
  phase: GatePhase;
  name: string;
  /** El criterio de salida, tal como lo escribe el plan. */
  criterion: string;
  status: GateStatus;
  /** Lo que se ha comprobado, si pasa; lo que falla o falta, si no. */
  details: string[];
}

export interface Readiness {
  gates: GateResult[];
  /** true solo si las cinco pasan. Una pendiente también impide enseñarlo fuera. */
  ready: boolean;
  /** Lo que estas pruebas no cubren. Va siempre con el resultado. */
  notCovered: string[];
}

export const GATES: Readonly<Record<GatePhase, { name: string; criterion: string }>> = Object.freeze({
  0: { name: 'Ordenar', criterion: 'Un solo producto en el menú y la prueba de referencia escrita' },
  1: { name: 'Motor', criterion: 'Detecta las seis trampas sin falsos avisos' },
  2: { name: 'Informe y sala limpia', criterion: 'Un tercero comprueba la huella sin acceso a los datos' },
  3: { name: 'Vigilancia', criterion: 'Borrar contactos dispara la alerta' },
  4: { name: 'Después del cierre', criterion: 'La migración de prueba no tiene diferencias en alcance' },
});

export const NOT_COVERED: readonly string[] = Object.freeze([
  'Todo se ha probado con empresas ficticias. Falta validar el lector de HubSpot en el portal de pruebas, las cabeceras reales de Holded y el historial de Pipedrive.',
  'Los textos legales (alcance, tratamiento de datos, uso de las huellas en el contrato) los tienen que revisar abogados.',
]);

export interface Scenarios {
  trap: TrapCompany; clean: TrapCompany;
  watchedTrap: WatchedCompany; watchedClean: WatchedCompany;
  migratedTrap: MigratedCompany; migratedClean: MigratedCompany;
}

export function defaultScenarios(): Scenarios {
  return {
    trap: buildTrapCompany({ traps: true }), clean: buildTrapCompany({ traps: false }),
    watchedTrap: buildWatchedCompany({ traps: true }), watchedClean: buildWatchedCompany({ traps: false }),
    migratedTrap: buildMigratedCompany({ traps: true }), migratedClean: buildMigratedCompany({ traps: false }),
  };
}

const result = (phase: GatePhase, problems: string[], evidence: string[]): GateResult =>
  ({ phase, ...GATES[phase], status: problems.length ? 'failed' : 'passed', details: problems.length ? problems : evidence });

const prefixed = (prefix: string, lines: string[]) => lines.map(line => prefix + line);

/** Un fallo inesperado del motor no puede dar la prueba por buena. El mensaje del motor no lleva datos del CRM. */
function guarded(phase: GatePhase, run: () => GateResult): GateResult {
  try { return run(); } catch (error) { return result(phase, ['El motor falló: ' + (error instanceof Error ? error.message : 'error desconocido')], []); }
}

const reportInputOf = (company: TrapCompany): ReportInput =>
  ({ asOf: company.asOf, previous: company.previous, latest: company.latest, invoices: company.invoices, declarations: company.declarations, salt: company.salt });

/** Fase 0. La parte del menú es una decisión de la usuaria; sin ella la prueba queda pendiente, no aprobada. */
export function gateOrder(trap: TrapCompany, clean: TrapCompany, singleProduct: boolean): GateResult {
  const problems: string[] = [];
  const missing = RULE_IDS.filter(rule => trap.expected[rule]?.alarm !== true);
  if (missing.length) problems.push('La referencia con trampas no espera alarma en: ' + missing.join(', ') + '.');
  const noisy = RULE_IDS.filter(rule => clean.expected[rule]?.alarm !== false);
  if (noisy.length) problems.push('La referencia sin trampas espera alarma en: ' + noisy.join(', ') + '.');
  if (problems.length) return result(0, problems, []);
  const evidence = ['La referencia está escrita: las seis reglas, con trampas y sin ellas.'];
  if (singleProduct) return result(0, [], [...evidence, 'Un solo producto en el menú.']);
  return { phase: 0, ...GATES[0], status: 'pending', details: [...evidence, 'Falta decidir los destinos de cada parte (motor, congelado, aparcado o fuera) para dejar un solo producto en el menú.'] };
}

/** Fase 1. */
export function gateEngine(trap: TrapCompany, clean: TrapCompany): GateResult {
  return guarded(1, () => {
    const withTraps = buildVerificaReport(reportInputOf(trap));
    const without = buildVerificaReport(reportInputOf(clean));
    const alarms = withTraps.findings.filter(f => f.alarm).map(f => f.rule);
    const falseAlarms = without.findings.filter(f => f.alarm).map(f => f.rule);
    const problems = [
      ...prefixed('Con trampas: ', checkReference(withTraps, trap.expected)),
      ...RULE_IDS.filter(rule => !alarms.includes(rule)).map(rule => 'Con trampas: no salta ' + rule + '.'),
      ...prefixed('Sin trampas: ', checkReference(without, clean.expected)),
      ...falseAlarms.map(rule => 'Sin trampas: falso aviso en ' + rule + '.'),
    ];
    return result(1, problems, ['Con trampas salen las seis alarmas con sus cifras.', 'Sin trampas no sale ninguna.']);
  });
}

/** Retoca una cifra del informe publicado, como haría quien quisiera maquillarlo. */
function retouch(published: string): unknown {
  const copy = JSON.parse(published) as { findings: { figures: Record<string, number> }[] };
  for (const finding of copy.findings) {
    const key = Object.keys(finding.figures).find(k => typeof finding.figures[k] === 'number');
    if (key) { finding.figures[key] = finding.figures[key]! + 1; return copy; }
  }
  return copy;
}

const thirdPartyAccepts = (value: unknown): boolean => { try { return verifyReport(parseReport(value)); } catch { return false; } };

/** Fase 2. El «tercero» solo recibe el JSON publicado: ni capturas, ni facturas, ni la copia, ni la llave. */
export async function gateCleanRoom(trap: TrapCompany): Promise<GateResult> {
  try {
    const { report, custody, key } = await runCleanRoom({ asOf: trap.asOf, previous: trap.previous, latest: trap.latest, invoices: trap.invoices, declarations: trap.declarations });
    const published = reportToJson(report);
    const outside = published + JSON.stringify(custody);
    const problems: string[] = [];
    if (!thirdPartyAccepts(JSON.parse(published))) problems.push('Un tercero no puede comprobar la huella solo con el informe.');
    if (thirdPartyAccepts(retouch(published))) problems.push('Un informe con una cifra retocada pasa la comprobación.');
    problems.push(...prefixed('Informe: ', checkReference(report, trap.expected)));
    const leaks = findLeaks(report, trap).length + trap.forbidden.filter(text => outside.includes(text)).length;
    if (leaks) problems.push('Salen ' + leaks + ' textos del CRM en el informe o en la copia.');
    if (outside.includes(key)) problems.push('La llave va con el informe o con la copia.');
    const opened = await openCustody(JSON.parse(JSON.stringify(custody)), key);
    if (!opened.reproduces) problems.push('La copia custodiada no rehace el mismo informe.');
    return result(2, problems, [
      'Un tercero comprueba la huella con el informe solo, y una cifra retocada no pasa.',
      'Ni el informe ni la copia llevan nombres, correos ni IDs del CRM.',
      'La copia, abierta con su llave, rehace el informe con la misma huella.',
    ]);
  } catch (error) {
    return result(2, ['El motor falló: ' + (error instanceof Error ? error.message : 'error desconocido')], []);
  }
}

/** Fase 3. */
export function gateWatch(trap: WatchedCompany, clean: WatchedCompany): GateResult {
  return guarded(3, () => {
    const withTraps = releaseWatchReport(trap);
    const without = releaseWatchReport(clean);
    const problems = [...prefixed('Con trampas: ', checkWatch(withTraps, trap.expected)), ...prefixed('Sin trampas: ', checkWatch(without, clean.expected))];
    const deletion = withTraps.entries.find(entry => entry.alerts.some(alert => alert.kind === 'contacts-deleted'));
    if (!deletion) problems.push('Con trampas: borrar contactos no da aviso.');
    else if (deletion.status !== 'retained') problems.push('Con trampas: la captura con contactos borrados no queda retenida.');
    const quiet = without.entries.flatMap(entry => entry.alerts).length + without.closing.alerts.length;
    if (quiet) problems.push('Sin trampas: ' + quiet + ' avisos falsos.');
    return result(3, problems, ['Borrar contactos da aviso y la captura queda retenida.', 'Sin borrados no sale ningún aviso.']);
  });
}

const equivalenceInputOf = (m: MigratedCompany) => ({ asOf: m.asOf, closing: m.closing, target: m.target, map: m.map, salt: m.salt, watch: m.watch });

/** Fase 4. Una migración limpia sale sin diferencias y una con fallos sembrados los enseña todos. */
export function gateMigration(trap: MigratedCompany, clean: MigratedCompany): GateResult {
  return guarded(4, () => {
    const without = releaseEquivalence(equivalenceInputOf(clean)).report;
    const withTraps = releaseEquivalence(equivalenceInputOf(trap)).report;
    const problems = [...prefixed('Limpia: ', checkEquivalence(without, clean.expected)), ...prefixed('Con fallos: ', checkEquivalence(withTraps, trap.expected))];
    if (without.verdict !== 'no-differences-in-scope') problems.push('Limpia: no sale «sin diferencias en lo que compara el mapa».');
    if (without.findings.length) problems.push('Limpia: ' + without.findings.length + ' hallazgos.');
    if (withTraps.verdict !== 'differences-found') problems.push('Con fallos: no se dan por encontradas las diferencias.');
    return result(4, problems, ['La migración limpia sale sin diferencias en lo que compara el mapa.', 'La migración con fallos sembrados los enseña todos.']);
  });
}

export async function runReadiness(options: { singleProduct?: boolean; scenarios?: Scenarios } = {}): Promise<Readiness> {
  const s = options.scenarios ?? defaultScenarios();
  const gates = [
    gateOrder(s.trap, s.clean, options.singleProduct === true),
    gateEngine(s.trap, s.clean),
    await gateCleanRoom(s.trap),
    gateWatch(s.watchedTrap, s.watchedClean),
    gateMigration(s.migratedTrap, s.migratedClean),
  ];
  return { gates, ready: gates.every(g => g.status === 'passed'), notCovered: [...NOT_COVERED] };
}
