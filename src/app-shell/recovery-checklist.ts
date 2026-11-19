import type { Change, EntityName, FieldValue } from '../../shared/model.js';

// Parents first, so an association always points at something that already exists in the portal.
export const APPLY_ORDER: readonly EntityName[] = ['companies', 'contacts', 'deals', 'tasks'];
export const ENTITY_LABEL: Record<EntityName, string> = { companies: 'Empresa', contacts: 'Contacto', deals: 'Negocio', tasks: 'Tarea' };
const TITLE_KEYS = ['name', 'dealname', 'hs_task_subject', 'subject', 'title', 'domain', 'email'];
const MAX_VALUE = 240;

export type ChecklistField = { key: string; before: FieldValue | undefined; after: FieldValue | undefined };
export type ChecklistItem = {
  step: number; entity: EntityName; recordId: string; operation: 'create' | 'update';
  title: string; operations: number; firstChange: number; lastAt: string; fields: ChecklistField[];
};
export type RecoveryChecklist = { items: ChecklistItem[]; records: number; operations: number; creates: number; updates: number; fields: number };

const same = (a: FieldValue | undefined, b: FieldValue | undefined) => (a ?? null) === (b ?? null);

function titleOf(values: Record<string, FieldValue>): string {
  const person = [values.firstname, values.lastname].filter(v => typeof v === 'string' && v.trim()).join(' ');
  if (person) return person;
  for (const key of TITLE_KEYS) { const v = values[key]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}

export function recoveryChecklist(changes: readonly Change[]): RecoveryChecklist {
  const groups = new Map<string, Change[]>();
  for (const change of [...changes].sort((a, b) => a.id - b.id)) {
    const key = JSON.stringify([change.entity, change.recordId]);
    const list = groups.get(key);
    if (list) list.push(change); else groups.set(key, [change]);
  }
  const items: Omit<ChecklistItem, 'step'>[] = [];
  for (const list of groups.values()) {
    const first = list[0]!, last = list[list.length - 1]!;
    const created = list.some(c => c.operation === 'create');
    const before = created ? {} : (first.before?.values ?? {});
    const after = last.after.values;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) => a.localeCompare(b, 'es'));
    const fields = keys
      .filter(key => created ? after[key] !== null && after[key] !== undefined && after[key] !== '' : !same(before[key], after[key]))
      .map(key => ({ key, before: created ? undefined : before[key], after: after[key] }));
    items.push({ entity: first.entity, recordId: first.recordId, operation: created ? 'create' : 'update', title: titleOf(after), operations: list.length, firstChange: first.id, lastAt: last.at, fields });
  }
  items.sort((a, b) => APPLY_ORDER.indexOf(a.entity) - APPLY_ORDER.indexOf(b.entity)
    || (a.operation === b.operation ? 0 : a.operation === 'create' ? -1 : 1)
    || a.firstChange - b.firstChange);
  const numbered = items.map((item, index) => ({ ...item, step: index + 1 }));
  return {
    items: numbered, records: numbered.length, operations: changes.length,
    creates: numbered.filter(i => i.operation === 'create').length, updates: numbered.filter(i => i.operation === 'update').length,
    fields: numbered.reduce((sum, i) => sum + i.fields.length, 0),
  };
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function formatValue(value: FieldValue | undefined): string {
  if (value === undefined || value === null || value === '') return '(vacío)';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const text = String(value);
  return text.length > MAX_VALUE ? text.slice(0, MAX_VALUE - 1) + '…' : text;
}
const stamp = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' });

export function recoveryChecklistHtml(list: RecoveryChecklist, revision: string, now: Date): string {
  const card = (item: ChecklistItem) => {
    const head = '<header><span class="box" aria-hidden="true"></span><span class="step">' + item.step + '</span><div><h2>'
      + escape(ENTITY_LABEL[item.entity]) + ' · ' + (item.operation === 'create' ? 'crear' : 'actualizar') + (item.title ? ' · ' + escape(item.title) : '')
      + '</h2><p class="meta">Id. local ' + escape(item.recordId) + ' · ' + item.operations + (item.operations === 1 ? ' operación' : ' operaciones') + ' · último cambio ' + escape(stamp.format(new Date(item.lastAt))) + '</p></div></header>';
    const rows = item.fields.length
      ? '<table><thead><tr><th scope="col">Campo</th>' + (item.operation === 'update' ? '<th scope="col">Antes</th>' : '') + '<th scope="col">Debe quedar</th><th scope="col" class="tick">Hecho</th></tr></thead><tbody>'
        + item.fields.map(f => '<tr><th scope="row"><code>' + escape(f.key) + '</code></th>' + (item.operation === 'update' ? '<td class="old">' + escape(formatValue(f.before)) + '</td>' : '') + '<td>' + escape(formatValue(f.after)) + '</td><td class="tick"><span class="box small" aria-hidden="true"></span></td></tr>').join('')
        + '</tbody></table>'
      : '<p class="meta">Sin diferencias de valores: el último estado coincide con el de partida. Comprueba solo que el registro no cambió en el portal.</p>';
    const remote = item.operation === 'create' ? '<p class="remote">ID remoto en HubSpot: <span class="line"></span></p>' : '';
    return '<section class="item">' + head + rows + remote + '</section>';
  };
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Plan B · Lista de recuperación manual</title><style>'
    + 'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f1c17;margin:0;background:#f5f1e6}main{max-width:820px;margin:0 auto;padding:32px 24px;background:#fffcf4}'
    + 'h1{font:600 26px/1.2 Georgia,"Sitka Heading",serif;margin:0 0 4px}h2{font-size:15px;margin:0}.meta{color:#5b5447;font-size:13px;margin:2px 0 0}'
    + '.summary{display:flex;flex-wrap:wrap;gap:6px 22px;margin:16px 0 8px;font-size:14px;font-variant-numeric:tabular-nums}.summary b{font-size:18px;margin-right:4px}'
    + 'ol.rules{font-size:14px;line-height:1.6;padding-left:20px;margin:12px 0 22px}'
    + '.item{border-top:1px solid #d9d0bb;padding:14px 0 12px;break-inside:avoid}.item header{display:flex;gap:10px;align-items:flex-start}'
    + '.step{font:600 13px/20px system-ui;color:#5b5447;min-width:22px;font-variant-numeric:tabular-nums}'
    + '.box{display:inline-block;width:16px;height:16px;border:1.5px solid #1f1c17;border-radius:2px;margin-top:2px;flex:none}.box.small{width:12px;height:12px;margin:0}'
    + 'table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;table-layout:fixed}th,td{text-align:left;padding:6px 8px;border-top:1px solid #ece5d4;vertical-align:top;overflow-wrap:anywhere}'
    + 'thead th{font-size:11px;color:#5b5447;text-transform:uppercase;letter-spacing:.04em}tbody th{font-weight:500;width:28%}.tick{width:58px;text-align:center}td.old{color:#5b5447;text-decoration:line-through}'
    + 'code{font:12px ui-monospace,Consolas,monospace}.remote{font-size:13px;margin:10px 0 0}.line{display:inline-block;width:240px;border-bottom:1px solid #1f1c17;margin-left:6px}'
    + 'footer{margin-top:28px;font-size:12px;color:#5b5447;border-top:1px solid #d9d0bb;padding-top:10px}'
    + '@media print{body{background:#fff}main{max-width:none;padding:0}@page{margin:16mm}.item{page-break-inside:avoid}}</style></head><body><main>'
    + '<h1>Recuperación manual · lista de comprobación</h1><p class="meta">Plan B · revisión ' + escape(revision.slice(0, 12)) + ' · generada el ' + escape(stamp.format(now)) + ' (hora de Madrid)</p>'
    + '<div class="summary"><span><b>' + list.records + '</b>registros</span><span><b>' + list.creates + '</b>altas</span><span><b>' + list.updates + '</b>cambios</span><span><b>' + list.fields + '</b>campos</span><span><b>' + list.operations + '</b>operaciones</span></div>'
    + '<ol class="rules"><li>Sigue el orden: empresas, contactos, negocios y tareas; dentro de cada tipo, primero las altas.</li><li>Marca cada campo al dejarlo igual que «Debe quedar» y el registro al terminarlo.</li><li>Apunta el ID remoto de cada alta: Plan B lo pedirá para comprobar el resultado.</li><li>Nadie debe editar estos registros en HubSpot mientras dure la recuperación.</li></ol>'
    + (list.items.length ? list.items.map(card).join('') : '<p class="meta">No hay cambios pendientes.</p>')
    + '<footer>Contiene datos de clientes. Guárdala en un lugar seguro y destrúyela cuando Plan B confirme la comprobación. Esta lista no marca nada como devuelto.</footer></main></body></html>';
}
