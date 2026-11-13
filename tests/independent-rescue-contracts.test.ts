import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
process.env.NODE_ENV='test';
const ROOT=path.resolve(process.env.PLANB_RESCUE113_ROOT??process.cwd()),load=(p:string)=>import(pathToFileURL(path.join(ROOT,p)).href);
const {RescueRoom}=await load('server/rescue-room.ts') as typeof import('../server/rescue-room.js');
const {createRescueServer}=await load('server/rescue-room-api.ts') as typeof import('../server/rescue-room-api.js');
const {JournalSchema}=await load('shared/rescue-room.ts') as typeof import('../shared/rescue-room.js');
const {lockInstance}=await load('server/instance.ts') as typeof import('../server/instance.js');
const {startDemo}=await load('scripts/demo-rescue-room.ts') as typeof import('../scripts/demo-rescue-room.js');
const {RescueClient,RescueApiError}=await load('src/rescue-room-client.ts') as typeof import('../src/rescue-room-client.js');
type Room=ReturnType<typeof RescueRoom.create>;
const NOW=Date.parse('2026-11-02T07:00:00.000Z'),clock=()=>NOW,headers={host:'127.0.0.1:4561',origin:'http://127.0.0.1:4561'};
function createRoom(){const parent=path.join(ROOT,'tests/.tmp');fs.mkdirSync(parent,{recursive:true});return RescueRoom.create(parent,{clock});}
function state(room:Room){const v=room.view();assert.equal(v.blocked,false);if(v.blocked)throw Error('Unexpected blocked fixture');return v;}
function envelope(room:Room,key='review113-'+randomUUID()){const v=state(room);return {idempotencyKey:key,expectedVersion:v.version,context:v.context};}
function digest(room:Room){const tables=(room.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[]).map(r=>r.name);return Object.fromEntries(tables.map(n=>[n,createHash('sha256').update(JSON.stringify(room.store.db.prepare('SELECT * FROM "'+n+'" ORDER BY rowid').all())).digest('hex')]));}
const post=(app:Awaited<ReturnType<typeof createRescueServer>>,route:string,body:unknown)=>app.inject({method:'POST',url:'/api/rescue/'+route,headers,payload:body as object});
const values={subject:'Dos intenciones distintas con el mismo contenido',due_date:'2026-11-05',status:'pending'};

test('control: la repetición en el mismo contexto devuelve su acuse y conserva versión, cambios y diario',async()=>{
  const room=createRoom(),app=await createRescueServer(room);try{const req={...envelope(room),budgetMinutes:60},first=await post(app,'plan',req);assert.equal(first.statusCode,200);const before=digest(room),again=await post(app,'plan',req);assert.equal(again.statusCode,200);assert.equal(again.json().replayed,true);assert.deepEqual(digest(room),before);assert.equal(state(room).budgetMinutes,60);}finally{await app.close();room.close();}
});
test('contexto: un acuse ya guardado nunca se repite para espacio, portal, captura o revisión ajenos',async()=>{
  const room=createRoom(),app=await createRescueServer(room);try{const req={...envelope(room),budgetMinutes:60};assert.equal((await post(app,'plan',req)).statusCode,200);const before=digest(room),statuses:number[]=[];for(const[field,value]of [['workspaceId',randomUUID()],['accountId','other-fictional-account'],['captureId','other-fictional-capture'],['captureRevision','f'.repeat(64)]]){const r=await post(app,'plan',{...req,context:{...req.context,[field]:value}});statuses.push(r.statusCode);}assert.deepEqual(digest(room),before);assert.deepEqual(statuses,[409,409,409,409],'una clave ya terminada no autoriza un sobre de otro contexto');}finally{await app.close();room.close();}
});
test('interrupción antes del efecto: reintentar A no puede apropiarse de una tarea idéntica creada después por B',async(t)=>{
  let room=createRoom(),app=await createRescueServer(room);const root=room.root,reqA={...envelope(room),values},original=room.store.saveRecord.bind(room.store);
  try{room.store.saveRecord=()=>{throw Error('Injected process failure BEFORE CRM effect');};const interrupted=await post(app,'create',reqA);assert.equal(interrupted.statusCode,500);assert.equal(interrupted.json().code,'OUTCOME_UNKNOWN');assert.equal(room.store.changes().length,0);room.store.saveRecord=original;await app.close();room.close();room=RescueRoom.open(root,{clock},ROOT);app=await createRescueServer(room);const reqB={...envelope(room),values},b=await post(app,'create',reqB);assert.equal(b.statusCode,200);const idB=b.json().result.recordId;assert.equal(room.store.changes().filter(c=>c.operation==='create').length,1);const retry=await post(app,'create',reqA);if(retry.statusCode===200){const ack=retry.json();t.diagnostic(JSON.stringify({retryOutcome:ack.outcome,recovered:ack.result.recovered,borrowedAnotherIntent:ack.result.recordId===idB,createdRows:room.store.changes().filter(c=>c.operation==='create').length}));assert.notEqual(ack.result.recordId,idB,'A nunca se aplicó: su acuse no puede confirmar la identidad de la creación de B');assert.equal(room.store.changes().filter(c=>c.operation==='create').length,2);}else{assert.ok([409,500].includes(retry.statusCode));assert.notEqual(retry.json().ok,true,'un resultado no atribuible debe quedar sin confirmar');}}finally{await app.close();room.close();}
});
test('control: interrupción después del efecto se reanuda con el ID propio y una sola creación',async()=>{
  let room=createRoom(),app=await createRescueServer(room);const root=room.root,req={...envelope(room),values},original=room.store.saveRecord.bind(room.store);let ownId='';
  try{room.store.saveRecord=(...args)=>{const record=original(...args);ownId=record.id;throw Error('Injected process failure AFTER CRM effect');};assert.equal((await post(app,'create',req)).statusCode,500);assert.ok(ownId);assert.equal(room.store.changes().length,1);room.store.saveRecord=original;await app.close();room.close();room=RescueRoom.open(root,{clock},ROOT);app=await createRescueServer(room);const retry=await post(app,'create',req);assert.equal(retry.statusCode,200);assert.equal(retry.json().result.recordId,ownId);assert.equal(retry.json().result.recovered,true);assert.equal(room.store.changes().length,1);assert.equal(room.ledger.inspect().journal.filter(e=>e.kind==='local-create').length,1);}finally{await app.close();room.close();}
});
test('límite del diario: una operación normal desde 5000 hechos válidos no puede guardar éxito y volver corrupta la sala',async(t)=>{
  const room=createRoom(),app=await createRescueServer(room);try{const initial=room.ledger.inspect(),base=initial.state!,first=initial.journal[0];const journal=Array.from({length:5000},(_,i)=>({...first,id:randomUUID(),seq:i+1,stateVersion:i+1,kind:i===0?'incident-opened' as const:'note-saved' as const,data:{taskId:'task-2'}}));assert.equal(JournalSchema.safeParse(journal).success,true);assert.equal(JournalSchema.safeParse([...journal,{...journal[4999],seq:5001,id:randomUUID()}]).success,false,'precondición: límite vigente del formato');room.store.set('rescue:state',{...base,version:5000});room.store.set('rescue:journal',journal);assert.equal(room.ledger.inspect().integrity.status,'ok');const response=await post(app,'note',{...envelope(room),taskId:'task-2',text:'Nota válida al alcanzar el límite'});const after=room.ledger.inspect();t.diagnostic(JSON.stringify({http:response.statusCode,outcome:response.json().outcome,journalLength:room.store.get<unknown[]>('rescue:journal',[]).length,integrity:after.integrity.status}));assert.equal(after.integrity.status,'ok','la propia operación no puede invalidar su diario');if(response.statusCode!==200)assert.equal(response.statusCode,409);}finally{await app.close();room.close();}
});
test('un segundo arranque rechazado por el bloqueo no puede modificar un envío del dueño que sigue en vuelo',async(t)=>{
  const room=createRoom(),releaseLock=lockInstance(room.root);let release!:()=>void,arrived!:()=>void;const held=new Promise<void>(r=>{release=r;}),reached=new Promise<void>(r=>{arrived=r;}),original=room.crm.update.bind(room.crm);let pending:Promise<unknown>|undefined;
  try{await room.choosePlan({...envelope(room),budgetMinutes:60});await room.editTask({...envelope(room),taskId:'task-4',values:{status:'completed'}});await room.crmReturn(envelope(room));const prepared=await room.prepareReturn(envelope(room)),planId=(prepared.result as {planId:string}).planId;await room.approve({...envelope(room),planId});room.crm.update=async(...args)=>{arrived();await held;return original(...args);};pending=room.apply({...envelope(room),planId});await Promise.race([reached,pending.then(()=>{throw Error('No request remained in flight');})]);const before=digest(room),beforePlan=room.store.recoveryState().plan!;assert.equal(beforePlan.status,'applying');assert.ok(beforePlan.operations.some(o=>o.status==='sending'));await assert.rejects(startDemo({port:4579,dist:null,resume:room.root,now:NOW}),/ya está abierto/);const afterPlan=room.store.recoveryState().plan!;t.diagnostic(JSON.stringify({before:beforePlan.status,after:afterPlan.status,beforeOp:beforePlan.operations[0].status,afterOp:afterPlan.operations[0].status}));assert.deepEqual(digest(room),before,'la denegación del segundo escritor debe ocurrir antes de abrir o recuperar su Store');}finally{release();if(pending)await pending;room.crm.update=original;releaseLock();room.close();}
});
const reply=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json; charset=utf-8'}});
const client=(value:unknown)=>new RescueClient('/api/rescue',(async()=>reply(value)) as typeof fetch);
test('control cliente: estado completo real y acuse completo válido conservan sus datos',async()=>{
  const room=createRoom();try{const v=state(room),received=await client(v).state(v.context);assert.ok(received&&!received.blocked);assert.deepEqual(received.context,v.context);assert.equal(received.queue.items.length,v.queue.items.length);const ack={ok:true,outcome:'saved',version:2,replayed:false,result:{taskId:'task-2'}};assert.deepEqual(await client(ack).mutate('note',{}),ack);}finally{room.close();}
});
test('cliente: un estado200con cabecera plausible y cuerpo incompleto no es una vista utilizable',async()=>{
  const room=createRoom();try{const v=state(room),incomplete={roomId:v.roomId,blocked:false,version:v.version,stage:v.stage,context:v.context};await assert.rejects(client(incomplete).state(v.context),e=>e instanceof RescueApiError,'faltan queue, capture, journal y datos que el componente necesita');}finally{room.close();}
});
test('cliente: acuses incompletos o versiones negativas no confirman un guardado',async()=>{
  const statuses:string[]=[];for(const body of [{ok:true,outcome:'saved',version:2},{ok:true,outcome:'saved',version:-1,replayed:false,result:{}}]){try{await client(body).mutate('create',{});statuses.push('accepted');}catch(e){assert.ok(e instanceof RescueApiError);statuses.push('rejected');}}assert.deepEqual(statuses,['rejected','rejected']);
});
test('cliente: el límite declarado en bytes también rechaza JSON UTF8multibyte sin Content-Length',async()=>{
  const room=createRoom();try{const body={...state(room),padding:'界'.repeat(700000)};assert.ok(Buffer.byteLength(JSON.stringify(body),'utf8')>2000000);assert.ok(JSON.stringify(body).length<2000000);await assert.rejects(client(body).state(),e=>e instanceof RescueApiError,'el límite no debe medir solo caracteres UTF16');}finally{room.close();}
});
