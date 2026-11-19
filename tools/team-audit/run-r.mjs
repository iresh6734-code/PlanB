#!/usr/bin/env node
// CLAUDE-TEAM-AUDIT-R · Segunda ronda de la auditoría de /team: modo oscuro y ventanas.
//
//   node tools/team-audit/run-r.mjs --start        arranca el ensayo propio (start.mjs, 4531/5299), recorre todo y lo para
//   node tools/team-audit/run-r.mjs                contra un ensayo ya en marcha (PLANB_TEAM_AUDIT_ORIGIN, por defecto
//                                                  http://127.0.0.1:5299)
//   node tools/team-audit/run-r.mjs --self-test    comprueba las medidas de ventana con diálogos sintéticos, sin servidor
//   Opciones: --themes light,dark (por defecto ambos) · --no-views · --no-dialogs
//
// Vistas: 8 secciones × 4 perfiles × 1366/390/320 px en cada tema (el oscuro se activa como la App: planb:theme=dark en
// localStorage antes de cargar). Ventanas: «Editar teléfono del equipo» (Contactos) por perfil, anchura y tema, y «Nuevo
// espacio» en la página de ensayo tools/team-audit/harness.html. Solo lee: abre, mide y cierra con Escape; nunca envía.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { focusState, pageAudit } from './checks.mjs';
import { aggregateR, controlTextContrast, keyboardChecks, severityR, tallyR } from './dialogs.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXECUTABLE = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
export const WIDTHS = [1366, 390, 320];
export const THEMES = ['light', 'dark'];
export const SECTIONS = ['Empresa', 'Contactos', 'Trabajos', 'Dispositivos', 'Equipo', 'Integraciones', 'Agente', 'Comercial'];
const THEME_LABEL = { light: 'claro', dark: 'oscuro' };
const OPENER = '[data-team-audit-opener]';

/** Página nueva con el tema elegido guardado como lo guarda src/app-shell/theme.ts, antes de que cargue la App. */
async function themedPage(browser, theme, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 768 } });
  await page.addInitScript(value => { try { localStorage.setItem('planb:theme', value); } catch { /* */ } }, theme);
  page.on('dialog', dialog => void dialog.dismiss()); // confirm() nativos: nunca se acepta nada
  return page;
}

/** Vista: medidas de checks.mjs, también con sus <details> desplegados, y foco visible en seis pulsaciones de Tab. */
async function auditViewR(page) {
  const { findings, coverage } = await page.evaluate(pageAudit, {});
  // Texto dentro de desplegables y campos (la medida de checks.mjs no lo cubre).
  const fields = await page.evaluate(controlTextContrast, 'main *, .team-topbar *'); findings.push(...fields.findings); coverage.fieldTexts = fields.checked.controls; coverage.fieldsSkipped = fields.checked.skipped ?? 0;
  const opened = await page.evaluate(() => { const closed = [...document.querySelectorAll('main details:not([open])')]; closed.forEach(d => { d.open = true; d.dataset.teamAuditOpened = '1'; }); return closed.length; });
  if (opened) {
    await page.waitForTimeout(300);
    const expanded = await page.evaluate(pageAudit, {});
    const known = new Set(findings.map(f => f.kind + '|' + f.element + '|' + f.detail));
    for (const finding of expanded.findings) if (!known.has(finding.kind + '|' + finding.element + '|' + finding.detail)) findings.push({ ...finding, state: 'desplegado' });
    coverage.expandedPanels = opened; coverage.expandedTexts = expanded.coverage.texts; coverage.expandedControls = expanded.coverage.controls;
    await page.evaluate(() => document.querySelectorAll('main details[data-team-audit-opened]').forEach(d => { d.open = false; delete d.dataset.teamAuditOpened; }));
  }
  await page.locator('main').focus().catch(() => undefined);
  const invisible = new Set();
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); const s = await page.evaluate(focusState); if (s.focused && !s.visible) invisible.add(s.element + ' «' + s.name + '»'); }
  for (const element of invisible) findings.push({ kind: 'focus', detail: 'foco sin indicador visible', element, source: null });
  return { findings, coverage };
}

/** Ventana: se abre con teclado desde `opener` (Enter), se mide por dentro y se comprueba el teclado; se cierra con Escape. */
async function auditDialog(page, opener) {
  await opener.evaluate(el => { document.querySelectorAll('[data-team-audit-opener]').forEach(e => e.removeAttribute('data-team-audit-opener')); el.setAttribute('data-team-audit-opener', ''); });
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.locator('[role="dialog"]').first().waitFor({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(350);
  const inside = await page.evaluate(pageAudit, { scope: '[role="dialog"] *' });
  const findings = inside.findings.filter(f => f.kind !== 'h1'); // el h1 es de la vista, no de la ventana
  const fields = await page.evaluate(controlTextContrast, '[role="dialog"] *'); findings.push(...fields.findings); inside.coverage.fieldTexts = fields.checked.controls; inside.coverage.fieldsSkipped = fields.checked.skipped ?? 0;
  const focusable = await page.evaluate(() => { const d = [...document.querySelectorAll('[role="dialog"]')].at(-1); return d ? d.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]').length : 0; });
  findings.push(...await keyboardChecks(page, OPENER, focusable));
  return { findings, coverage: { ...inside.coverage, focusable } };
}

async function enterTeam(page, url) {
  await page.goto(url);
  const nav = page.getByRole('navigation', { name: 'Secciones del equipo' });
  try { await nav.waitFor({ timeout: 20_000 }); }
  catch { await page.getByRole('button', { name: 'Entrar en ensayo local' }).click({ timeout: 10_000 }); await nav.waitFor({ timeout: 30_000 }); }
  return nav;
}

export async function auditR({ origin = process.env.PLANB_TEAM_AUDIT_ORIGIN ?? 'http://127.0.0.1:5299', outDir = join(REPO, 'tests', '.tmp', 'perf-team-audit-r'), themes = THEMES, widths = WIDTHS, views = true, dialogs = true, log = console.log } = {}) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const results = [], notes = [];
  let broken = 0;
  const record = (context, run) => run.then(({ findings, coverage }) => { results.push({ ...context, findings, coverage }); log([THEME_LABEL[context.theme], String(context.width).padStart(4), context.profile.padEnd(22), context.section.padEnd(34)].join(' · ') + ' ' + findings.length + ' hallazgos'); },
    error => { broken++; results.push({ ...context, findings: [{ kind: 'error', detail: 'NO ABRE: ' + String(error?.message ?? error).split('\n')[0].slice(0, 140), element: context.section, source: null }] }); });
  try {
    for (const theme of themes) for (const width of widths) {
      const page = await themedPage(browser, theme, width);
      const nav = await enterTeam(page, origin + '/team');
      const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
      if (applied !== theme) notes.push('El tema ' + theme + ' no se aplicó en ' + width + ' px (data-theme=' + applied + ')');
      const profiles = await page.getByLabel('Perfil de ensayo').locator('option').allTextContents();
      for (const profile of profiles) {
        await page.getByLabel('Perfil de ensayo').selectOption({ label: profile });
        await page.waitForTimeout(1500);
        if (views) for (const section of SECTIONS) {
          await record({ type: 'view', theme, section, profile, width }, (async () => {
            await nav.getByRole('button', { name: section, exact: true }).click();
            await page.locator('main h1').first().waitFor({ timeout: 10_000 });
            await page.waitForTimeout(900);
            return auditViewR(page);
          })());
        }
        if (dialogs) {
          await nav.getByRole('button', { name: 'Contactos', exact: true }).click();
          await page.locator('main h1').first().waitFor({ timeout: 10_000 }); await page.waitForTimeout(900);
          const opener = page.locator('button[aria-label^="Editar teléfono de"]:not(:disabled)').first();
          if (await opener.count()) await record({ type: 'dialog', theme, section: 'Ventana · Editar teléfono del equipo', profile, width }, auditDialog(page, opener));
          else notes.push('«Editar teléfono del equipo» no se puede abrir con el perfil ' + profile + ' (botón desactivado, como corresponde a su permiso) · ' + THEME_LABEL[theme] + ' · ' + width);
        }
      }
      await page.close();
      if (dialogs) {
        const harness = await themedPage(browser, theme, width);
        await harness.goto(origin + '/tools/team-audit/harness.html');
        const opener = harness.getByRole('button', { name: 'Crear espacio separado' });
        await opener.waitFor({ timeout: 30_000 });
        await record({ type: 'dialog', theme, section: 'Ventana · Nuevo espacio (página de ensayo)', profile: 'ensayo', width }, auditDialog(harness, opener));
        await harness.close();
      }
    }
  } finally { await browser.close(); }
  const groups = aggregateR(results), counts = tallyR(groups);
  writeFileSync(join(outDir, 'result.json'), JSON.stringify({ origin, themes, widths, sections: SECTIONS, at: new Date().toISOString(), notes: [...new Set(notes)], results }, null, 1));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ counts, groups }, null, 1));
  log('\nVistas y ventanas: ' + results.length + ' · problemas únicos: ' + counts.problems + ' · ' + Object.entries(counts.bySeverity).map(([s, n]) => s + ' ' + n).join(' · ') + ' · por tema ' + JSON.stringify(counts.byTheme));
  for (const group of groups.slice(0, 60)) log('  [' + group.severity + '] ' + group.detail + ' · ' + group.element + ' · ' + group.views + ' (' + group.themes.join('/') + ')' + (group.source ? ' · ' + group.source.file + ' «' + group.source.selector + '» ' + group.source.prop + ': ' + group.source.value : ''));
  for (const note of [...new Set(notes)].slice(0, 12)) log('  Nota: ' + note);
  log('Resultados en ' + outDir);
  return broken ? 1 : 0;
}

/** Autoprueba de las comprobaciones de ventana: un diálogo correcto no da hallazgos y uno defectuoso da los cinco fallos. */
export async function selfTestR({ log = console.log } = {}) {
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const failures = [];
  const css = '<style>body{font:16px sans-serif;color:#111;background:#fff}button,input{min-width:48px;min-height:48px}:focus-visible{outline:2px solid #000}</style>';
  // Diálogo correcto: nombre, aria-modal, foco inicial dentro, Tab encerrado, Escape cierra y devuelve el foco.
  const good = css + '<main><h1>Vista</h1><button id="open">Abrir</button></main><script>'
    + 'const open=document.getElementById("open");open.onclick=()=>{const d=document.createElement("section");d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.setAttribute("aria-label","Ventana buena");'
    + 'd.innerHTML="<button>Cerrar</button><label>Campo <input></label><button>Guardar</button>";document.body.append(d);const items=()=>[...d.querySelectorAll("button,input")];items()[0].focus();'
    + 'const key=e=>{if(e.key==="Escape"){d.remove();document.removeEventListener("keydown",key);open.focus();}if(e.key==="Tab"){const it=items(),f=it[0],l=it.at(-1);if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus();}else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus();}}};document.addEventListener("keydown",key);};</script>';
  // Diálogo defectuoso: sin nombre ni aria-modal, foco fuera, Tab escapa, Escape no cierra.
  const bad = css + '<main><h1>Vista</h1><button id="open">Abrir</button><button>Fuera</button></main><script>'
    + 'document.getElementById("open").onclick=()=>{const d=document.createElement("div");d.setAttribute("role","dialog");d.innerHTML="<button>Uno</button><button>Dos</button>";document.body.append(d);};</script>';
  // Diálogo que cierra con Escape pero deja el foco en el body.
  const lost = css + '<main><h1>Vista</h1><button id="open">Abrir</button></main><script>'
    + 'document.getElementById("open").onclick=()=>{const d=document.createElement("section");d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.setAttribute("aria-label","Pierde el foco");d.innerHTML="<button>Cerrar</button>";document.body.append(d);d.querySelector("button").focus();'
    + 'document.addEventListener("keydown",e=>{if(e.key==="Tab"){e.preventDefault();}if(e.key==="Escape"){d.remove();}});};</script>';
  try {
    for (const [name, html, expected] of [['correcto', good, []], ['defectuoso', bad, ['dialog-name', 'dialog-modal', 'dialog-initial-focus', 'dialog-trap', 'dialog-escape']], ['sin retorno', lost, ['dialog-return']]]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.setContent(html);
      const { findings } = await auditDialog(page, page.locator('#open'));
      const kinds = [...new Set(findings.map(f => f.kind))].sort();
      if (JSON.stringify(kinds) !== JSON.stringify([...expected].sort())) failures.push('diálogo ' + name + ': esperaba ' + JSON.stringify(expected) + ' y obtuvo ' + JSON.stringify(kinds) + ' ' + JSON.stringify(findings.map(f => f.detail)));
      if (findings.some(f => !['grave', 'media', 'leve'].includes(severityR(f)))) failures.push('gravedad desconocida');
      await page.close();
    }
    // Texto dentro de campos: valor gris, placeholder pálido y desplegable claro se detectan; el campo correcto no.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<style>body{background:#fff;color:#111;font:16px sans-serif}.ph::placeholder{color:#ccc}</style><main>'
      + '<label>Bien <input id="ok" value="legible" style="color:#111"></label><label>Valor <input id="grey" value="gris" style="color:#bbb"></label>'
      + '<label>Pista <input id="hint" class="ph" placeholder="pista"></label><label>Lista <select id="pale" style="color:#ccc;background:#fff url(data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E) no-repeat right"><option>opción</option></select></label></main>');
    const fields = await page.evaluate(controlTextContrast, 'main *');
    const flagged = fields.findings.map(f => f.element.split('.')[0]).sort();
    if (JSON.stringify(flagged) !== JSON.stringify(['input#grey', 'input#hint', 'select#pale'])) failures.push('campos: esperaba input#grey, input#hint y select#pale; obtuvo ' + JSON.stringify(flagged));
    if (!fields.findings.some(f => f.detail.includes('placeholder'))) failures.push('campos: no distingue el placeholder');
    if (fields.checked.controls !== 4) failures.push('campos: debería haber medido 4 y midió ' + fields.checked.controls);
    await page.close();
  } finally { await browser.close(); }
  log(failures.length ? 'Autoprueba de ventanas con fallos:\n  ' + failures.join('\n  ') : 'Autoprueba de ventanas: el diálogo correcto sale limpio; el defectuoso da nombre, aria-modal, foco inicial, Tab y Escape; el que pierde el foco da el retorno; en campos se detectan valor, placeholder y desplegable con poco contraste.');
  return failures.length ? 1 : 0;
}

function parseOptions(argv) {
  const options = { start: false, selfTest: false, themes: THEMES, views: true, dialogs: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--start') options.start = true;
    else if (arg === '--self-test') options.selfTest = true;
    else if (arg === '--no-views') options.views = false;
    else if (arg === '--no-dialogs') options.dialogs = false;
    else if (arg === '--themes') {
      const value = argv[++i];
      const themes = String(value ?? '').split(',').filter(Boolean);
      if (!themes.length || themes.some(t => !THEMES.includes(t))) throw new Error('--themes admite light, dark o light,dark');
      options.themes = themes;
    } else throw new Error('Opción desconocida: ' + arg);
  }
  return options;
}

/** Arranca start.mjs (sin --audit), espera a que el ensayo esté listo y devuelve su carpeta y cómo pararlo. */
function startEnsayo() {
  return new Promise((resolveStart, reject) => {
    const child = spawn(process.execPath, [join(REPO, 'tools', 'team-audit', 'start.mjs')], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    const stop = () => new Promise(done => { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('exit', () => done()); else { child.kill('SIGINT'); done(); } });
    // El tope de arranque se cancela en cuanto el ensayo está listo (antes seguía vivo y paraba el ensayo a los 120 s).
    let ready = false;
    const timer = setTimeout(() => { if (!ready) { void stop(); reject(new Error('El ensayo no arrancó en 120 s: ' + output.slice(-600))); } }, 120_000);
    const onData = chunk => { output += chunk; const match = !ready && /listo · \S+ · datos en (.+)$/m.exec(output); if (match) { ready = true; clearTimeout(timer); resolveStart({ work: match[1].trim(), stop }); } };
    child.stdout.setEncoding('utf8').on('data', onData); child.stderr.setEncoding('utf8').on('data', onData);
    child.on('exit', code => { clearTimeout(timer); if (!ready) reject(new Error('El ensayo terminó (' + code + '): ' + output.slice(-600))); });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const options = parseOptions(process.argv.slice(2));
    if (options.selfTest) return selfTestR();
    if (!options.start) return auditR(options);
    const ensayo = await startEnsayo();
    try { return await auditR({ ...options, outDir: join(ensayo.work, 'audit-r') }); }
    finally { await ensayo.stop(); }
  })().then(code => { process.exitCode = code; }, error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; });
}
