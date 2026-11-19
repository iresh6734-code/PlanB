/** Plantillas de seguimiento (super plan H6): textos de llamada y correo con huecos como {nombre} o {empresa}.
 *  Se guardan solo en este navegador y se copian al portapapeles; la aplicación no envía nada. */
export type FollowUpTemplate = { id: string; name: string; body: string };

export const TEMPLATES_KEY = 'planb.followup-templates.v1';
export const MAX_TEMPLATES = 12;
export const MAX_NAME = 60;
export const MAX_BODY = 1500;

export const TEMPLATE_SLOTS = [
  { key: 'nombre', label: 'nombre del cliente' },
  { key: 'empresa', label: 'empresa' },
  { key: 'correo', label: 'correo' },
  { key: 'telefono', label: 'teléfono' },
  { key: 'hoy', label: 'fecha de hoy' },
] as const;
export type SlotKey = typeof TEMPLATE_SLOTS[number]['key'];
export type TemplateContext = Partial<Record<SlotKey, string>>;

export const DEFAULT_TEMPLATES: FollowUpTemplate[] = [
  { id: 'llamada', name: 'Guion de llamada', body: 'Hola {nombre}, te llamo para retomar lo que hablamos con {empresa}.\n- ¿Sigue siendo prioridad este trimestre?\n- ¿Quién más decide?\n- Siguiente paso y fecha:' },
  { id: 'correo', name: 'Correo de seguimiento', body: 'Hola {nombre}:\n\nTe escribo para dar continuidad a nuestra conversación sobre {empresa}. ¿Te viene bien que hablemos esta semana?\n\nUn saludo.' },
];

const SLOT = /\{([a-zA-Zñáéíóú_]+)\}/g;

/** Rellena los huecos con los datos de la ficha. Los que no tienen valor se dejan tal cual, para que se vean al pegar. */
export function fillTemplate(body: string, context: TemplateContext): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(SLOT, (whole, raw: string) => {
    const key = raw.toLowerCase() as SlotKey;
    const value = context[key]?.trim();
    if (value) return value;
    missing.add(raw.toLowerCase());
    return whole;
  });
  return { text, missing: [...missing] };
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').slice(0, max) : '';
}

/** Lee las plantillas guardadas; si no hay o están dañadas, devuelve las de ejemplo. Una lista vacía guardada se respeta. */
export function parseTemplates(raw: string | null | undefined): FollowUpTemplate[] {
  if (!raw) return DEFAULT_TEMPLATES.map(item => ({ ...item }));
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('formato');
    const seen = new Set<string>();
    const list: FollowUpTemplate[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = clean(record.id, 40), name = clean(record.name, MAX_NAME).trim(), body = clean(record.body, MAX_BODY);
      if (!id || !name || !body.trim() || seen.has(id)) continue;
      seen.add(id);
      list.push({ id, name, body });
      if (list.length === MAX_TEMPLATES) break;
    }
    return list;
  } catch {
    return DEFAULT_TEMPLATES.map(item => ({ ...item }));
  }
}

export function serializeTemplates(list: FollowUpTemplate[]) {
  return JSON.stringify(list.slice(0, MAX_TEMPLATES).map(item => ({ id: item.id, name: clean(item.name, MAX_NAME).trim(), body: clean(item.body, MAX_BODY) })));
}

/** Crea o sustituye una plantilla. Devuelve un error legible si no se puede guardar. */
export function upsertTemplate(list: FollowUpTemplate[], draft: { id?: string; name: string; body: string }, newId: () => string): { list: FollowUpTemplate[]; error?: string; id?: string } {
  const name = draft.name.trim(), body = draft.body.replace(/\r\n?/g, '\n');
  if (!name) return { list, error: 'Ponle un nombre a la plantilla.' };
  if (!body.trim()) return { list, error: 'La plantilla está vacía.' };
  if (name.length > MAX_NAME) return { list, error: 'El nombre admite hasta ' + MAX_NAME + ' caracteres.' };
  if (body.length > MAX_BODY) return { list, error: 'El texto admite hasta ' + MAX_BODY + ' caracteres.' };
  if (draft.id && list.some(item => item.id === draft.id)) return { list: list.map(item => item.id === draft.id ? { id: item.id, name, body } : item), id: draft.id };
  if (list.length >= MAX_TEMPLATES) return { list, error: 'Caben ' + MAX_TEMPLATES + ' plantillas; borra alguna antes.' };
  const id = newId();
  return { list: [...list, { id, name, body }], id };
}
