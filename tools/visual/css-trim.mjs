// Retira de las hojas GLOBALES las declaraciones que otra declaración global anula SIEMPRE.
//   node tools/visual/css-trim.mjs            → solo informa
//   node tools/visual/css-trim.mjs --write    → reescribe las hojas
//
// Cuándo una declaración V está muerta (se exige para CADA selector de su regla):
//   existe otra declaración K de la misma propiedad cuyo selector es el mismo salvo el prefijo «body » / «html body »
//   (todo elemento pintado está dentro de <html><body>, y aquí no se ponen clases en <html> ni <body>, así que los tres
//   selectores eligen exactamente los mismos elementos), K está fuera de @media/@supports o en el mismo contexto que V, y
//   K gana la cascada: por !important, por prefijo más específico, o a igual prefijo por ir después en el orden de carga.
// No se tocan :root, selectores que mencionan html/body/:root en otro punto, @keyframes ni @font-face.
// No decide por «uso»: no depende de qué pantallas se visiten.
import postcss from 'postcss';
import { readFileSync, writeFileSync } from 'node:fs';

const write = process.argv.includes('--write');
// Orden de carga de main.tsx.
const files = ['styles.css', 'sales.css', 'team.css', 'integrations.css', 'design-system.css', 'planb-ui.css', 'faro.css'].map(name => 'src/' + name);
const context = node => { const parts = []; for (let p = node.parent; p && p.type !== 'root'; p = p.parent) parts.unshift(p.type === 'atrule' ? '@' + p.name + ' ' + p.params.replace(/\s+/g, ' ').trim() : '?'); return parts.join(' > '); };
const inKeyframes = node => { for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes|font-face/.test(p.name)) return true; return false; };
function classify(selector) {
  let core = selector.replace(/\s+/g, ' ').trim(), level = 0;
  const strip = prefix => { if (core.startsWith(prefix) && /^[.#\[a-zA-Z:*]/.test(core.slice(prefix.length))) { core = core.slice(prefix.length); return true; } return false; };
  if (strip('html body ')) level = 2; else if (strip('body ')) level = 1;
  if (/(^|[\s>+~,(])(html|body)(?![-\w])/.test(core) || /:root/.test(core)) return null;
  return { core, level };
}

const roots = files.map(file => postcss.parse(readFileSync(file, 'utf8'), { from: file }));
const decls = []; let order = 0;
roots.forEach((root, fileIndex) => root.walkRules(rule => {
  if (inKeyframes(rule)) return;
  const parts = rule.selectors.map(classify), ctx = context(rule);
  rule.each(node => { if (node.type === 'decl') decls.push({ node, rule, fileIndex, order: order++, parts, ctx, prop: node.prop, important: node.important === true }); });
}));
const killers = new Map();
for (const d of decls) for (const part of d.parts) { if (!part) continue; const key = part.core + ' || ' + d.prop; (killers.get(key) ?? killers.set(key, []).get(key)).push({ d, level: part.level }); }
const wins = (k, kLevel, v, vLevel) => {
  if (k === v || k.rule === v.rule) return false;
  if (k.ctx !== '' && k.ctx !== v.ctx) return false;
  if (k.important !== v.important) return k.important;
  return kLevel > vLevel || (kLevel === vLevel && k.order > v.order);
};
const perFile = files.map(() => ({ total: 0, dead: 0, bytes: 0 }));
const dead = [];
for (const v of decls) {
  perFile[v.fileIndex].total++;
  if (v.fileIndex === files.length - 1) continue; // la capa vigente no se recorta aquí
  if (v.parts.some(part => !part)) continue;
  if (v.parts.every(part => (killers.get(part.core + ' || ' + v.prop) ?? []).some(k => wins(k.d, k.level, v, part.level)))) { dead.push(v); perFile[v.fileIndex].dead++; perFile[v.fileIndex].bytes += v.node.toString().length + 1; }
}
console.log('hoja'.padEnd(26) + 'declaraciones'.padStart(14) + 'anuladas'.padStart(10) + '   %');
files.forEach((file, index) => console.log(file.slice(4).padEnd(26) + String(perFile[index].total).padStart(14) + String(perFile[index].dead).padStart(10) + String(perFile[index].total ? Math.round(perFile[index].dead / perFile[index].total * 100) : 0).padStart(5)));
console.log('TOTAL anuladas: ' + dead.length + ' declaraciones, ' + (perFile.reduce((sum, row) => sum + row.bytes, 0) / 1024).toFixed(1) + ' kB aprox.');
if (write) {
  for (const v of dead) v.node.remove();
  let emptyRules = 0;
  roots.forEach(root => { root.walkRules(rule => { if (!inKeyframes(rule) && !rule.nodes.some(node => node.type === 'decl')) { rule.remove(); emptyRules++; } }); let again = true; while (again) { again = false; root.walkAtRules(at => { if (at.nodes && at.nodes.length === 0) { at.remove(); again = true; } }); } });
  roots.forEach((root, index) => { if (perFile[index].dead) writeFileSync(files[index], root.toString()); });
  console.log('Escrito. Reglas que quedaron vacías y se retiraron: ' + emptyRules);
}
