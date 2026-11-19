// R4 del super plan 2 · «Pregunta a tu copia». Convierte una frase en español en una consulta sobre la copia local, con reglas
// deterministas y sin IA ni red: «oportunidades abiertas que cierran este mes de más de 5.000 ordenadas por importe».
// Lo que no entiende lo devuelve aparte (`unknown`) y nunca lo convierte en un filtro inventado. Lógica pura: la lectura
// de páginas llega inyectada, igual que en el resto de lecturas por páginas.
import type { AppState, CrmRecord, EntityName, Field, FieldValue } from '../../shared/model.js';
import { compareByField, formatRecordSort, matchesField, recordLabel } from '../../shared/record-order.js';
import { dueDay } from '../task-display.js';
import { stageKind } from './deal-insights.js';
import { readPages, type ListPage } from './pager.js';

type Spec = NonNullable<AppState['spec']>;
type Entity = Spec['entities'][number];

export type AskState = 'open' | 'won' | 'lost' | 'closed' | 'pending' | 'done';
export type AskCondition =
  | { kind: 'option'; field: string; value: string; label: string }
  | { kind: 'range'; field: string; gt?: number; gte?: number; lt?: number; lte?: number; label: string }
  /** Días de Madrid inclusivos (AAAA-MM-DD); null = sin límite por ese lado. */
  | { kind: 'date'; field: string; from: string | null; to: string | null; label: string }
  | { kind: 'empty'; field: string; empty: boolean; label: string }
  | { kind: 'state'; state: AskState; label: string }
  /** Tareas enlazadas al registro por un campo de referencia de las tareas. */
  | { kind: 'tasks'; has: boolean; pendingOnly: boolean; label: string }
  /** Texto en un campo concreto o, sin campo, en cualquier dato del registro y en los nombres que enlaza. */
  | { kind: 'text'; field: string | null; text: string; label: string };

export interface AskQuery {
  entity: EntityName; entityLabel: string;
  conditions: AskCondition[];
  sort: { key: string; dir: 1 | -1; label: string } | null;
  limit: number | null;
  /** Trozos de la frase que no se entendieron, tal como se escribieron. */
  unknown: string[];
  /** Por qué una parte entendida no se puede aplicar a esta copia (p. ej. un campo que no existe). */
  notes: string[];
}

export const ASK_PAGE_SIZE = 100, ASK_MAX_PAGES = 10, ASK_SHOWN = 12;

const norm = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const plural = (a: string, b: string) => a === b || a + 's' === b || a + 'es' === b || b + 's' === a || b + 'es' === a;
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const ENTITY_WORDS: Record<EntityName, string[]> = {
  deals: ['oportunidad', 'oportunidades', 'negocio', 'negocios', 'deal', 'deals', 'venta', 'ventas', 'trato', 'tratos'],
  companies: ['empresa', 'empresas', 'compania', 'companias', 'cuenta', 'cuentas', 'organizacion', 'organizaciones', 'sociedad', 'sociedades'],
  contacts: ['contacto', 'contactos', 'cliente', 'clientes', 'persona', 'personas'],
  tasks: ['tarea', 'tareas', 'seguimiento', 'seguimientos'],
};
const STOP = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'lo', 'que', 'y', 'e', 'con', 'en', 'a', 'al', 'para', 'por', 'mi', 'mis', 'me', 'nos', 'sus', 'su',
  'todas', 'todos', 'toda', 'todo', 'dame', 'damelas', 'damelos', 'muestrame', 'muestra', 'ensename', 'ver', 'veo', 'lista', 'listado', 'cuales', 'cuantas', 'cuantos',
  'o', 'u', 'se', 'llamadas', 'llamados', 'llamada', 'llamado', 'llaman', 'llama', 'hay', 'tengo', 'tenemos', 'quiero', 'busca', 'buscar', 'encuentra', 'un', 'una', 'unos', 'unas', 'son', 'estan', 'esta', 'tiene', 'tienen', 'ya', 'aun', 'todavia', '€', 'euros', 'eur']);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

type Tok = { raw: string; n: string; used: boolean };

/** Campos con significado propio en cada tipo de registro, según la especificación real (si falta, null). */
function roleFields(entityName: EntityName, entity: Entity, spec: Spec) {
  const has = (key: string | undefined) => (key ? entity.fields.find(field => field.key === key) ?? null : null);
  const find = (test: (field: Field) => boolean) => entity.fields.find(test) ?? null;
  const text = (field: Field) => norm(field.key + ' ' + field.label);
  const dates = (field: Field) => field.type === 'date' || field.type === 'datetime';
  const close = find(field => dates(field) && /cierre|close/.test(text(field)));
  const due = entityName === 'tasks' ? has(spec.roles?.dueDate ?? 'due_date') ?? find(field => dates(field) && /venc|due|limite/.test(text(field))) : null;
  const created = find(field => dates(field) && /crea|create|alta/.test(text(field)));
  return {
    amount: (entityName === 'deals' ? has(spec.roles?.amount ?? 'amount') : null) ?? find(field => field.type === 'number'),
    close, due, created,
    date: (entityName === 'deals' ? close : entityName === 'tasks' ? due : null) ?? created ?? find(dates),
    email: find(field => field.type === 'email'),
    phone: find(field => /phone|telefono|movil|\btel\b/.test(text(field))),
    owner: find(field => /owner|propietari|responsab|comercial|gestor/.test(text(field))),
    stage: entityName === 'deals' ? has(spec.roles?.stage ?? 'dealstage') : entityName === 'tasks' ? has(spec.roles?.taskStatus ?? 'status') : null,
    place: find(field => (field.type === 'text' || field.type === 'enum') && /ciudad|city|provincia|localidad|municipio|pais|country|region|state/.test(text(field))),
    name: has(entity.displayField),
    ref: (target: EntityName) => find(field => field.type === 'reference' && field.referenceEntity === target),
  };
}
type Roles = ReturnType<typeof roleFields>;

/** «tarea cerrada» se deduce del nombre de la opción de estado, igual que en la lista de tareas. */
export function taskLooksDone(spec: Spec, record: CrmRecord) {
  const status = spec.entities.find(entity => entity.id === 'tasks')?.fields.find(field => field.key === (spec.roles?.taskStatus ?? 'status'));
  const option = status?.options.find(item => item.id === String(record.values[status.key] ?? ''));
  return !!option && /complet|hech|cerrad|termin|finaliz|done|closed/i.test(option.label + ' ' + option.id);
}
/** Campos de las tareas que apuntan a un tipo de registro (p. ej. `planb_deal_id` para oportunidades). */
export const taskLinks = (spec: Spec, target: EntityName) => (spec.entities.find(entity => entity.id === 'tasks')?.fields ?? []).filter(field => field.type === 'reference' && field.referenceEntity === target);

const addDays = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
const monthStart = (year: number, month: number) => new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
const weekday = (day: string) => (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;

/** Número escrito en español: 5000, 5.000, 5,5, 5k, 5 mil, 2 millones. Devuelve también cuántas palabras ocupa (y el «€»). */
function readNumber(toks: Tok[], index: number): { value: number; len: number } | null {
  const tok = toks[index];
  if (!tok || tok.used) return null;
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(k)?$/.exec(tok.n);
  if (!match) return null;
  let value = Number(/^\d{1,3}(\.\d{3})+$/.test(match[1]) ? match[1].replace(/\./g, '') : match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  let len = 1;
  if (match[2]) value *= 1000;
  else if (toks[index + 1]?.n === 'mil') { value *= 1000; len++; }
  else if (/^millon(es)?$/.test(toks[index + 1]?.n ?? '')) { value *= 1_000_000; len++; }
  if (/^(€|eur|euros)$/.test(toks[index + len]?.n ?? '')) len++;
  return { value, len };
}
/** 5000 → «5.000», 1234,5 → «1.234,5» (es-ES no agrupa los números de cuatro cifras). */
const money = (value: number) => { const [int, dec] = String(Math.round(value * 100) / 100).split('.'); return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : ''); };

export function parseAsk(text: string, spec: Spec, today: string): AskQuery | null {
  const quoted: string[] = [];
  const cleaned = text.slice(0, 300).replace(/[«"“]([^»"”]{1,80})[»"”]/g, (_, inner: string) => { quoted.push(inner.trim()); return ' '; });
  const toks: Tok[] = cleaned.replace(/(?<!\d),|,(?!\d)/g, ' ').replace(/[¿?¡!;:()]/g, ' ').replace(/(>=|<=|[<>€])/g, ' $1 ').split(/\s+/).filter(Boolean).map(raw => ({ raw, n: norm(raw), used: false }));
  if (!toks.length) return null;

  // 1. Tipo de registro: la primera palabra que lo nombra (también el nombre que le da la especificación).
  let entityName: EntityName | null = null;
  for (const tok of toks) {
    const hit = (Object.keys(ENTITY_WORDS) as EntityName[]).find(name => ENTITY_WORDS[name].includes(tok.n)
      || spec.entities.some(entity => entity.id === name && (plural(norm(entity.label), tok.n) || plural(norm(entity.singular), tok.n))));
    if (hit && spec.entities.some(entity => entity.id === hit)) { entityName = hit; tok.used = true; break; }
  }
  if (!entityName) return null;
  const entity = spec.entities.find(item => item.id === entityName)!;
  const roles = roleFields(entityName, entity, spec);
  const conditions: AskCondition[] = [], notes: string[] = [];
  let sort: AskQuery['sort'] = null, limit: number | null = null;

  const free = (i: number) => !!toks[i] && !toks[i].used;
  /** ¿Empiezan en `i` estas palabras (cada una «a|b|c»)? Devuelve cuántas ocupa o 0. */
  const seq = (i: number, ...words: string[]) => words.every((word, k) => free(i + k) && word.split('|').includes(toks[i + k].n)) ? words.length : 0;
  const use = (i: number, len: number) => { for (let k = i; k < i + len && k < toks.length; k++) toks[k].used = true; };
  const fieldLabel = (field: Field) => lower(field.label);
  /** Un campo nombrado a partir de `i`: frases fijas, sinónimos y, si no, el nombre del campo (hasta 4 palabras). */
  const fieldAt = (i: number): { field: Field; len: number } | null => {
    const fixed: [string[], Field | null][] = [
      [['fecha', 'de', 'cierre'], roles.close], [['fecha', 'limite'], roles.due], [['fecha', 'de', 'vencimiento'], roles.due], [['fecha', 'de', 'alta'], roles.created], [['fecha', 'de', 'creacion'], roles.created],
    ];
    for (const [words, field] of fixed) if (field && seq(i, ...words)) return { field, len: words.length };
    for (let len = Math.min(4, toks.length - i); len >= 1; len--) {
      const words = toks.slice(i, i + len);
      if (words.some(tok => tok.used)) continue;
      const hit = entity.fields.find(field => { const label = norm(field.label).split(/\s+/); return label.length === len && label.every((word, k) => plural(word, words[k].n)); });
      if (hit) return { field: hit, len };
    }
    const word = toks[i]?.n ?? '';
    if (!free(i)) return null;
    const synonym: [RegExp, Field | null][] = [
      [/^(importes?|valor(es)?|cantidad(es)?|precios?|cuantias?|dinero)$/, roles.amount], [/^(correos?|e-?mails?|mails?)$/, roles.email], [/^(telefonos?|moviles?|tlf|tel)$/, roles.phone],
      [/^cierres?$/, roles.close], [/^(vencimientos?|limites?)$/, roles.due], [/^(altas?|creacion)$/, roles.created], [/^fechas?$/, roles.date],
      [/^(empresas?|companias?|cuentas?)$/, roles.ref('companies')], [/^(contactos?|clientes?|personas?)$/, roles.ref('contacts')], [/^(oportunidad(es)?|negocios?)$/, roles.ref('deals')],
      [/^(responsables?|propietarios?|duenos?|comercial(es)?|owners?|gestor(es)?)$/, roles.owner], [/^(etapas?|fases?|estados?)$/, roles.stage], [/^nombres?$/, roles.name],
      [/^(ciudad(es)?|provincias?|localidad(es)?|pais(es)?|zonas?)$/, roles.place],
    ];
    for (const [re, field] of synonym) if (re.test(word)) return field ? { field, len: 1 } : null;
    return null;
  };
  const missing = (what: string) => notes.push('Tus ' + lower(entity.label) + ' no tienen ' + what + '.');

  // 2. Cuántos: «las 5 mayores», «top 10», «las 3 primeras».
  for (let i = 0; i < toks.length; i++) {
    const top = seq(i, 'top') && readNumber(toks, i + 1);
    if (top) { limit = Math.min(100, Math.max(1, Math.round(top.value))); use(i, 1 + top.len); continue; }
    const article = seq(i, 'las|los') ? 1 : 0, count = readNumber(toks, i + article);
    if (!count || count.value > 100 || !Number.isInteger(count.value)) continue;
    let after = i + article + count.len;
    // «las 5 oportunidades más grandes»: el nombre del tipo puede ir en medio.
    if (toks[after]?.used && ENTITY_WORDS[entityName].includes(toks[after].n)) after++;
    const kind = seq(after, 'mas', 'grandes|altas|altos|caras|caros|importantes') ? 2 : seq(after, 'mayores|primeras|primeros|menores|ultimas|ultimos|recientes') ? 1 : 0;
    if (!kind) continue;
    limit = count.value;
    const word = toks[after].n, big = kind === 2 || word === 'mayores', small = word === 'menores';
    if ((big || small) && roles.amount && !sort) sort = { key: roles.amount.key, dir: big ? -1 : 1, label: fieldLabel(roles.amount) + (big ? ' ↓' : ' ↑') };
    if (/^(ultim|recient)/.test(word) && roles.created && !sort) sort = { key: roles.created.key, dir: -1, label: fieldLabel(roles.created) + ' ↓' };
    use(i, after - i + kind);
  }

  // 3. Orden: «ordenadas por importe de mayor a menor», «por fecha de cierre», «de mayor a menor importe».
  for (let i = 0; i < toks.length && !sort; i++) {
    const head = seq(i, 'ordenadas|ordenados|ordenada|ordenado|ordenar|ordena|orden|clasificadas|clasificados', 'por') || seq(i, 'por');
    if (!head) continue;
    const target = fieldAt(i + head);
    if (!target) { if (head === 2) { notes.push('No encuentro el campo por el que ordenar.'); use(i, head); } continue; }
    const end = i + head + target.len;
    let dir: 1 | -1 = target.field.type === 'number' ? -1 : 1;
    const way = seq(end, 'de', 'mayor', 'a', 'menor') || seq(end, 'de', 'mas', 'a', 'menos') ? -1 : seq(end, 'de', 'menor', 'a', 'mayor') || seq(end, 'de', 'menos', 'a', 'mas') ? 1
      : seq(end, 'descendente|desc') ? -2 : seq(end, 'ascendente|asc') ? 2 : 0;
    if (way) { dir = way < 0 ? -1 : 1; use(end, Math.abs(way) === 2 ? 1 : 4); }
    sort = { key: target.field.key, dir, label: fieldLabel(target.field) + (dir === 1 ? ' ↑' : ' ↓') };
    use(i, head + target.len);
  }

  // 4. Importes: «más de 5.000», «> 5000», «entre 1.000 y 3.000», «con importe inferior a 2k».
  const comparators: [string[], 'gt' | 'gte' | 'lt' | 'lte'][] = [
    [['mas', 'de'], 'gt'], [['mas', 'que'], 'gt'], [['mayor|mayores', 'de|que'], 'gt'], [['superior|superiores', 'a'], 'gt'], [['por', 'encima', 'de'], 'gt'], [['>'], 'gt'],
    [['>='], 'gte'], [['al', 'menos'], 'gte'], [['como', 'minimo'], 'gte'], [['a', 'partir', 'de'], 'gte'], [['desde'], 'gte'], [['minimo'], 'gte'],
    [['menos', 'de'], 'lt'], [['menos', 'que'], 'lt'], [['menor|menores', 'de|que'], 'lt'], [['inferior|inferiores', 'a'], 'lt'], [['por', 'debajo', 'de'], 'lt'], [['<'], 'lt'],
    [['<='], 'lte'], [['como', 'maximo'], 'lte'], [['hasta'], 'lte'], [['maximo'], 'lte'],
  ];
  const notAmount = (i: number) => /^(dias?|semanas?|mes|meses|anos?|horas?)$/.test(toks[i]?.n ?? '') || (toks[i]?.n === 'de' && MONTHS.includes(toks[i + 1]?.n ?? ''));
  /** Campo nombrado justo antes (p. ej. «con importe superior a»); si no, el importe. */
  const amountBefore = (i: number) => {
    for (let back = 1; back <= 3; back++) { const hit = i - back >= 0 ? fieldAt(i - back) : null; if (hit && hit.len === back && hit.field.type === 'number') return { field: hit.field, from: i - back }; }
    if (i > 0 && /^(valen|cuestan|facturan|suman)$/.test(toks[i - 1].n) && free(i - 1) && roles.amount) return { field: roles.amount, from: i - 1 };
    return roles.amount ? { field: roles.amount, from: i } : null;
  };
  for (let i = 0; i < toks.length; i++) {
    const between = seq(i, 'entre') && readNumber(toks, i + 1);
    if (between) {
      const and = i + 1 + between.len, upper = seq(and, 'y') && readNumber(toks, and + 1);
      if (upper && !notAmount(and + 1 + upper.len)) {
        const target = amountBefore(i);
        if (!target) { missing('importe'); use(i, and + 1 + upper.len - i); continue; }
        const [low, high] = between.value <= upper.value ? [between.value, upper.value] : [upper.value, between.value];
        conditions.push({ kind: 'range', field: target.field.key, gte: low, lte: high, label: fieldLabel(target.field) + ' entre ' + money(low) + ' y ' + money(high) });
        use(target.from, and + 1 + upper.len - target.from); continue;
      }
    }
    // «5.000 o más», «2k o menos»: el número delante y el sentido detrás.
    const lone = readNumber(toks, i), tail = lone ? seq(i + lone.len, 'o', 'mas') ? 'gte' : seq(i + lone.len, 'o', 'menos') ? 'lte' : null : null;
    if (lone && tail) {
      const target = amountBefore(i);
      if (!target) { missing('importe'); use(i, lone.len + 2); continue; }
      conditions.push({ kind: 'range', field: target.field.key, [tail]: lone.value, label: fieldLabel(target.field) + (tail === 'gte' ? ' ≥ ' : ' ≤ ') + money(lone.value) } as AskCondition);
      use(target.from, i + lone.len + 2 - target.from); continue;
    }
    for (const [words, op] of comparators) {
      const len = seq(i, ...words); if (!len) continue;
      const number = readNumber(toks, i + len);
      if (!number || notAmount(i + len + number.len)) continue;
      const target = amountBefore(i);
      if (!target) { missing('importe'); use(i, len + number.len); break; }
      const sign = { gt: '>', gte: '≥', lt: '<', lte: '≤' }[op];
      conditions.push({ kind: 'range', field: target.field.key, [op]: number.value, label: fieldLabel(target.field) + ' ' + sign + ' ' + money(number.value) } as AskCondition);
      use(target.from, i + len + number.len - target.from); break;
    }
  }

  // 5. Estados: abiertas, ganadas, perdidas, pendientes, hechas, vencidas.
  const stateWords: [RegExp, AskState, EntityName[]][] = [
    [/^(abiert[ao]s?|activ[ao]s?|viv[ao]s?)$/, 'open', ['deals']], [/^(ganad[ao]s?|firmad[ao]s?)$/, 'won', ['deals']], [/^(perdid[ao]s?|descartad[ao]s?)$/, 'lost', ['deals']],
    [/^(cerrad[ao]s?)$/, 'closed', ['deals']], [/^(pendientes?|abiert[ao]s?)$/, 'pending', ['tasks']], [/^(hech[ao]s?|completad[ao]s?|terminad[ao]s?|cerrad[ao]s?|finalizad[ao]s?)$/, 'done', ['tasks']],
  ];
  for (let i = 0; i < toks.length; i++) {
    if (!free(i)) continue;
    if (seq(i, 'en', 'curso') && entityName === 'deals') { conditions.push({ kind: 'state', state: 'open', label: 'abiertas' }); use(i, 2); continue; }
    if ((seq(i, 'sin', 'hacer') || seq(i, 'por', 'hacer') || seq(i, 'sin', 'cerrar')) && entityName === 'tasks') { conditions.push({ kind: 'state', state: 'pending', label: 'pendientes' }); use(i, 2); continue; }
    if (/^(vencid[ao]s?|atrasad[ao]s?|retrasad[ao]s?|caducad[ao]s?)$/.test(toks[i].n)) {
      const field = entityName === 'tasks' ? roles.due : entityName === 'deals' ? roles.close : null;
      use(i, 1);
      if (!field) { missing(entityName === 'deals' || entityName === 'tasks' ? 'fecha' : 'fecha límite'); continue; }
      conditions.push({ kind: 'state', state: entityName === 'tasks' ? 'pending' : 'open', label: entityName === 'tasks' ? 'sin cerrar' : 'abiertas' });
      conditions.push({ kind: 'date', field: field.key, from: null, to: addDays(today, -1), label: fieldLabel(field) + ' pasada' });
      continue;
    }
    const hit = stateWords.find(([re, , kinds]) => re.test(toks[i].n) && kinds.includes(entityName!));
    if (!hit) continue;
    if ((hit[1] === 'open' || hit[1] === 'closed' || hit[1] === 'won' || hit[1] === 'lost') && !roles.stage) { missing('etapa'); use(i, 1); continue; }
    if ((hit[1] === 'pending' || hit[1] === 'done') && !roles.stage) { missing('estado'); use(i, 1); continue; }
    const labels: Record<AskState, string> = { open: 'abiertas', won: 'ganadas', lost: 'perdidas', closed: 'cerradas', pending: 'pendientes', done: 'hechas' };
    conditions.push({ kind: 'state', state: hit[1], label: labels[hit[1]] });
    use(i, 1);
  }

  // 6. Fechas: «que cierran este mes», «para mañana», «creadas esta semana», «en diciembre», «en los próximos 7 días».
  const periodAt = (i: number): { from: string | null; to: string | null; label: string; len: number } | null => {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1, monday = addDays(today, -weekday(today));
    let len: number;
    if ((len = seq(i, 'hoy'))) return { from: today, to: today, label: 'hoy', len };
    if ((len = seq(i, 'manana') || seq(i, 'pasado', 'manana'))) { const d = addDays(today, len === 1 ? 1 : 2); return { from: d, to: d, label: len === 1 ? 'mañana' : 'pasado mañana', len }; }
    if ((len = seq(i, 'ayer'))) { const d = addDays(today, -1); return { from: d, to: d, label: 'ayer', len }; }
    if ((len = seq(i, 'esta', 'semana'))) return { from: monday, to: addDays(monday, 6), label: 'esta semana', len };
    if ((len = seq(i, 'la', 'semana', 'que', 'viene') || seq(i, 'semana', 'que', 'viene') || seq(i, 'la', 'proxima', 'semana') || seq(i, 'proxima', 'semana'))) return { from: addDays(monday, 7), to: addDays(monday, 13), label: 'la semana que viene', len };
    if ((len = seq(i, 'la', 'semana', 'pasada') || seq(i, 'semana', 'pasada'))) return { from: addDays(monday, -7), to: addDays(monday, -1), label: 'la semana pasada', len };
    if ((len = seq(i, 'este', 'mes'))) return { from: monthStart(y, m), to: monthEnd(y, m), label: 'este mes', len };
    if ((len = seq(i, 'el', 'mes', 'que', 'viene') || seq(i, 'mes', 'que', 'viene') || seq(i, 'el', 'proximo', 'mes') || seq(i, 'proximo', 'mes'))) return { from: monthStart(y, m + 1), to: monthEnd(y, m + 1), label: 'el mes que viene', len };
    if ((len = seq(i, 'el', 'mes', 'pasado') || seq(i, 'mes', 'pasado'))) return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1), label: 'el mes pasado', len };
    if ((len = seq(i, 'este', 'trimestre'))) { const q = Math.floor(m / 3) * 3; return { from: monthStart(y, q), to: monthEnd(y, q + 2), label: 'este trimestre', len }; }
    if ((len = seq(i, 'este', 'ano'))) return { from: y + '-01-01', to: y + '-12-31', label: 'este año', len };
    if ((len = seq(i, 'antes', 'de', 'hoy'))) return { from: null, to: addDays(today, -1), label: 'antes de hoy', len };
    if ((len = seq(i, 'desde', 'hoy') || seq(i, 'a', 'partir', 'de', 'hoy'))) return { from: today, to: null, label: 'desde hoy', len };
    if ((len = seq(i, 'pasada|pasado|pasadas|pasados'))) return { from: null, to: addDays(today, -1), label: 'ya pasada', len };
    const next = seq(i, 'en', 'los', 'proximos') || seq(i, 'los', 'proximos') || seq(i, 'proximos');
    const nextN = next ? readNumber(toks, i + next) : null;
    if (nextN && seq(i + next + nextN.len, 'dias')) return { from: today, to: addDays(today, Math.round(nextN.value)), label: 'en los próximos ' + nextN.value + ' días', len: next + nextN.len + 1 };
    const last = seq(i, 'en', 'los', 'ultimos') || seq(i, 'los', 'ultimos') || seq(i, 'ultimos');
    const lastN = last ? readNumber(toks, i + last) : null;
    if (lastN && seq(i + last + lastN.len, 'dias')) return { from: addDays(today, -Math.round(lastN.value)), to: today, label: 'en los últimos ' + lastN.value + ' días', len: last + lastN.len + 1 };
    const month = free(i) ? MONTHS.indexOf(toks[i].n === 'setiembre' ? 'septiembre' : toks[i].n) : -1;
    if (month >= 0) {
      const year = seq(i + 1, 'de') && /^\d{4}$/.test(toks[i + 2]?.n ?? '') ? Number(toks[i + 2].n) : null;
      // Sin año, un mes ya terminado se entiende como el del año que viene («cierran en enero», dicho en noviembre).
      const resolved = year ?? (monthEnd(y, month) < today ? y + 1 : y);
      return { from: monthStart(resolved, month), to: monthEnd(resolved, month), label: 'en ' + MONTHS[month] + (year || resolved !== y ? ' de ' + resolved : ''), len: year ? 3 : 1 };
    }
    return null;
  };
  const dateVerb = (i: number): { field: Field | null; len: number; what: string } | null => {
    let len: number;
    if ((len = seq(i, 'que', 'cierran|cierra|cierren|cierre') || seq(i, 'con', 'cierre|fecha') || seq(i, 'cierran|cierra|cierre|cierren|cerrar'))) return { field: roles.close, len, what: 'fecha de cierre' };
    if ((len = seq(i, 'que', 'vencen|vence|venzan|venza') || seq(i, 'con', 'vencimiento') || seq(i, 'vencen|vence|vencimiento|venzan'))) return { field: roles.due ?? roles.close, len, what: 'fecha límite' };
    if ((len = seq(i, 'creadas|creados|creada|creado|anadidas|anadidos|nuevas|nuevos') || seq(i, 'dadas|dados', 'de', 'alta'))) return { field: roles.created, len, what: 'fecha de alta' };
    if ((len = seq(i, 'para') )) return entityName === 'tasks' ? { field: roles.due, len, what: 'fecha límite' } : null;
    return null;
  };
  for (let i = 0; i < toks.length; i++) {
    if (!free(i)) continue;
    const verb = dateVerb(i);
    let at = i + (verb?.len ?? 0);
    const prep = seq(at, 'en|el|la|durante|de');
    let period = periodAt(at);
    if (!period && prep) { period = periodAt(at + prep); if (period) at += prep; }
    if (!period) continue;
    const field = verb ? verb.field : roles.date;
    use(i, at - i + period.len);
    if (!field) { missing(verb?.what ?? 'ninguna fecha'); continue; }
    conditions.push({ kind: 'date', field: field.key, from: period.from, to: period.to, label: fieldLabel(field) + ': ' + period.label });
    // «Cierre pasado» es lo mismo que la vista inteligente: abiertas que ya debían haberse cerrado (una ganada no está atrasada).
    if (entityName === 'deals' && field === roles.close && period.from === null && period.to! < today && roles.stage && !conditions.some(condition => condition.kind === 'state'))
      conditions.push({ kind: 'state', state: 'open', label: 'abiertas' });
  }

  // 7. «sin X» / «con X» / «que no tienen X»: campos vacíos o rellenos y tareas enlazadas.
  for (let i = 0; i < toks.length; i++) {
    const neg = seq(i, 'sin') || seq(i, 'que', 'no', 'tienen|tengan|tiene') || seq(i, 'no', 'tienen|tiene');
    const pos = neg ? 0 : seq(i, 'con') || seq(i, 'que', 'tienen|tengan|tiene');
    const head = neg || pos;
    if (!head) continue;
    const at = i + head + seq(i + head, 'un|una|el|la|los|las|ningun|ninguna');
    const tasksWord = seq(at, 'tareas|tarea|seguimiento|seguimientos|actividad|actividades') || seq(at, 'proximo', 'paso') || seq(at, 'proximos', 'pasos');
    if (tasksWord && entityName !== 'tasks') {
      const pendingWord = seq(at + tasksWord, 'pendientes|pendiente|abiertas'), pendingOnly = !!pendingWord || toks[at].n.startsWith('proximo');
      use(i, at - i + tasksWord + pendingWord);
      if (!taskLinks(spec, entityName).length) { notes.push('Las tareas de tu copia no se enlazan con ' + lower(entity.label) + '.'); continue; }
      const what = pendingOnly ? (toks[at].n.startsWith('proximo') ? 'próximo paso' : 'tareas pendientes') : 'tareas';
      conditions.push({ kind: 'tasks', has: !neg, pendingOnly, label: (neg ? 'sin ' : 'con ') + what });
      continue;
    }
    const target = fieldAt(at);
    if (!target) continue;
    // «con prioridad alta» es una opción de la lista, no «con prioridad rellena»: lo resuelve el paso de opciones.
    const next = toks[at + target.len];
    if (next && !next.used && target.field.options.some(option => plural(norm(option.label).split(/\s+/)[0] ?? '', next.n))) continue;
    use(i, at - i + target.len);
    conditions.push({ kind: 'empty', field: target.field.key, empty: !!neg, label: (neg ? 'sin ' : 'con ') + fieldLabel(target.field) });
  }

  // 8. Opciones de listas (etapa, estado, sector…) por su nombre: «en negociación», «del sector Industria».
  const optionFields = entity.fields.filter(field => (field.type === 'enum' || field.type === 'multiselect') && field.options.length);
  for (let i = 0; i < toks.length; i++) {
    if (!free(i)) continue;
    let best: { field: Field; value: string; label: string; len: number } | null = null;
    for (const field of optionFields) for (const option of field.options) {
      const words = norm(option.label).split(/\s+/).filter(Boolean);
      if (!words.length || (words.length === 1 && (words[0].length < 3 || STOP.has(words[0])))) continue;
      if (words.every((word, k) => free(i + k) && plural(word, toks[i + k].n)) && (!best || words.length > best.len)) best = { field, value: option.id, label: option.label, len: words.length };
    }
    if (!best) continue;
    let from = i;
    // El nombre del campo delante («prioridad alta», «sector Industria») forma parte de la condición.
    for (let back = 1; back <= 3 && from === i; back++) { const named = i - back >= 0 ? fieldAt(i - back) : null; if (named && named.len === back && named.field.key === best.field.key) from = i - back; }
    for (const lead of [['en', 'la', 'etapa|fase'], ['en', 'etapa|fase|estado'], ['etapa|fase|estado'], ['en|de|del|con']]) {
      if (from - lead.length >= 0 && seq(from - lead.length, ...lead)) { from -= lead.length; break; }
    }
    use(from, i - from + best.len);
    conditions.push({ kind: 'option', field: best.field.key, value: best.value, label: fieldLabel(best.field) + ': ' + best.label });
  }

  // 9. Texto: lo entrecomillado y los nombres propios tras «de», «en», «llamadas»… («empresas de Madrid», «oportunidades de Acme»).
  for (const value of quoted) if (value) conditions.push({ kind: 'text', field: null, text: value, label: '«' + value + '»' });
  for (let i = 0; i < toks.length; i++) {
    const lead = seq(i, 'que', 'se', 'llaman|llama') || seq(i, 'llamadas|llamados|llamada|llamado') || seq(i, 'de|del|en|para|con');
    if (!lead) continue;
    let end = i + lead;
    while (free(end) && /^[A-ZÁÉÍÓÚÑ0-9]/.test(toks[end].raw) && !STOP.has(toks[end].n) && !readNumber(toks, end)) end++;
    if (end === i + lead) continue;
    const value = toks.slice(i + lead, end).map(tok => tok.raw).join(' ');
    const place = lead === 1 && toks[i].n !== 'para' && toks[i].n !== 'con' ? roles.place : null;
    conditions.push(place ? { kind: 'text', field: place.key, text: value, label: fieldLabel(place) + ': ' + value } : { kind: 'text', field: null, text: value, label: '«' + value + '»' });
    use(i, end - i);
  }

  // 10. Lo que queda sin entender (sin las palabras de relleno), en trozos tal como se escribieron.
  const unknown: string[] = [];
  let run: string[] = [];
  for (const tok of toks) {
    if (!tok.used && !STOP.has(tok.n)) run.push(tok.raw);
    else if (run.length) { unknown.push(run.join(' ')); run = []; }
  }
  if (run.length) unknown.push(run.join(' '));
  return { entity: entityName, entityLabel: entity.label, conditions, sort, limit, unknown, notes };
}

/** Solo se responde como pregunta si se entendió algo más que el tipo de registro («empresas» a secas es «Ir a Empresas»). */
export const isQuestion = (query: AskQuery | null): query is AskQuery => !!query && (query.conditions.length > 0 || !!query.sort || query.limit !== null || query.notes.length > 0);

/** «Oportunidades · abiertas · cierre: este mes · importe > 5.000 · orden importe ↓ · las 5 primeras». */
export function describeAsk(query: AskQuery) {
  return [query.entityLabel, ...query.conditions.map(condition => condition.label), ...(query.sort ? ['orden ' + query.sort.label] : []), ...(query.limit ? ['las ' + query.limit + ' primeras'] : [])].join(' · ');
}

/** Lo que el servidor ya puede filtrar (V1): una opción por campo, el primer texto libre y el orden. El resto se filtra al leer. */
export function askServerView(query: AskQuery) {
  const options = query.conditions.filter((condition): condition is Extract<AskCondition, { kind: 'option' }> => condition.kind === 'option');
  const filters: Record<string, string> = {};
  for (const option of options) if (options.filter(other => other.field === option.field).length === 1 && Object.keys(filters).length < 8) filters[option.field] = option.value;
  const text = query.conditions.find((condition): condition is Extract<AskCondition, { kind: 'text' }> => condition.kind === 'text' && condition.field === null);
  return { q: text?.text.slice(0, 200) ?? '', filters, sort: formatRecordSort(query.sort) };
}

export function askPath(query: AskQuery, offset: number, limit = ASK_PAGE_SIZE) {
  const view = askServerView(query);
  return '/v2/records/' + query.entity + '?q=' + encodeURIComponent(view.q) + '&offset=' + offset + '&limit=' + limit + '&pipeline='
    + (view.sort ? '&sort=' + encodeURIComponent(view.sort) : '') + Object.entries(view.filters).map(([key, value]) => '&f.' + encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('');
}

export interface AskContext {
  today: string; spec: Spec;
  /** Nombre de un registro enlazado, para buscar texto también en lo que enlaza (como la búsqueda del servidor). */
  nameOf: (entity: EntityName, id: string) => string | undefined;
  /** Registros del tipo preguntado con tareas (o con tareas pendientes) enlazadas; solo si la pregunta las menciona. */
  withTasks?: Set<string> | null;
}

function stateMatches(record: CrmRecord, state: AskState, entityName: EntityName, spec: Spec) {
  if (entityName === 'tasks') return (state === 'done') === taskLooksDone(spec, record);
  const stageKey = spec.roles?.stage ?? 'dealstage', id = String(record.values[stageKey] ?? '');
  const stage = spec.stages.find(item => item.id === id) ?? spec.entities.find(item => item.id === entityName)?.fields.find(field => field.key === stageKey)?.options.find(item => item.id === id);
  const kind = stageKind(stage);
  return state === 'closed' ? kind !== 'open' : kind === state;
}

const emptyValue = (value: FieldValue | undefined) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export function askMatches(record: CrmRecord, query: AskQuery, context: AskContext): boolean {
  const entity = context.spec.entities.find(item => item.id === query.entity);
  if (!entity || record.entity !== query.entity) return false;
  const fieldOf = (key: string) => entity.fields.find(field => field.key === key);
  const options = new Map<string, string[]>();
  for (const condition of query.conditions) if (condition.kind === 'option') options.set(condition.field, [...(options.get(condition.field) ?? []), condition.value]);
  for (const [key, values] of options) { const field = fieldOf(key); if (!field || !values.some(value => matchesField(record, field, value))) return false; }
  // Varios estados se suman («ganadas o perdidas»): basta con cumplir uno.
  const states = query.conditions.filter((condition): condition is Extract<AskCondition, { kind: 'state' }> => condition.kind === 'state');
  if (states.length && !states.some(condition => stateMatches(record, condition.state, query.entity, context.spec))) return false;
  for (const condition of query.conditions) {
    const value = 'field' in condition && condition.field ? record.values[condition.field] : undefined;
    switch (condition.kind) {
      case 'option': break;
      case 'range': {
        if (emptyValue(value)) return false;
        const n = Number(value);
        if (!Number.isFinite(n)) return false;
        if ((condition.gt !== undefined && !(n > condition.gt)) || (condition.gte !== undefined && !(n >= condition.gte))
          || (condition.lt !== undefined && !(n < condition.lt)) || (condition.lte !== undefined && !(n <= condition.lte))) return false;
        break;
      }
      case 'date': {
        const day = dueDay(value);
        if (!day || (condition.from && day < condition.from) || (condition.to && day > condition.to)) return false;
        break;
      }
      case 'empty': if (emptyValue(value) !== condition.empty) return false; break;
      case 'state': break;
      case 'tasks': if (context.withTasks && context.withTasks.has(record.id) !== condition.has) return false; break;
      case 'text': {
        const needle = norm(condition.text);
        const haystack = condition.field ? String(value ?? '')
          : Object.values(record.values).join(' ') + ' ' + entity.fields.filter(field => field.type === 'reference' && field.referenceEntity).map(field => context.nameOf(field.referenceEntity!, String(record.values[field.key] ?? '')) ?? '').join(' ');
        if (!norm(haystack).includes(needle)) return false;
        break;
      }
    }
  }
  return true;
}

export interface AskAnswer {
  query: AskQuery;
  /** Coincidencias en orden (como mucho `limit` si la pregunta lo pide). */ records: CrmRecord[];
  /** Coincidencias antes de aplicar el «las N primeras». */ matched: number;
  /** Registros leídos y los que el servidor dice que hay tras su filtro. */ scanned: number; available: number;
  /** Se leyó todo lo necesario (también las tareas, si hacían falta). */ complete: boolean;
  nameOf: (entity: EntityName, id: string) => string | undefined;
}
export type AskReader = (path: string, signal: AbortSignal) => Promise<ListPage>;

/** Cuántas de las coincidencias caben en la paleta (ASK_SHOWN) y por qué no salen todas. */
export function shownNote(answer: Pick<AskAnswer, 'matched' | 'records'>, limited: boolean) {
  const shown = Math.min(answer.records.length, ASK_SHOWN);
  if (shown >= answer.matched) return '';
  return limited && shown === answer.records.length ? ', se muestran las ' + shown + ' primeras' : ', se muestran ' + shown + '; afina la pregunta para ver el resto';
}

/** Lee la copia por páginas con el filtro del servidor y aplica el resto de condiciones. Solo lectura. */
export async function runAsk(query: AskQuery, spec: Spec, today: string, read: AskReader, signal: AbortSignal): Promise<AskAnswer> {
  const main = await readPages((offset, limit, pageSignal) => read(askPath(query, offset, limit), pageSignal), signal, { pageSize: ASK_PAGE_SIZE, maxPages: ASK_MAX_PAGES, accept: record => record.entity === query.entity });
  let withTasks: Set<string> | null = null, tasksComplete = true;
  const tasks = query.conditions.find((condition): condition is Extract<AskCondition, { kind: 'tasks' }> => condition.kind === 'tasks');
  if (tasks) {
    const links = taskLinks(spec, query.entity);
    const read2 = await readPages((offset, limit, pageSignal) => read('/v2/records/tasks?q=&offset=' + offset + '&limit=' + limit + '&pipeline=', pageSignal), signal, { pageSize: ASK_PAGE_SIZE, maxPages: ASK_MAX_PAGES, accept: record => record.entity === 'tasks' });
    withTasks = new Set();
    for (const task of read2.records) {
      if (tasks.pendingOnly && taskLooksDone(spec, task)) continue;
      for (const link of links) { const id = task.values[link.key]; if (typeof id === 'string' && id) withTasks.add(id); }
    }
    tasksComplete = read2.complete;
  }
  const known = new Map<string, CrmRecord>();
  for (const record of [...main.related, ...main.records]) known.set(record.entity + ':' + record.id, record);
  const nameOf = (entity: EntityName, id: string) => { const record = known.get(entity + ':' + id); return record ? recordLabel(record, spec.entities.find(item => item.id === entity)) : undefined; };
  let matched = main.records.filter(record => askMatches(record, query, { today, spec, nameOf, withTasks }));
  // El servidor ya ordena; solo hace falta ordenar aquí si no pudo (campo que no admite, p. ej.) — se vuelve a aplicar, es estable.
  const entity = spec.entities.find(item => item.id === query.entity), sortField = query.sort ? entity?.fields.find(field => field.key === query.sort!.key) : undefined;
  if (sortField && query.sort) matched = [...matched].sort(compareByField(sortField, query.sort.dir, nameOf));
  return { query, records: query.limit ? matched.slice(0, query.limit) : matched, matched: matched.length, scanned: main.scanned, available: main.total, complete: main.complete && tasksComplete, nameOf };
}

/** Datos que explican por qué un registro sale en la respuesta: los campos de la pregunta, ya formateados (como mucho 2). */
export function answerHint(record: CrmRecord, query: AskQuery, spec: Spec): string {
  const entity = spec.entities.find(item => item.id === query.entity);
  if (!entity) return '';
  const keys = [...new Set([...(query.sort ? [query.sort.key] : []), ...query.conditions.flatMap(condition => condition.kind === 'range' || condition.kind === 'date' ? [condition.field] : [])])].slice(0, 2);
  const short = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return keys.map(key => {
    const field = entity.fields.find(item => item.key === key), value = record.values[key];
    if (!field || emptyValue(value)) return null;
    if (field.type === 'number') { const n = Number(value); return Number.isFinite(n) ? money(n) : String(value); }
    if (field.type === 'date' || field.type === 'datetime') { const day = dueDay(value); return day ? short.format(new Date(day + 'T12:00:00Z')) : null; }
    if (field.type === 'enum') return field.options.find(option => option.id === String(value))?.label ?? String(value);
    return String(value).slice(0, 40);
  }).filter(Boolean).join(' · ');
}
