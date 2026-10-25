import test from 'node:test';
import assert from 'node:assert/strict';
import { importHubspot } from '../server/hubspot.js';
import { reconcile, validateRecord } from '../shared/model.js';
import { makeDemoSpec } from '../shared/fixtures.js';
const options = { token: 'test-token-no-access', accountId: '123', confirmedTestAccount: true };
const properties: Record<string, { name: string; label: string; type: string; hubspotDefined?: boolean }[]> = {
  contacts: ['firstname', 'lastname', 'email', 'phone'].map(name => ({ name, label: name, type: 'string', hubspotDefined: true })),
  companies: ['name', 'domain', 'phone'].map(name => ({ name, label: name, type: 'string', hubspotDefined: true })),
  deals: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate'].map(name => ({ name, label: name, type: name === 'amount' ? 'number' : name === 'closedate' ? 'date' : 'string', hubspotDefined: true })),
  tasks: ['hs_task_subject', 'hs_task_status', 'hs_timestamp'].map(name => ({ name, label: name, type: name === 'hs_timestamp' ? 'datetime' : 'string', hubspotDefined: true }))
};
properties.contacts.push({ name: 'customer_code', label: 'Código de cliente', type: 'string', hubspotDefined: false });
const rows: Record<string, { id: string; properties: Record<string, string> }[]> = {
  contacts: [{ id: '1', properties: { firstname: 'Ana', lastname: 'Prueba', email: 'ana@example.com', phone: '600000001', customer_code: 'A1' } }, { id: '2', properties: { firstname: 'Luis', lastname: 'Prueba', email: 'luis@example.com', phone: '600000002', customer_code: 'A2' } }],
  companies: [{ id: '10', properties: { name: 'Ensayo', domain: 'example.com', phone: '900000001' } }],
  deals: [{ id: '20', properties: { dealname: 'Prueba', amount: '1000', dealstage: 'contact', pipeline: 'default', closedate: '2026-11-01' } }],
  tasks: [{ id: '30', properties: { hs_task_subject: 'Llamar', hs_task_status: 'NOT_STARTED', hs_timestamp: '2026-11-01T09:00:00Z' } }]
};
function mock(mode: 'complete' | 'missing' | 'partial' | 'production' | 'cursor' = 'complete') {
  const calls: string[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input)), path = url.pathname; calls.push(path);
    assert.equal(url.hostname, 'api.hubapi.com');
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-token-no-access');
    let data: unknown;
    if (path.includes('account-info')) data = { portalId: 123, accountType: mode === 'production' ? 'STANDARD' : 'DEVELOPER_TEST' };
    else if (path.includes('/pipelines/')) data = { results: [{ id: 'default', label: 'Ventas', stages: [{ id: 'contact', label: 'Contacto' }, { id: 'won', label: 'Ganada' }] }] };
    else if (path.includes('/properties/')) data = { results: properties[path.split('/').at(-1)!] };
    else if (path.includes('/associations/')) {
      const parts = path.split('/'), from = parts[4], to = parts[5];
      const body = JSON.parse(init!.body as string);
      data = { status: mode === 'partial' ? 'PENDING' : 'COMPLETE', results: body.inputs.map((r: { id: string }) => ({
        from: { id: r.id }, to: [{ toObjectId: rows[to][0].id, associationTypes: [{ label: 'Primary', typeId: 1 }] }]
      })) };
    } else if (path.endsWith('/search')) {
      const entity = path.split('/').at(-2)!; data = { total: rows[entity].length + (mode === 'missing' ? 1 : 0), results: [] };
    } else if (path.includes('/objects/')) {
      const entity = path.split('/').at(-1)!;
      if (entity === 'contacts') data = url.searchParams.has('after') && mode !== 'cursor' ? { results: rows.contacts.slice(1) }
        : { results: rows.contacts.slice(0, 1), paging: { next: { after: 'next' } } };
      else data = { results: rows[entity] };
    } else throw new Error('Ruta inesperada: ' + path);
    return new Response(JSON.stringify(data), { status: 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}
test('importación HubSpot de ensayo conserva paginación, campos, registros y relaciones verificadas', async () => {
  const { fetcher, calls } = mock();
  const snapshot = await importHubspot(options, fetcher);
  assert.equal(snapshot.records.length, 5);
  assert.equal(snapshot.links.length, 6);
  assert.equal(snapshot.source.kind, 'hubspot');
  assert.equal(reconcile(snapshot).complete, true);
  assert.ok(snapshot.entities[0].fields.some(f => f.key === 'customer_code'));
  for (const record of snapshot.records) assert.deepEqual(validateRecord(makeDemoSpec(snapshot), record), {});
  assert.equal(calls.filter(c => c.endsWith('/contacts') && c.includes('/objects/')).length, 2);
});
test('cuenta de producción, recuento parcial, asociaciones incompletas y cursor repetido bloquean la importación', async () => {
  for (const mode of ['production', 'missing', 'partial', 'cursor'] as const) {
    await assert.rejects(() => importHubspot(options, mock(mode).fetcher));
  }
});
test('no se importa una cuenta sin confirmación o con un ID diferente', async () => {
  await assert.rejects(() => importHubspot({ ...options, confirmedTestAccount: false }, mock().fetcher), /confirma/);
  await assert.rejects(() => importHubspot({ ...options, accountId: '999' }, mock().fetcher), /no corresponde/);
});

test('207 de asociaciones exige confirmar cada resultado ausente con GET individual',async()=>{
  const base=mock().fetcher;let checked=0;
  const fetcher:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path.includes('/associations/')&&path.includes('/contacts/companies/'))return Response.json({status:'COMPLETE',results:[{from:{id:'1'},to:[{toObjectId:'10'}]}],numErrors:1,errors:[{context:{fromObjectId:['2']}}]},{status:207});
    if(path==='/crm/v4/objects/contacts/2/associations/companies'){checked++;return Response.json({results:[]});}
    return base(input,init);
  };
  const snapshot=await importHubspot(options,fetcher);assert.equal(checked,1);assert.equal(snapshot.links.length,5);
  assert.equal(snapshot.records.find(r=>r.entity==='contacts'&&r.id==='2')!.values.planb_company_id,null);assert.equal(reconcile(snapshot).complete,true);
});

test('207 no oculta permisos insuficientes al verificar asociaciones individualmente',async()=>{
  const base=mock().fetcher;
  const fetcher:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path.includes('/associations/')&&path.includes('/batch/read'))return Response.json({status:'COMPLETE',results:[],numErrors:1,errors:[{category:'MISSING_SCOPES'}]},{status:207});
    if(path.includes('/crm/v4/objects/'))return Response.json({message:'Forbidden'},{status:403});
    return base(input,init);
  };
  await assert.rejects(importHubspot(options,fetcher),/permisos/);
});
