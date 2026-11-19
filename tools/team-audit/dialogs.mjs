// CLAUDE-TEAM-AUDIT-R · Segunda ronda de la auditoría de /team: ventanas (diálogos) y agrupación por tema.
// Reutiliza tools/team-audit/checks.mjs sin cambiarlo (sigue en revisión en CLAUDE-TEAM-AUDIT).
// `dialogState` se ejecuta DENTRO de la página: autocontenida, sin cierres ni imports.
import { SEVERITIES, findingKey, severityOf } from './checks.mjs';

/**
 * Estado de las ventanas abiertas y del foco. `openerSelector` marca el botón que abrió la ventana (para comprobar el
 * retorno del foco). Devuelve { dialogs, name, ariaModal, focusInside, focusVisible, active, onOpener }.
 */
export function dialogState(openerSelector) {
  const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open]')].filter(d => { const r = d.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
  const top = dialogs.at(-1) ?? null;
  const name = top ? (top.getAttribute('aria-label') || (top.getAttribute('aria-labelledby') ? top.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ') : '')).trim() : '';
  const active = document.activeElement;
  const describe = e => !e || e === document.body ? 'body' : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label').slice(0, 30) + ']' : '');
  let focusVisible = false;
  if (active && active !== document.body) { const s = getComputedStyle(active); focusVisible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none'); }
  return {
    dialogs: dialogs.length, name, ariaModal: top ? top.getAttribute('aria-modal') === 'true' || top.tagName === 'DIALOG' : false,
    focusInside: !!(top && active && top.contains(active)), focusVisible, active: describe(active),
    onOpener: !!(openerSelector && active && active.matches(openerSelector)),
  };
}

/**
 * Contraste del TEXTO DENTRO de desplegables y campos (valor mostrado y, si está vacío, el placeholder). La medida de
 * checks.mjs solo cuenta elementos con texto propio, y el valor de un <select> vive en sus <option>: quedaba sin medir.
 * Se ejecuta en la página. Devuelve hallazgos con kind 'contrast' (misma gravedad que el resto del texto).
 */
export function controlTextContrast(scope) {
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a) });
  // Una imagen url() en el propio campo es la flecha o el icono decorativo (no está detrás del texto): cuenta su color de
  // fondo. Un degradado o una imagen en un antepasado sí puede estar detrás del texto: no se puede calcular y se omite.
  const background = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); const image = s.backgroundImage; if (image !== 'none' && !(e === el && /^url\(/.test(image) && !image.includes('gradient'))) return null; const c = parse(s.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let color = { r: 255, g: 255, b: 255 }; for (const c of stack.reverse()) color = blend(c, color); return color; };
  const ratioOf = (fg, bg) => { const text = blend(fg, bg); return (Math.max(lum(text), lum(bg)) + 0.05) / (Math.min(lum(text), lum(bg)) + 0.05); };
  const describe = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label').slice(0, 30) + ']' : '');
  const out = [], checked = { controls: 0 };
  for (const el of document.querySelectorAll(scope)) {
    if (!el.matches('select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="range"]):not([type="color"]):not([type="file"])')) continue;
    const r = el.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1 || el.disabled || el.closest('[hidden],[inert],[aria-hidden="true"],details:not([open])')) continue;
    const bg = background(el); if (!bg) { checked.skipped = (checked.skipped ?? 0) + 1; continue; }
    checked.controls++;
    const s = getComputedStyle(el), size = parseFloat(s.fontSize), large = size >= 24 || (Number(s.fontWeight) >= 700 && size >= 18.66), required = large ? 3 : 4.5;
    const empty = el.tagName !== 'SELECT' && !el.value;
    const fg = parse(empty ? getComputedStyle(el, '::placeholder').color : s.color);
    if (!fg || (empty && !el.getAttribute('placeholder'))) continue;
    const ratio = ratioOf(fg, bg);
    if (ratio < required) out.push({ kind: 'contrast', ratio: Math.round(ratio * 100) / 100, required, detail: 'contraste ' + ratio.toFixed(2) + ' < ' + required + ' en el ' + (empty ? 'placeholder' : 'valor') + ' de un campo', element: describe(el), source: null });
  }
  return { findings: out, checked };
}

export const DIALOG_KINDS = ['dialog-open', 'dialog-name', 'dialog-modal', 'dialog-initial-focus', 'dialog-trap', 'dialog-focus-visible', 'dialog-escape', 'dialog-return'];

/**
 * Comprobaciones de teclado sobre una ventana ya abierta desde `openerSelector`. Recibe la página de Playwright.
 * Pulsa Tab y Mayús+Tab (focusables + 2) veces, comprueba que el foco no sale y se ve, y cierra con Escape.
 * Nunca pulsa Enter ni Espacio dentro de la ventana: no se envía ni se guarda nada.
 */
export async function keyboardChecks(page, openerSelector, focusableCount) {
  const findings = [];
  const state = () => page.evaluate(dialogState, openerSelector);
  await page.waitForTimeout(250);
  const opened = await state();
  if (!opened.dialogs) return [{ kind: 'dialog-open', detail: 'la ventana no se abrió', element: openerSelector, source: null }];
  if (!opened.name) findings.push({ kind: 'dialog-name', detail: 'ventana sin nombre accesible', element: '[role=dialog]', source: null });
  if (!opened.ariaModal) findings.push({ kind: 'dialog-modal', detail: 'ventana sin aria-modal="true"', element: '[role=dialog]', source: null });
  if (!opened.focusInside) findings.push({ kind: 'dialog-initial-focus', detail: 'el foco inicial no está dentro de la ventana (' + opened.active + ')', element: '[role=dialog]', source: null });
  const presses = Math.max(3, focusableCount + 2), escaped = new Set(), invisible = new Set();
  for (const key of ['Tab', 'Shift+Tab']) for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
    const now = await state();
    if (!now.focusInside) escaped.add(key + ' → ' + now.active);
    else if (!now.focusVisible) invisible.add(now.active);
  }
  for (const where of escaped) findings.push({ kind: 'dialog-trap', detail: 'el foco sale de la ventana con ' + where, element: '[role=dialog]', source: null });
  for (const element of invisible) findings.push({ kind: 'dialog-focus-visible', detail: 'foco sin indicador visible dentro de la ventana', element, source: null });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await state();
  if (closed.dialogs) findings.push({ kind: 'dialog-escape', detail: 'Escape no cierra la ventana', element: '[role=dialog]', source: null });
  else if (!closed.onOpener) findings.push({ kind: 'dialog-return', detail: 'al cerrar, el foco no vuelve al botón que abrió la ventana (' + closed.active + ')', element: openerSelector, source: null });
  return findings;
}

/** Gravedad: los fallos de ventana impiden usarla con teclado o lector de pantalla → graves. El resto, como en checks.mjs. */
export function severityR(finding) {
  return DIALOG_KINDS.includes(finding.kind) ? 'grave' : severityOf(finding);
}

/**
 * Como aggregate() de checks.mjs, pero con el tema en cada contexto y la gravedad de severityR.
 * results: [{ theme, section, profile, width, findings }].
 */
export function aggregateR(results) {
  const groups = new Map();
  for (const result of results) for (const finding of result.findings) {
    const key = findingKey(finding), severity = severityR(finding);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { key, severity, kind: finding.kind, detail: finding.detail, element: finding.element, source: finding.source ?? null, contexts: [], themes: new Set(), sections: new Set(), profiles: new Set(), widths: new Set() });
    if (SEVERITIES.indexOf(severity) < SEVERITIES.indexOf(group.severity)) group.severity = severity;
    group.contexts.push([result.theme, result.section, result.profile, result.width].join(' · '));
    group.themes.add(result.theme); group.sections.add(result.section); group.profiles.add(result.profile); group.widths.add(result.width);
  }
  return [...groups.values()].map(group => ({ ...group, themes: [...group.themes], sections: [...group.sections], profiles: [...group.profiles], widths: [...group.widths].sort((a, b) => b - a), views: group.contexts.length }))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.views - a.views || a.key.localeCompare(b.key));
}

/** Recuento por gravedad, tipo y tema. */
export function tallyR(groups) {
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, 0])), byKind = {}, byTheme = {};
  for (const group of groups) {
    bySeverity[group.severity]++; byKind[group.kind] = (byKind[group.kind] ?? 0) + 1;
    for (const theme of group.themes) byTheme[theme] = (byTheme[theme] ?? 0) + 1;
  }
  return { problems: groups.length, bySeverity, byKind, byTheme };
}
