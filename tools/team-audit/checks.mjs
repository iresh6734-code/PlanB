// CLAUDE-TEAM-AUDIT · Medidas de accesibilidad y móvil para el espacio de equipo (/team).
// Lógica de medida copiada y ampliada de tools/visual/a11y.mts y tools/visual/mobile-scan.mts (que no se editan).
// `pageAudit` y `focusState` se ejecutan DENTRO de la página (page.evaluate): son autocontenidas, sin cierres ni imports.
// El resto son funciones puras que se prueban desde Node (tests/team-audit.test.ts).

/**
 * Mide la vista actual. Devuelve { findings, coverage }: hallazgos { kind, detail, element, source }, donde `source` es la regla CSS que más
 * probablemente fija la propiedad implicada ({ file, selector, prop, value }) o null. Solo lee.
 * kind: contrast · name · label · target · img-alt · h1 · overflow · offscreen.
 */
export function pageAudit(options) {
  const { scope = 'main *, .sidebar *, .team-topbar *', mobile = innerWidth < 768 } = options || {};
  const out = [];
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a) });
  // Fondos posibles detrás de un texto: uno si es liso; uno por parada si es un degradado de colores sólidos (se mide el peor).
  // Devuelve null si hay una imagen u otro fondo que no se puede calcular.
  const background = el => {
    const stack = [];
    let base = [{ r: 255, g: 255, b: 255 }], gradient = false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') {
        if (!/^(repeating-)?(linear|radial)-gradient\(/.test(s.backgroundImage) || s.backgroundImage.includes('url(')) return null;
        const stops = [...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m => parse(m[0])).filter(Boolean);
        if (!stops.length) return null;
        const under = parse(s.backgroundColor), floor = under && under.a > 0 ? blend(under, { r: 255, g: 255, b: 255 }) : { r: 255, g: 255, b: 255 };
        base = stops.map(stop => blend(stop, floor)); gradient = true; break;
      }
      const c = parse(s.backgroundColor); if (c && c.a > 0) { if (c.a >= 1) { base = [blend(c, c)]; break; } stack.push(c); }
    }
    const result = base.map(color => { for (const c of [...stack].reverse()) color = blend(c, color); return color; });
    result.gradient = gradient;
    return result;
  };
  // Visible para la persona: con tamaño, sin ocultar y fuera de un <details> cerrado (salvo su summary). Un control dentro
  // de un <details> cerrado puede tener caja, pero ni se ve ni se anuncia: contarlo daba falsos «sin nombre».
  const insideClosedDetails = e => { for (let d = e.closest('details:not([open])'); d; d = d.parentElement && d.parentElement.closest('details:not([open])')) { const summary = d.querySelector(':scope > summary'); if (!summary || !summary.contains(e)) return true; } return false; };
  const visible = e => {
    const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return false;
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    if (e.closest('[hidden], [aria-hidden="true"], [inert]') || insideClosedDetails(e)) return false;
    return typeof e.checkVisibility === 'function' ? e.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) : true;
  };
  const describe = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const accessibleName = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') ? e.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ') : '') || e.innerText || e.getAttribute('title') || e.getAttribute('value') || '').trim();
  // Regla CSS que más probablemente fija `props` en `el`: entre las que coinciden (con su media activa), gana !important y
  // después la última en orden de hoja. Aproximación: no calcula especificidad. Archivo: data-vite-dev-id (Vite) o href.
  const sourceOf = (el, props) => {
    let best = null, order = 0;
    const visit = (rules, file) => {
      for (const rule of rules) {
        order++;
        if (rule.cssRules && !rule.selectorText) {
          // @media y @supports solo si su condición se cumple ahora; @layer y otros bloques, siempre.
          try { if (rule.media ? matchMedia(rule.media.mediaText).matches : rule.conditionText !== undefined ? CSS.supports(rule.conditionText) : true) visit(rule.cssRules, file); } catch { /* */ }
          continue;
        }
        if (!rule.selectorText || !rule.style) continue;
        let matches = false; try { matches = el.matches(rule.selectorText); } catch { /* pseudo-elementos */ }
        if (!matches) continue;
        for (const prop of props) {
          const value = rule.style.getPropertyValue(prop); if (!value) continue;
          const important = rule.style.getPropertyPriority(prop) === 'important';
          if (!best || important >= best.important) best = { file, selector: rule.selectorText.slice(0, 160), prop, value: value.trim().slice(0, 80), important, order };
        }
      }
    };
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const node = sheet.ownerNode, file = (node && node.getAttribute && node.getAttribute('data-vite-dev-id')) || sheet.href || 'estilo en línea';
      visit(rules, String(file).replace(/^.*?[\\/](src[\\/])/, '$1').replace(/\\/g, '/'));
    }
    if (!best && el.getAttribute('style')) return { file: 'atributo style', selector: describe(el), prop: props[0], value: el.style.getPropertyValue(props[0]) };
    return best ? { file: best.file, selector: best.selector, prop: best.prop, value: best.value, important: best.important } : null;
  };

  // Cobertura: cuánto se evaluó de verdad (un «sin hallazgos» con cero elementos no significa nada).
  const coverage = { texts: 0, textsWithoutBackground: 0, controls: 0 };
  // Contraste (WCAG 1.4.3): 4,5:1, o 3:1 en texto grande (≥ 24 px, o ≥ 18,66 px en negrita).
  const seen = new Set();
  for (const node of document.querySelectorAll(scope)) {
    const own = [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim().length > 1);
    if (!own || !visible(node) || node.closest('button:disabled,[aria-disabled="true"],select:disabled,input:disabled')) continue;
    const s = getComputedStyle(node), fg = parse(s.color), backgrounds = background(node);
    if (!fg || !backgrounds) { coverage.textsWithoutBackground++; continue; }
    coverage.texts++; if (backgrounds.gradient) coverage.textsOnGradient = (coverage.textsOnGradient ?? 0) + 1;
    // Sobre un degradado cuenta la parada con peor contraste.
    const ratio = Math.min(...backgrounds.map(bg => { const text = blend(fg, bg); return (Math.max(lum(text), lum(bg)) + 0.05) / (Math.min(lum(text), lum(bg)) + 0.05); }));
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700, large = size >= 24 || (bold && size >= 18.66);
    const required = large ? 3 : 4.5;
    if (ratio < required) {
      const key = describe(node) + ratio.toFixed(2); if (seen.has(key)) continue; seen.add(key);
      out.push({ kind: 'contrast', ratio: Math.round(ratio * 100) / 100, required, detail: 'contraste ' + ratio.toFixed(2) + ' < ' + required + (backgrounds.gradient ? ' (sobre degradado, peor parada)' : '') + ' «' + node.textContent.trim().slice(0, 40) + '»', element: describe(node), source: sourceOf(node, ['color']) });
    }
  }
  // Nombres, etiquetas y objetivos táctiles (WCAG 4.1.2, 1.3.1, 2.5.8 AA = 24 px; 2.5.5 = 44 px, que se exige en móvil).
  const min = mobile ? 44 : 24;
  // R2 (467): nombre que el campo expone de verdad. Un aria-labelledby cuyas referencias no existen o están vacías no
  // nombra nada (Chromium expone el campo sin nombre); el texto de una etiqueta que envuelve al campo se toma sin el propio
  // campo (si no, las opciones de un <select> parecerían una etiqueta). El placeholder no cuenta como etiqueta.
  const textOf = ids => ids.split(/\s+/).filter(Boolean).map(id => document.getElementById(id)).filter(Boolean).map(n => n.textContent.trim()).join(' ').trim();
  const wrapperText = label => { const copy = label.cloneNode(true); copy.querySelectorAll('input, select, textarea, button').forEach(n => n.remove()); return copy.textContent.trim(); };
  const fieldName = e => {
    const ref = e.getAttribute('aria-labelledby'); if (ref && textOf(ref)) return textOf(ref);
    const aria = (e.getAttribute('aria-label') || '').trim(); if (aria) return aria;
    if (e.id) { const forText = [...document.querySelectorAll('label[for="' + CSS.escape(e.id) + '"]')].map(l => wrapperText(l)).join(' ').trim(); if (forText) return forText; }
    const wrap = e.closest('label'); if (wrap && wrapperText(wrap)) return wrapperText(wrap);
    return (e.getAttribute('title') || '').trim();
  };
  const doc = document.scrollingElement || document.documentElement, pageScrollsSideways = doc.scrollWidth > innerWidth + 1;
  // Un carril que desplaza de lado (overflow-x auto/scroll) permite llegar a lo que se sale de la pantalla; uno que recorta no.
  const reachableLane = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') return true; } return false; };
  for (const e of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], select, input:not([type="hidden"]), textarea')) {
    if (!visible(e)) continue;
    coverage.controls++;
    const tag = e.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (!fieldName(e)) {
        const ref = e.getAttribute('aria-labelledby');
        out.push({ kind: 'label', detail: 'campo sin etiqueta' + (ref ? ' (aria-labelledby apunta a «' + ref + '», que no existe o está vacío)' : ''), element: describe(e), source: null });
      }
    } else if (!accessibleName(e)) out.push({ kind: 'name', detail: 'control sin nombre accesible', element: describe(e) + ' ' + e.outerHTML.slice(0, 120), source: null });
    const r = e.getBoundingClientRect();
    // R2 (467): fuera de la pantalla por la izquierda (no se puede desplazar hasta ahí) o por la derecha sin que la página se
    // desplace, y sin un carril desplazable que permita llegar: el control no se puede alcanzar.
    if ((r.left < -1 || (r.right > innerWidth + 1 && !pageScrollsSideways)) && !reachableLane(e))
      out.push({ kind: 'offscreen', detail: 'control fuera de la pantalla (x ' + Math.round(r.left) + '…' + Math.round(r.right) + ' en ' + innerWidth + ' px) sin carril desplazable «' + ((tag === 'input' || tag === 'select' || tag === 'textarea' ? fieldName(e) : accessibleName(e)).slice(0, 30) || tag) + '»', element: describe(e), source: sourceOf(e, ['left', 'right', 'margin-left', 'transform', 'position', 'width']) });
    const inline = (tag === 'a' && !!e.closest('p, li, small') && getComputedStyle(e).display === 'inline') || (tag === 'button' && !!e.closest('p'));
    const labelledToggle = tag === 'input' && ['checkbox', 'radio'].includes(e.type) && !!e.closest('label');
    // R2 (467): las áreas de texto también son objetivos (antes se contaban como control pero se excluían sin avisar).
    const target = ['button', 'a', 'select', 'textarea'].includes(tag) || e.getAttribute('role') === 'button' || e.getAttribute('role') === 'tab' || (tag === 'input' && !labelledToggle);
    if (target && !inline && (r.width < min || r.height < min))
      out.push({ kind: 'target', min, width: Math.round(r.width), height: Math.round(r.height), detail: 'objetivo ' + Math.round(r.width) + '×' + Math.round(r.height) + ' < ' + min + ' px «' + ((tag === 'input' || tag === 'select' || tag === 'textarea' ? fieldName(e) : accessibleName(e)).slice(0, 30) || tag) + '»', element: describe(e), source: sourceOf(e, r.height < min ? ['min-height', 'height', 'padding', 'padding-block', 'font-size'] : ['min-width', 'width', 'padding', 'padding-inline']) });
  }
  for (const img of document.querySelectorAll('img')) if (visible(img) && !img.hasAttribute('alt')) out.push({ kind: 'img-alt', detail: 'imagen sin alt', element: describe(img), source: null });
  // Un h1 por vista, contando los del árbol de accesibilidad (incluidos .sr-only).
  const exposed = el => !el.closest('[aria-hidden="true"], [hidden]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const h1 = [...document.querySelectorAll('main h1')].filter(exposed).length;
  if (h1 !== 1) out.push({ kind: 'h1', count: h1, detail: 'h1 en main: ' + h1, element: 'main', source: null });
  // Desplazamiento lateral de la página y elementos que se salen sin un contenedor que desplace o recorte.
  if (pageScrollsSideways) {
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect(); if (r.right <= innerWidth + 1) continue;
      let contained = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== 'visible') { contained = true; break; } }
      if (contained) continue;
      if (el.parentElement && el.parentElement.getBoundingClientRect().right > innerWidth + 1 && offenders.length) continue; // el más externo basta
      offenders.push(el);
      if (offenders.length >= 4) break;
    }
    out.push({ kind: 'overflow', scrollWidth: doc.scrollWidth, detail: 'desplazamiento lateral: ' + doc.scrollWidth + ' px > ' + innerWidth + ' px' + (offenders.length ? ' (' + offenders.map(describe).join(', ') + ')' : ''), element: offenders.map(describe).join(', ') || 'documento', source: offenders[0] ? sourceOf(offenders[0], ['width', 'min-width', 'grid-template-columns', 'white-space', 'flex-wrap']) : null });
  }
  return { findings: out, coverage };
}

/**
 * Estado del foco tras pulsar Tab: ¿cambia algo visible al enfocar? Se ejecuta en la página.
 * R2 (467): se compara el estado enfocado con el normal. Antes bastaba con que hubiera contorno o sombra, y una sombra
 * decorativa permanente pasaba por indicador de foco. Ahora se toman las propiedades que suelen señalar el foco (contorno,
 * sombra, borde, fondo, color y subrayado) en el elemento, en su padre (anillos con :focus-within) y en su ::after, se
 * quita el foco, se vuelven a tomar y se devuelve el foco. Es indicador si algo cambia.
 * Alcance: no ve indicadores dibujados con ::before, en otros elementos ni con imágenes; conviene desactivar las
 * transiciones al medir (lo hace run.mjs) para no comparar a mitad de una animación.
 */
export function focusState() {
  const e = document.activeElement;
  if (!e || e === document.body) return { focused: false };
  const own = ['outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'boxShadow', 'borderTopColor', 'borderTopWidth', 'borderBottomColor', 'borderBottomWidth', 'borderLeftColor', 'backgroundColor', 'color', 'textDecorationLine'];
  const take = (el, pseudo, props) => { if (!el) return ''; const s = getComputedStyle(el, pseudo); return props.map(p => s[p]).join('|'); };
  const snapshot = () => ({ self: own.map(p => getComputedStyle(e)[p]), parent: take(e.parentElement, null, ['outlineStyle', 'outlineWidth', 'boxShadow', 'backgroundColor', 'borderTopColor']), after: take(e, '::after', ['content', 'outlineStyle', 'boxShadow', 'backgroundColor', 'borderTopColor', 'opacity']) });
  const focused = snapshot();
  e.blur();
  const normal = snapshot();
  e.focus({ preventScroll: true });
  const changed = own.filter((_, i) => focused.self[i] !== normal.self[i]);
  if (focused.parent !== normal.parent) changed.push('padre');
  if (focused.after !== normal.after) changed.push('::after');
  const name = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || '').trim().slice(0, 30);
  return { focused: true, visible: changed.length > 0, changed, element: e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), name };
}

/** Hoja que desactiva transiciones y animaciones mientras se mide el foco (no cambia colores ni tamaños finales). */
export const NO_MOTION_CSS = '*, *::before, *::after { transition: none !important; animation: none !important; }';

// ── Funciones puras ───────────────────────────────────────────────────────────────────────────────────────

export const SEVERITIES = ['grave', 'media', 'leve'];

/**
 * Gravedad de un hallazgo:
 * - grave: impide usar o entender la vista (sin nombre o etiqueta, contraste < 3:1, foco invisible, desplazamiento lateral, control fuera de la pantalla,
 *   h1 ausente o repetido, vista que no abre);
 * - media: incumple AA sin bloquear (contraste entre 3:1 y el mínimo, objetivo < 24 px);
 * - leve: por debajo de la recomendación móvil de 44 px pero ≥ 24 px.
 */
export function severityOf(finding) {
  switch (finding.kind) {
    case 'name': case 'label': case 'overflow': case 'h1': case 'focus': case 'error': case 'img-alt': case 'offscreen': return 'grave';
    case 'contrast': return finding.ratio < 3 ? 'grave' : 'media';
    case 'target': return Math.min(finding.width, finding.height) < 24 ? 'media' : 'leve';
    default: return 'media';
  }
}

/** Clave que agrupa el mismo problema visto en varias secciones, perfiles o anchuras. */
export function findingKey(finding) {
  const detail = finding.kind === 'overflow' ? 'desplazamiento lateral' : finding.kind === 'h1' ? 'h1 en main: ' + finding.count : finding.detail;
  return [finding.kind, finding.element, detail, finding.source ? finding.source.file + ' ' + finding.source.selector : ''].join(' | ');
}

/**
 * Agrupa los resultados del recorrido ([{ section, profile, width, findings }]) en problemas únicos ordenados por gravedad
 * y por número de vistas afectadas. Cada problema lleva sus contextos (sección · perfil · anchura).
 */
export function aggregate(results) {
  const groups = new Map();
  for (const result of results) for (const finding of result.findings) {
    const key = findingKey(finding);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { key, severity: severityOf(finding), kind: finding.kind, detail: finding.detail, element: finding.element, source: finding.source ?? null, contexts: [], sections: new Set(), profiles: new Set(), widths: new Set() });
    if (SEVERITIES.indexOf(severityOf(finding)) < SEVERITIES.indexOf(group.severity)) group.severity = severityOf(finding);
    group.contexts.push(result.section + ' · ' + result.profile + ' · ' + result.width);
    group.sections.add(result.section); group.profiles.add(result.profile); group.widths.add(result.width);
  }
  return [...groups.values()].map(group => ({ ...group, sections: [...group.sections], profiles: [...group.profiles], widths: [...group.widths].sort((a, b) => b - a), views: group.contexts.length }))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.views - a.views || a.key.localeCompare(b.key));
}

/** Recuento por gravedad y por tipo. */
export function tally(groups) {
  const bySeverity = Object.fromEntries(SEVERITIES.map(s => [s, 0])), byKind = {};
  for (const group of groups) { bySeverity[group.severity]++; byKind[group.kind] = (byKind[group.kind] ?? 0) + 1; }
  return { problems: groups.length, bySeverity, byKind };
}

/** Relación de contraste WCAG entre dos colores opacos { r, g, b } (0–255). Misma fórmula que pageAudit. */
export function contrastRatio(fg, bg) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = c => 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  return (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
}
