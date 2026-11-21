#!/usr/bin/env node
// CLAUDE-TEAM-AUDIT · Recorre el espacio de equipo y mide accesibilidad y móvil.
//
//   node tools/team-audit/start.mjs --audit               ensayo propio + recorrido + parada (lo normal)
//   node tools/team-audit/run.mjs                         contra un ensayo ya en marcha (PLANB_TEAM_AUDIT_URL, por defecto
//                                                         http://127.0.0.1:5299/team)
//   node tools/team-audit/run.mjs --self-test             comprueba la propia medida con páginas sintéticas, sin servidor
//
// 8 secciones × 4 perfiles de ensayo × 1366, 390 y 320 px. Solo lee: no guarda, no envía y no cambia nada. Abre Chromium
// sin interfaz. Resultados en <outDir>/result.json (crudo) y <outDir>/summary.json (agrupado por gravedad).
// Sale con 0 si el recorrido se completó (haya o no hallazgos) y con 1 si alguna vista no se pudo abrir.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_MOTION_CSS, aggregate, focusState, pageAudit, severityOf, tally } from './checks.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXECUTABLE = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
export const WIDTHS = [1366, 390, 320];
export const SECTIONS = ['Empresa', 'Contactos', 'Trabajos', 'Dispositivos', 'Equipo', 'Integraciones', 'Agente', 'Comercial'];

async function auditView(page) {
  const { findings, coverage } = await page.evaluate(pageAudit, {});
  // Paneles plegables: también se miden desplegados (solo cambia la vista; no guarda nada) y se vuelven a plegar.
  const opened = await page.evaluate(() => { const closed = [...document.querySelectorAll('main details:not([open])')]; closed.forEach(d => { d.open = true; d.dataset.teamAuditOpened = '1'; }); return closed.length; });
  if (opened) {
    await page.waitForTimeout(300);
    const expanded = await page.evaluate(pageAudit, {});
    const known = new Set(findings.map(f => f.kind + '|' + f.element + '|' + f.detail));
    for (const finding of expanded.findings) if (!known.has(finding.kind + '|' + finding.element + '|' + finding.detail)) findings.push({ ...finding, state: 'desplegado' });
    coverage.expandedPanels = opened; coverage.expandedTexts = expanded.coverage.texts; coverage.expandedControls = expanded.coverage.controls;
    await page.evaluate(() => document.querySelectorAll('main details[data-team-audit-opened]').forEach(d => { d.open = false; delete d.dataset.teamAuditOpened; }));
  }
  // Foco visible (WCAG 2.4.7): desde el contenido, seis pulsaciones de Tab; cada elemento enfocado debe dibujar contorno o sombra.
  await page.locator('main').focus().catch(() => undefined);
  const invisible = new Set();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(focusState);
    if (state.focused && !state.visible) invisible.add(state.element + ' «' + state.name + '»');
  }
  for (const element of invisible) findings.push({ kind: 'focus', detail: 'foco sin indicador visible', element, source: null });
  return { findings, coverage };
}

export async function audit({ url = process.env.PLANB_TEAM_AUDIT_URL ?? 'http://127.0.0.1:5299/team', outDir = join(REPO, 'tests', '.tmp', 'perf-team-audit'), widths = WIDTHS, log = console.log } = {}) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const results = [];
  let broken = 0;
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 768 } });
      page.on('dialog', dialog => void dialog.dismiss()); // nunca se acepta descartar nada
      await page.goto(url);
      // El modo demo suele entrar solo (el botón «Entrar en ensayo local» asoma un instante); si no entra, se pulsa.
      const enter = page.getByRole('button', { name: 'Entrar en ensayo local' });
      const nav = page.getByRole('navigation', { name: 'Secciones del equipo' });
      try { await nav.waitFor({ timeout: 20_000 }); }
      catch { await enter.click({ timeout: 10_000 }); await nav.waitFor({ timeout: 30_000 }); }
      // R2 (467): sin transiciones mientras se mide, para comparar el foco con estados ya asentados.
      await page.addStyleTag({ content: NO_MOTION_CSS });
      const profiles = await page.getByLabel('Perfil de ensayo').locator('option').allTextContents();
      for (const profile of profiles) {
        await page.getByLabel('Perfil de ensayo').selectOption({ label: profile });
        await page.waitForTimeout(1500);
        for (const section of SECTIONS) {
          const context = { section, profile, width };
          try {
            const button = nav.getByRole('button', { name: section, exact: true });
            if (!(await button.count())) { results.push({ ...context, findings: [{ kind: 'error', detail: 'sección no disponible en la navegación', element: 'nav', source: null }] }); broken++; continue; }
            await button.click();
            await page.locator('main h1').first().waitFor({ timeout: 10_000 });
            await page.waitForTimeout(900);
            const { findings, coverage } = await auditView(page);
            results.push({ ...context, findings, coverage });
            log(String(width).padStart(4) + ' · ' + profile.padEnd(22) + ' · ' + section.padEnd(13) + ' ' + findings.length + ' hallazgos · ' + coverage.texts + ' textos · ' + coverage.controls + ' controles' + (coverage.expandedPanels ? ' · ' + coverage.expandedPanels + ' paneles desplegados' : ''));
          } catch (error) {
            broken++;
            results.push({ ...context, findings: [{ kind: 'error', detail: 'NO ABRE: ' + String(error?.message ?? error).split('\n')[0].slice(0, 140), element: 'main', source: null }] });
          }
        }
      }
      await page.close();
    }
  } finally { await browser.close(); }
  const groups = aggregate(results), counts = tally(groups);
  writeFileSync(join(outDir, 'result.json'), JSON.stringify({ url, widths, sections: SECTIONS, at: new Date().toISOString(), results }, null, 1));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ counts, groups }, null, 1));
  log('\nVistas: ' + results.length + ' · problemas únicos: ' + counts.problems + ' · ' + Object.entries(counts.bySeverity).map(([s, n]) => s + ' ' + n).join(' · '));
  for (const group of groups.slice(0, 40)) log('  [' + group.severity + '] ' + group.detail + ' · ' + group.element + ' · ' + group.views + ' vistas' + (group.source ? ' · ' + group.source.file + ' «' + group.source.selector + '»' : ''));
  log('Resultados en ' + outDir);
  return broken ? 1 : 0;
}

/** Comprueba la medida con páginas sintéticas: debe detectar cada problema plantado y no inventar ninguno en la página limpia. */
export async function selfTest({ log = console.log } = {}) {
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const clean = '<style>button:focus-visible{outline:2px solid #000}body{margin:0;font:16px sans-serif;color:#111;background:#fff}button{min-width:48px;min-height:48px}</style>'
      + '<main tabindex="-1"><h1>Título</h1><p>Texto legible</p><label>Nombre <input style="min-height:48px;width:200px"></label><button>Guardar</button>'
      // Un control dentro de un <details> cerrado no se ve ni se anuncia: no debe contarse (falso positivo corregido).
      + '<details><summary style="display:block;min-height:48px">Más opciones</summary><div style="display:flex"><button class="hidden-tiny" style="width:10px;height:10px"></button></div></details>'
      // Texto claro sobre un degradado oscuro: contraste suficiente en todas sus paradas.
      + '<div style="background:linear-gradient(rgb(14,42,47),rgb(12,37,41));color:#fff"><span>Barra lateral</span></div></main>';
    await page.setContent(clean);
    const cleanFindings = (await page.evaluate(pageAudit, {})).findings;
    if (cleanFindings.length) failures.push('página limpia con hallazgos: ' + cleanFindings.map(f => f.detail).join(' | '));
    const planted = '<style>.pale{color:#bbb}.tiny{width:20px;height:20px;padding:0}.wide{width:900px}body{margin:0;font:16px sans-serif;background:#fff}button{outline:none}</style>'
      + '<main><h1>Uno</h1><h1>Dos</h1><p class="pale">Texto pálido</p><input><button class="tiny">x</button><button class="tiny" aria-label=""></button><div class="wide">ancho</div><img src="data:,">'
      // Texto gris sobre un degradado que acaba en claro: la peor parada incumple.
      + '<div style="background:linear-gradient(#222,#ddd);color:#999"><span class="on-gradient">Sobre degradado</span></div></main>';
    await page.setContent(planted);
    const found = (await page.evaluate(pageAudit, {})).findings;
    const kinds = new Set(found.map(f => f.kind));
    for (const kind of ['contrast', 'label', 'name', 'target', 'h1', 'overflow', 'img-alt']) if (!kinds.has(kind)) failures.push('no detecta ' + kind);
    if (!found.some(f => f.kind === 'contrast' && f.element.includes('on-gradient') && f.detail.includes('degradado'))) failures.push('no detecta el contraste insuficiente sobre un degradado');
    const contrast = found.find(f => f.kind === 'contrast' && f.element.includes('pale'));
    if (contrast && !(contrast.source && contrast.source.selector === '.pale')) failures.push('no atribuye el contraste a la regla .pale: ' + JSON.stringify(contrast?.source));
    const target = found.find(f => f.kind === 'target');
    if (target && severityOf(target) !== 'media') failures.push('un objetivo de 20 px debería ser de gravedad media');
    // Foco: un botón sin contorno ni sombra al enfocarlo.
    await page.locator('button.tiny').first().focus();
    const focus = await page.evaluate(focusState);
    if (!focus.focused || focus.visible) failures.push('no detecta el foco invisible: ' + JSON.stringify(focus));

    // R2 (467): los cuatro casos que la versión presentada dejaba pasar, más los controles positivos que no deben marcarse.
    const r2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await r2.setContent('<style>' + NO_MOTION_CSS + 'body{margin:0;font:16px sans-serif;color:#111;background:#fff}button{min-width:48px;min-height:48px;border:1px solid #333;background:#fff;color:#111}'
      + '.ring:focus-visible{outline:3px solid #000}.static{box-shadow:0 0 0 3px #888;outline:none}.lane{display:flex;overflow-x:auto;width:390px}.lane button{flex:none;width:200px}'
      + '.offleft{position:relative;left:-90px;width:70px}</style><main><h1>R2</h1>'
      + '<label for="ok">Nombre</label><input id="ok" style="min-height:48px">'
      + '<input id="ghost" aria-labelledby="no-existe" style="min-height:48px">'
      + '<label>Notas <textarea id="small" style="width:22px;height:22px"></textarea></label>'
      + '<label>Lista <select id="opts" style="min-height:48px"><option>opción con texto</option></select></label>'
      + '<select id="bare" style="min-height:48px"><option>texto de la opción</option></select>'
      + '<button class="ring">Con anillo</button><button class="static">Sombra fija</button>'
      + '<div><button class="offleft">Fuera</button></div>'
      + '<div class="lane"><button>Uno</button><button>Dos</button><button id="reachable">Tres</button></div></main>');
    const r2found = (await r2.evaluate(pageAudit, {})).findings;
    const has = (kind, element) => r2found.some(f => f.kind === kind && f.element.includes(element));
    if (!has('label', 'input#ghost')) failures.push('R2: no detecta el aria-labelledby que apunta a algo inexistente');
    if (!has('label', 'select#bare')) failures.push('R2: toma el texto de las opciones de un select como etiqueta');
    if (has('label', 'select#opts') || has('label', 'input#ok')) failures.push('R2: marca como sin etiqueta un campo bien etiquetado');
    if (!has('target', 'textarea#small')) failures.push('R2: no incluye el textarea de 22×22 px en los objetivos táctiles');
    if (!has('offscreen', 'button.offleft')) failures.push('R2: no detecta el control fuera de la pantalla por la izquierda');
    if (r2found.some(f => f.kind === 'offscreen' && f.element.includes('reachable')) || r2found.some(f => f.kind === 'offscreen' && !f.element.includes('offleft'))) failures.push('R2: marca como inalcanzable un control dentro de un carril desplazable');
    // Foco con teclado: el anillo de :focus-visible cuenta; la sombra fija que no cambia al enfocar, no.
    const focusOn = async selector => { await r2.locator(selector).focus(); await r2.keyboard.press('Shift+Tab'); await r2.keyboard.press('Tab'); return r2.evaluate(focusState); };
    const ring = await focusOn('button.ring'), still = await focusOn('button.static');
    if (!ring.visible) failures.push('R2: no reconoce el anillo de :focus-visible como indicador: ' + JSON.stringify(ring));
    if (still.visible) failures.push('R2: toma la sombra fija como indicador de foco: ' + JSON.stringify(still));
    await r2.close();
  } finally { await browser.close(); }
  log(failures.length ? 'Autoprueba con fallos:\n  ' + failures.join('\n  ') : 'Autoprueba: la medida detecta los 7 tipos plantados, el contraste sobre un degradado, el foco invisible y la regla de origen; la página limpia (con un control en un details cerrado y texto claro sobre degradado oscuro) sale sin hallazgos. R2: detecta el aria-labelledby roto, el select sin etiqueta, el textarea pequeño, el control fuera por la izquierda y la sombra fija sin cambio de foco; respeta el carril desplazable y el anillo de :focus-visible.');
  return failures.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = process.argv.includes('--self-test') ? selfTest() : audit();
  run.then(code => { process.exitCode = code; }, error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; });
}
