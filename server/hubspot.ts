import { randomUUID } from 'node:crypto';
import { entityNames, MAX_RECORDS, type ConnectionMode, type CrmSnapshot, type Entity, type EntityName, type Field, type FieldValue, type Link, type Rule } from '../shared/model.js';
import { AppError } from './store.js';
import { readonlyFetch } from './connection.js';

interface Property {
  name: string; label: string; type: string; fieldType?: string; hubspotDefined?: boolean;
  calculated?: boolean; hidden?: boolean; archived?: boolean;
  modificationMetadata?: { readOnlyValue?: boolean };
  options?: { value: string; label: string; hidden?: boolean }[];
}
interface HsRecord { id: string; properties: Record<string, string | null>; }
interface Page<T> { results: T[]; total?: number; paging?: { next?: { after: string | number } }; errors?:{context?:{fromObjectId?:string[]}}[]; numErrors?:number; }
interface Pipeline { id: string; label: string; stages: { id: string; label: string }[]; }
interface Association {
  from: { id: string };
  to: { toObjectId: number | string; associationTypes?: { label: string | null; typeId: number }[] }[];
  paging?: { next?: { after: string | number } };
}
const basics: Record<EntityName, { label: string; singular: string; display: string; fields: string[]; columns: string[] }> = {
  contacts: { label: 'Clientes', singular: 'cliente', display: 'firstname', fields: ['firstname', 'lastname', 'email', 'phone'], columns: ['firstname', 'planb_company_id', 'email', 'phone'] },
  companies: { label: 'Empresas', singular: 'empresa', display: 'name', fields: ['name', 'domain', 'phone'], columns: ['name', 'domain', 'phone'] },
  deals: { label: 'Oportunidades', singular: 'oportunidad', display: 'dealname', fields: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate'], columns: ['dealname', 'planb_company_id', 'amount', 'dealstage'] },
  tasks: { label: 'Tareas', singular: 'tarea', display: 'hs_task_subject', fields: ['hs_task_subject', 'hs_task_status', 'hs_timestamp'], columns: ['hs_task_subject', 'hs_timestamp', 'hs_task_status', 'planb_contact_id'] }
};
const labels: Record<string, string> = {
  firstname: 'Nombre', lastname: 'Apellidos', email: 'Correo', phone: 'Teléfono', name: 'Nombre', domain: 'Sitio web',
  dealname: 'Nombre de la oportunidad', amount: 'Importe', dealstage: 'Etapa', pipeline: 'Proceso comercial', closedate: 'Fecha prevista de cierre',
  hs_task_subject: 'Asunto', hs_task_status: 'Estado', hs_timestamp: 'Fecha límite'
};
export interface HubspotOptions { token: string; accountId: string; name?: string; confirmedTestAccount: boolean; mode?:ConnectionMode; selectedFields?:Partial<Record<EntityName,string[]>>; signal?:AbortSignal; progress?:(message:string,percent:number)=>void; }
export async function importHubspot(options: HubspotOptions, fetcher: typeof fetch = fetch): Promise<CrmSnapshot> {
  fetcher=readonlyFetch(fetcher);
  const captureStartedAt=new Date().toISOString();
  const production=options.mode==='production_readonly';
  if ((!production&&!options.confirmedTestAccount) || !/^\d+$/.test(options.accountId)) throw new AppError(422, 'Indica el ID y confirma que usarás una cuenta de prueba.');
  if (!options.token || options.token.length < 10) throw new AppError(422, 'Configura una Service Key o un token OAuth de lectura.');
  async function request<T>(currentPath: string, legacyPath?: string, body?: unknown, partialAssociations=false): Promise<T> {
    const get = async (path: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        let response: Response;
        try {
          response = await fetcher('https://api.hubapi.com' + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: { Authorization: 'Bearer ' + options.token, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), redirect: 'error'
          });
        } catch { throw new AppError(502, 'No se pudo conectar con HubSpot. La captura anterior se conserva.'); }
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const seconds = Math.min(Math.max(Number(response.headers.get('retry-after')) || 1, 1), 5);
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));options.signal?.throwIfAborted(); continue;
        }
        return response;
      }
      throw new AppError(502, 'HubSpot no completó la lectura.');
    };
    let response = await get(currentPath);
    if (response.status === 404 && legacyPath) response = await get(legacyPath);
    if (response.status === 401) throw new AppError(502, 'HubSpot no aceptó la credencial.');
    if (response.status === 403) throw new AppError(403, 'Faltan permisos de lectura en HubSpot. Revisa los objetos, sus propiedades y external-settings-access.');
    if (!response.ok || response.status === 207&&!partialAssociations) throw new AppError(502, 'HubSpot devolvió una lectura incompleta (' + response.status + ').');
    let rawData: unknown;
    try { rawData = await response.json(); }
    catch { throw new AppError(502, 'HubSpot devolvió una respuesta no válida. La captura anterior se conserva.'); }
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw new AppError(502, 'HubSpot devolvió una respuesta no válida. La captura anterior se conserva.');
    }
    const data = rawData as T & { errors?: unknown[]; status?: string };
    if (data.errors?.length&&!partialAssociations || data.status === 'PENDING' || data.status === 'PROCESSING') throw new AppError(502, 'HubSpot devolvió resultados parciales. No se sustituirá la captura.');
    return data;
  }
  const account = await request<{ portalId: number; accountType: string }>('/account-info/2026-09/details', '/account-info/v3/details');
  options.progress?.(production?'Cuenta de producción verificada · lectura':'Cuenta de prueba verificada',5);
  if (String(account.portalId) !== options.accountId) throw new AppError(422, 'La credencial no corresponde al ID de cuenta indicado.');
  if (production ? account.accountType!=='STANDARD' : !['DEVELOPER_TEST', 'SANDBOX'].includes(account.accountType)) throw new AppError(403, 'El tipo de cuenta no corresponde al modo autorizado. Solo se admiten cuentas de prueba o producción STANDARD en lectura.');
  const pipelineResponse = await request<Page<Pipeline>>('/crm/pipelines/2026-09/deals', '/crm/v3/pipelines/deals');
  if (!pipelineResponse.results?.length) throw new AppError(422, 'La cuenta de prueba necesita al menos un proceso comercial.');
  const stageMap = new Map<string, { id: string; label: string; color: string; pipelineId:string }>();
  const stageColors = ['#6685cc', '#a079d2', '#dc9f43', '#3b9b75', '#be7083'];
  for (const pipeline of pipelineResponse.results) for (const [i, stage] of pipeline.stages.entries()) {
    const existing = stageMap.get(stage.id);
    if (existing && (existing.label !== stage.label || existing.pipelineId!==pipeline.id)) throw new AppError(422, 'Hay etapas con el mismo ID y distinto significado. Esta demo necesita revisarlas.');
    stageMap.set(stage.id, { id: stage.id, label: stage.label, color: stageColors[i % stageColors.length],pipelineId:pipeline.id });
  }
  const stages = [...stageMap.values()];
  const unsupported = [
    'Campañas y envío de correos', 'Permisos multiusuario', 'Automatizaciones de terceros',
    'Devolución automática de cambios al CRM', 'Registros archivados y archivos adjuntos',
    'Reglas de negocio no expuestas en las propiedades importadas'
  ];
  const entities: Entity[] = [];
  const records: CrmSnapshot['records'] = [];
  const expectedCounts: Record<string, number> = {};
  for (const entity of entityNames) {
    options.signal?.throwIfAborted(); options.progress?.('Leyendo '+basics[entity].label.toLowerCase(),10+entityNames.indexOf(entity)*15);
    const meta = await request<Page<Property>>('/crm/properties/2026-09/' + entity, '/crm/v3/properties/' + entity);
    // HubSpot marks standard properties true, but can omit the flag on custom
    // properties. Requiring an explicit false silently drops their values.
    const selected = meta.results.filter(p => !p.archived && (basics[entity].fields.includes(p.name) || p.hubspotDefined !== true && !p.hidden && (options.selectedFields ? !!options.selectedFields[entity]?.includes(p.name) : !production)));
    if(options.selectedFields?.[entity]?.some(name=>!selected.some(p=>p.name===name)))throw new AppError(422,'Un campo seleccionado ya no está disponible. Revisa el alcance antes de capturar.');
    if (selected.length > 60) throw new AppError(422, 'La demo admite hasta 60 propiedades por objeto. Selecciona una cuenta de ensayo más pequeña.');
    if (!selected.some(p => p.name === basics[entity].display)) throw new AppError(422, 'Falta un campo principal del objeto ' + entity + '.');
    const fields: Field[] = selected.map(p => {
      let type: Field['type'] = p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : p.type === 'datetime' ? 'datetime' : p.fieldType === 'checkbox' ? 'multiselect'
        : p.type === 'bool' ? 'boolean' : p.type === 'enumeration' && p.fieldType !== 'checkbox' ? 'enum' : p.name === 'email' ? 'email' : 'text';
      let choices = (p.options ?? []).filter(o => !o.hidden).map(o => ({ id: o.value, label: o.label }));
      if (p.name === 'dealstage') { type = 'enum'; choices = stages.map(s => ({ id: s.id, label: s.label })); }
      if (p.name === 'pipeline') { type = 'enum'; choices = pipelineResponse.results.map(s => ({ id: s.id, label: s.label })); }
      const readOnly = !!(p.calculated || p.modificationMetadata?.readOnlyValue);
      if (p.type === 'enumeration' && !choices.length && p.name !== 'dealstage' && p.name !== 'pipeline') type = 'text';
      if (readOnly) unsupported.push('Campo conservado como solo lectura: ' + entity + '.' + p.name);
      return { key: p.name, label: labels[p.name] ?? p.label, type,
        required: !readOnly && ['dealname','dealstage','pipeline','name','hs_task_subject','hs_timestamp','hs_task_status'].includes(p.name), readOnly, options: choices, referenceEntity: null };
    });
    const propertyNames = selected.map(p => p.name).join(',');
    const list: HsRecord[] = [];
    const recordIds = new Set<string>();
    let after = '', previous = new Set<string>();
    do {
      options.signal?.throwIfAborted();
      const query = '?limit=100&archived=false&properties=' + encodeURIComponent(propertyNames) + (after ? '&after=' + encodeURIComponent(after) : '');
      const page = await request<Page<HsRecord>>('/crm/objects/2026-09/' + entity + query, '/crm/v3/objects/' + entity + query);
      if (!Array.isArray(page.results)) throw new AppError(502, 'HubSpot no devolvió la colección completa.');
      if (page.results.length > MAX_RECORDS - records.length - list.length) throw new AppError(413, 'El piloto admite hasta 10.000 registros totales. No se guardará una captura parcial.');
      let nextCursor = '';
      if (page.paging?.next != null) {
        const rawCursor: unknown = page.paging.next?.after;
        if (!(typeof rawCursor === 'string' && rawCursor.length > 0 && rawCursor === rawCursor.trim()) &&
            !(typeof rawCursor === 'number' && Number.isSafeInteger(rawCursor) && rawCursor >= 0)) {
          throw new AppError(502, 'HubSpot devolvió un cursor de paginación no válido. No se guardará una captura parcial.');
        }
        nextCursor = String(rawCursor);
      }
      if (!page.results.length && nextCursor) throw new AppError(502, 'HubSpot devolvió una página sin progreso. No se guardará una captura parcial.');
      for (const item of page.results) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.length || item.id !== item.id.trim() ||
            !item.properties || typeof item.properties !== 'object' || Array.isArray(item.properties)) {
          throw new AppError(502, 'HubSpot devolvió un registro no válido. No se guardará una captura parcial.');
        }
        if (recordIds.has(item.id)) throw new AppError(502, 'HubSpot repitió un ID de registro en ' + basics[entity].label.toLowerCase() + '. No se guardará una captura parcial.');
        recordIds.add(item.id);
      }
      for (const item of page.results) list.push(item);
      after = nextCursor;
      if (after && previous.has(after)) throw new AppError(502, 'HubSpot repitió un cursor de paginación.');
      if (after) previous.add(after);
    } while (after);
    const count = await request<Page<HsRecord>>('/crm/objects/2026-09/' + entity + '/search', '/crm/v3/objects/' + entity + '/search', { limit: 1 });
    if (typeof count.total !== 'number' || count.total !== list.length) throw new AppError(422, 'El recuento de ' + basics[entity].label.toLowerCase() + ' no coincide. Espera a que el CRM termine de actualizarse y reintenta.');
    expectedCounts[entity] = count.total;
    for (const item of list) {
      const values: Record<string, FieldValue> = {};
      for (const definition of fields) {
        const raw = item.properties[definition.key];
        if (raw === null || raw === undefined || raw === '') { values[definition.key] = null; continue; }
        if (definition.type === 'number') {
          const number = Number(raw);
          if (!Number.isFinite(number)) throw new AppError(422, 'Hay un valor numérico no válido en ' + definition.key + '.');
          values[definition.key] = number;
        } else if (definition.type === 'boolean') {
          if(!['true','false'].includes(raw))throw new AppError(422,'Valor booleano no válido en '+definition.key);
          values[definition.key] = raw === 'true';
        }
        else if (definition.type === 'datetime') {
          const parsed=new Date(/^\d+$/.test(raw)?Number(raw):raw);
          if(Number.isNaN(parsed.getTime()))throw new AppError(422,'Fecha con hora no válida en '+definition.key);
          values[definition.key]=parsed.toISOString();
        }
        else if (definition.type === 'date' && /^\d{13}$/.test(raw)) values[definition.key] = new Date(Number(raw)).toISOString().slice(0, 10);
        else values[definition.key] = raw;
      }
      records.push({ id: item.id, entity, values });
    }
    entities.push({ id: entity, label: basics[entity].label, singular: basics[entity].singular,
      displayField: basics[entity].display, fields, columns: basics[entity].columns.filter(k => fields.some(f => f.key === k)) });
  }
  const links: Link[] = [];
  const targets: [EntityName, EntityName, string, string][] = [
    ['contacts', 'companies', 'planb_company_id', 'Empresa principal'],
    ['deals', 'companies', 'planb_company_id', 'Empresa principal'],
    ['deals', 'contacts', 'planb_contact_id', 'Cliente principal'],
    ['tasks', 'contacts', 'planb_contact_id', 'Cliente principal'],
    ['tasks', 'deals', 'planb_deal_id', 'Oportunidad']
  ];
  for (const [from, to, key, label] of targets) {
    options.signal?.throwIfAborted(); options.progress?.('Conciliando relaciones: '+from+' → '+to,75+targets.findIndex(t=>t[2]===key && t[0]===from)*4);
    const definition = entities.find(e => e.id === from)!;
    if (definition.fields.some(f => f.key === key)) throw new AppError(422, 'Un campo del origen ocupa el espacio reservado a las relaciones.');
    definition.fields.push({ key, label, type: 'reference', required: false, readOnly: false, options: [], referenceEntity: to });
    if (basics[from].columns.includes(key)) definition.columns.splice(1, 0, key);
    const sourceRecords = records.filter(r => r.entity === from);
    const available = new Set(records.filter(r => r.entity === to).map(r => r.id));
    for (let offset = 0; offset < sourceRecords.length; offset += 100) {
      let pending: { id: string; after?: string }[] = sourceRecords.slice(offset, offset + 100).map(r => ({ id: r.id }));
      const chosen = new Map<string, string>();
      const cursors = new Set<string>();
      let pageCount = 0;
      while (pending.length) {
        options.signal?.throwIfAborted();
        if (++pageCount > 100) throw new AppError(422, 'Hay demasiadas relaciones para esta demo.');
        const page = await request<Page<Association>>('/crm/associations/2026-09/' + from + '/' + to + '/batch/read',
          '/crm/v4/associations/' + from + '/' + to + '/batch/read', { inputs: pending },true);
        if(!Array.isArray(page.results))throw new AppError(502,'HubSpot no devolvió una colección de relaciones verificable.');
        const requested=new Set(pending.map(input=>input.id));
        const fallback=new Set(pending.filter(input=>!page.results.some(r=>String(r.from?.id)===input.id)).map(input=>input.id));
        for(const error of page.errors??[]){
          const ids=error.context?.fromObjectId;
          if(!ids?.length||ids.some(id=>!requested.has(String(id))))for(const input of pending)fallback.add(input.id);
          else for(const id of ids)fallback.add(String(id));
        }
        if(page.numErrors&&!page.errors?.length)for(const input of pending)fallback.add(input.id);
        // A partial batch never proves an empty relation. Re-read unresolved objects
        // individually; only a successful, paginated GET can confirm their links.
        for(const id of fallback){
          const input=pending.find(item=>item.id===id)!;
          const single=await request<Page<Association['to'][number]>>('/crm/v4/objects/'+from+'/'+encodeURIComponent(id)+'/associations/'+to+'?limit=500'+(input.after?'&after='+encodeURIComponent(input.after):''));
          if(!Array.isArray(single.results))throw new AppError(502,'No se pudo verificar una relación individual.');
          page.results=page.results.filter(item=>String(item.from?.id)!==id);
          page.results.push({from:{id},to:single.results,...(single.paging?{paging:single.paging}:{})});
        }
        const next: typeof pending = [];
        const returned = new Set<string>();
        for (const item of page.results) {
          if(!requested.has(item.from?.id)||returned.has(item.from.id)||!Array.isArray(item.to))throw new AppError(502,'HubSpot devolvió relaciones duplicadas o ajenas al lote.');
          returned.add(item.from.id);
          for (const target of item.to) {
            const targetId = String(target.toObjectId);
            if (!available.has(targetId)) throw new AppError(422, 'Una relación apunta a un registro fuera de la captura. Revisa los registros archivados y permisos.');
            links.push({ fromEntity: from, fromId: item.from.id, toEntity: to, toId: targetId, label: key });
            const isPrimary = target.associationTypes?.some(t => /^(primary|principal)$/i.test(t.label ?? ''));
            if (!chosen.has(item.from.id) || isPrimary) chosen.set(item.from.id, targetId);
          }
          if (item.paging?.next) {
            const after = String(item.paging.next.after);
            const cursorKey = item.from.id + ':' + after;
            if (cursors.has(cursorKey)) throw new AppError(502, 'HubSpot repitió una página de relaciones.');
            cursors.add(cursorKey); next.push({ id: item.from.id, after });
          }
        }
        if (pending.some(input => !returned.has(input.id))) throw new AppError(502, 'HubSpot omitió registros al leer las relaciones.');
        pending = next;
      }
      for (const record of sourceRecords.slice(offset, offset + 100)) record.values[key] = chosen.get(record.id) ?? null;
    }
  }
  const email = entities.find(e => e.id === 'contacts')!.fields.find(f => f.key === 'email' && !f.readOnly);
  const rules: Rule[] = email ? [{
    id: 'hubspot-contact-email', entity: 'contacts', kind: 'email', field: 'email', value: null, whenField: null, whenValue: null,
    origin: 'configuration', description: 'El correo debe tener un formato válido.', evidence: 'Propiedad de correo importada de HubSpot: contacts.email.'
  }] : [];
  return {
    version: 3, id: randomUUID(), name: options.name?.trim() || (production?'HubSpot · ':'HubSpot de ensayo · ') + account.portalId,
    captureStartedAt,pipelines:pipelineResponse.results.map(p=>({id:p.id,label:p.label})),
    capturedAt: new Date().toISOString(),
    source: { kind: 'hubspot', accountId: String(account.portalId), isTestData: !production, environment:production?'production':'test', accountType:account.accountType, description: 'Cuenta ' + account.accountType + '. Objetos activos y alcance seleccionado; relaciones verificadas.' },
    entities, records, links, stages, rules, unsupported: [...new Set(unsupported)],
    manifest: { complete: true, expectedCounts, expectedLinks: links.length }
  };
}
