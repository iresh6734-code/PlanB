// K1 · Detector de CSS sin uso. Solo lee archivos locales (sin red ni servidores).
// Un selector está muerto si alguna de sus clases (fuera de :not/:is/:where…) no aparece en ningún
// archivo de código: ni literal, ni como prefijo o sufijo de una clase compuesta ('tone-' + x, `${base}-on`).
//   node tools/css-unused.mjs          → informe
//   node tools/css-unused.mjs --write  → poda los selectores muertos (y las reglas que se quedan vacías)
//   node tools/css-unused.mjs --dedupe [--write] → declaraciones que otra posterior del mismo selector pisa siempre
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_DIRS = ['src', 'shared', 'server'];
const CODE_FILES = ['index.html', 'plan-b.html'];
// Clases que pone código ajeno o el navegador, no nuestro código.
export const ALLOWED = new Set([]);

function walk(dir, test) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full, test);
    return test(entry.name) ? [full] : [];
  });
}

export function cssFiles() {
  return walk(path.join(ROOT, 'src'), name => name.endsWith('.css')).sort();
}

export function codeCorpus() {
  const files = CODE_DIRS.flatMap(dir => walk(path.join(ROOT, dir), name => /\.(tsx?|mjs|js|html)$/.test(name) && !name.endsWith('.d.ts')))
    .concat(CODE_FILES.map(file => path.join(ROOT, file)).filter(file => fs.existsSync(file)));
  return files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeIsUsed(corpus) {
  const cache = new Map();
  const has = pattern => pattern.test(corpus);
  return cls => {
    if (ALLOWED.has(cls)) return true;
    if (cache.has(cls)) return cache.get(cls);
    let used = has(new RegExp('(?<![\\w-])' + escape(cls) + '(?![\\w-])'));
    const parts = cls.split('-');
    for (let i = 1; !used && i < parts.length; i++) {
      const prefix = parts.slice(0, i).join('-') + '-';
      const suffix = '-' + parts.slice(i).join('-');
      // Prefijo que acaba una cadena o abre una interpolación: 'tone-' + x · `tone-${x}`
      used = has(new RegExp('(?<![\\w-])' + escape(prefix) + '(?:[\'"`]|\\$\\{)'))
        // Sufijo que empieza una cadena o sigue a una interpolación: base + '-on' · `${base}-on`
        || has(new RegExp('(?:[\'"`]|\\})' + escape(suffix) + '(?![\\w-])'));
    }
    cache.set(cls, used);
    return used;
  };
}

// Clases de un selector que deciden si puede coincidir: se quita el contenido de las pseudoclases con paréntesis.
export function decisiveClasses(selector) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  out = out.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"|'[^']*'/g, '');
  return [...out.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(match => match[1]);
}

export function deadSelectors(css, isUsed) {
  const dead = [];
  postcss.parse(css).walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    for (const selector of rule.selectors) {
      const missing = decisiveClasses(selector).filter(cls => !isUsed(cls));
      if (missing.length) dead.push({ selector, missing, rule });
    }
  });
  return dead;
}

export function prune(css, isUsed) {
  const root = postcss.parse(css);
  let removed = 0;
  root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const keep = rule.selectors.filter(selector => decisiveClasses(selector).every(isUsed));
    if (keep.length === rule.selectors.length) return;
    removed += rule.selectors.length - keep.length;
    if (keep.length) rule.selector = keep.join(rule.raws.selector?.raw?.includes(',\n') ? ',\n' : ',');
    else rule.remove();
  });
  let emptied = true;
  while (emptied) {
    emptied = false;
    root.walkAtRules(at => {
      if (at.nodes && at.nodes.length === 0 && !/^(font-face|page)$/i.test(at.name)) { at.remove(); emptied = true; }
    });
  }
  return { css: root.toString(), removed };
}

// Declaraciones pisadas: otra regla con el mismo selector declara la misma propiedad y siempre gana, porque
// · lleva delante `html body ` (más especificidad y coincide con los mismos elementos: ninguna clase va en <html> ni <body>), o
// · tiene la misma especificidad y se carga después (más abajo del archivo, o en una hoja posterior de main.tsx).
// Su contexto (@media…) es el mismo o ninguno. La de abajo nunca llega a aplicarse: quitarla no cambia nada.
// No cuentan las reglas con varios selectores, los duplicados dentro del mismo bloque (reservas a propósito)
// ni los valores que quizá el navegador no entienda (entonces la «perdedora» sí aplicaría).
const RISKY_VALUE = /dvh|svh|lvh|color-mix|-webkit-|-moz-|-ms-|\bfit-content\b|\bstretch\b/i;
const BOOST = 'html body ';
const contextOf = node => {
  const chain = [];
  for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type !== 'atrule') return null;
    chain.unshift('@' + parent.name + ' ' + parent.params.replace(/\s+/g, ' ').trim());
  }
  return chain.join(' > ');
};
const normal = selector => selector.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, '$1').trim();
const propKey = prop => prop.startsWith('--') ? prop : prop.toLowerCase();

// sheets: [{ name, root }] en orden de carga.
export function overriddenDeclarations(sheets) {
  const byBase = new Map();
  sheets.forEach((sheet, sheetIndex) => {
    let ruleIndex = 0;
    sheet.root.walkRules(rule => {
      ruleIndex++;
      const context = contextOf(rule);
      if (context === null || /keyframes/i.test(context) || rule.selectors.length !== 1) return;
      const selector = normal(rule.selector);
      const boosted = selector.startsWith(BOOST);
      const base = boosted ? selector.slice(BOOST.length) : selector;
      const entry = { sheet: sheet.name, rule, context, boosted, order: sheetIndex * 1e6 + ruleIndex };
      byBase.set(base, [...(byBase.get(base) ?? []), entry]);
    });
  });
  const doomed = [];
  for (const entries of byBase.values()) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      const rivals = entries.filter(other => other.rule !== entry.rule
        && (other.context === entry.context || other.context === '')
        && ((other.boosted && !entry.boosted) || (other.boosted === entry.boosted && other.order > entry.order)));
      if (!rivals.length) continue;
      for (const decl of entry.rule.nodes) {
        // Los tokens (--*) de cada capa son contrato propio (design-tokens los comprueba capa a capa): no se tocan.
        if (decl.type !== 'decl' || decl.prop.startsWith('--') || RISKY_VALUE.test(decl.value)) continue;
        const prop = propKey(decl.prop);
        const beaten = rivals.some(other => other.rule.nodes.some(rival => rival.type === 'decl' && propKey(rival.prop) === prop
          && (rival.important || !decl.important) && !RISKY_VALUE.test(rival.value)));
        if (beaten) doomed.push({ sheet: entry.sheet, decl });
      }
    }
  }
  return doomed;
}

function dropEmpty(root) {
  let emptied = true;
  while (emptied) {
    emptied = false;
    root.walk(node => {
      if ((node.type === 'rule' || node.type === 'atrule') && node.nodes && node.nodes.length === 0 && !(node.type === 'atrule' && /^(font-face|page)$/i.test(node.name))) { node.remove(); emptied = true; }
    });
  }
}

// sheets: [{ name, css }] en orden de carga → [{ name, css, removed }]
export function dedupe(sheets) {
  const parsed = sheets.map(sheet => ({ name: sheet.name, root: postcss.parse(sheet.css) }));
  const doomed = overriddenDeclarations(parsed);
  for (const { decl } of doomed) decl.remove();
  return parsed.map(sheet => {
    dropEmpty(sheet.root);
    return { name: sheet.name, css: sheet.root.toString(), removed: doomed.filter(item => item.sheet === sheet.name).length };
  });
}

// Hojas globales en el orden en que main.tsx las importa; el resto se trata hoja a hoja.
export function globalSheets() {
  const main = fs.readFileSync(path.join(ROOT, 'src/main.tsx'), 'utf8');
  return [...main.matchAll(/^import '\.\/([\w-]+\.css)';/gm)].map(match => match[1]);
}

export function sheetGroups() {
  const globals = globalSheets();
  const others = cssFiles().map(file => path.relative(path.join(ROOT, 'src'), file).split(path.sep).join('/')).filter(name => !globals.includes(name));
  return [globals, ...others.map(name => [name])];
}

const read = name => fs.readFileSync(path.join(ROOT, 'src', name), 'utf8');

export function report() {
  const isUsed = makeIsUsed(codeCorpus());
  return cssFiles().map(file => ({
    file: path.relative(path.join(ROOT, 'src'), file).split(path.sep).join('/'),
    dead: deadSelectors(fs.readFileSync(file, 'utf8'), isUsed).map(({ selector, missing }) => ({ selector, missing })),
  })).filter(entry => entry.dead.length);
}

export function overriddenReport() {
  return sheetGroups().flatMap(group => overriddenDeclarations(group.map(name => ({ name, root: postcss.parse(read(name)) })))
    .map(({ sheet, decl }) => ({ sheet, selector: decl.parent.selector, prop: decl.prop })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  const only = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const pick = name => !only.length || only.some(filter => name.includes(filter));
  let total = 0;
  let bytes = 0;
  if (process.argv.includes('--dedupe')) {
    for (const group of sheetGroups()) {
      for (const result of dedupe(group.map(name => ({ name, css: read(name) })))) {
        if (!result.removed || !pick(result.name)) continue;
        const before = read(result.name);
        if (write) fs.writeFileSync(path.join(ROOT, 'src', result.name), result.css);
        bytes += before.length - result.css.length;
        total += result.removed;
        console.log(result.name + ': ' + result.removed + ' declaraciones pisadas, ' + (before.length - result.css.length) + ' B');
      }
    }
    console.log('pisadas ' + total + ' · ' + bytes + ' B' + (write ? ' (escrito)' : ''));
  } else {
    const isUsed = makeIsUsed(codeCorpus());
    for (const file of cssFiles()) {
      const name = path.relative(path.join(ROOT, 'src'), file).split(path.sep).join('/');
      if (!pick(name)) continue;
      const css = fs.readFileSync(file, 'utf8');
      if (write) {
        const result = prune(css, isUsed);
        if (!result.removed) continue;
        fs.writeFileSync(file, result.css);
        bytes += css.length - result.css.length;
        total += result.removed;
        console.log(name + ': ' + result.removed + ' selectores, ' + (css.length - result.css.length) + ' B');
      } else {
        const dead = deadSelectors(css, isUsed);
        if (dead.length) console.log(name + ': ' + dead.length);
        total += dead.length;
      }
    }
    console.log((write ? 'podados ' : 'muertos ') + total + (write ? ' · ' + bytes + ' B' : ''));
  }
}

