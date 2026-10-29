import { createHash, randomUUID } from 'node:crypto';
import type { AppSpec, CrmRecord, EntityName } from '../shared/model.js';
import type { ActionProposal, AgentAction, AgentOverview, AgentRun, AgentState, IntegrationCapability, SimulationArtifact, TodayStatus } from '../shared/agents.js';
import { AppError, type Store } from './store.js';
import { bundleRevision } from './recovery-copy.js';

const LIMITS = { maxToolCalls:8, maxDurationSeconds:120, maxConcurrent:1, monthlyBudgetUsd:25 } as const;
const empty = ():AgentState => ({ runs:[], proposals:[], artifacts:[] });
const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contentHash = (p:ActionProposal) => hash({ captureId:p.captureId, revision:p.revision, dealId:p.dealId, label:p.label, reason:p.reason, evidence:p.evidence, actions:p.actions });
export function madridDate(now:Date):string {
  const parts = new Intl.DateTimeFormat('en', { timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
const addDays = (date:string, days:number) => new Date(Date.parse(date+'T12:00:00Z')+days*86400_000).toISOString().slice(0,10);
function label(record:CrmRecord, spec:AppSpec) { return String(record.values[spec.entities.find(e=>e.id===record.entity)!.displayField] || record.id).slice(0,180); }
function reference(record:CrmRecord, target:EntityName, spec:AppSpec):string|null {
  const field=spec.entities.find(e=>e.id===record.entity)?.fields.find(f=>f.type==='reference'&&f.referenceEntity===target);
  return field && record.values[field.key] ? String(record.values[field.key]) : null;
}
function completed(record:CrmRecord, spec:AppSpec):boolean {
  const key=spec.roles?.taskStatus ?? (record.values.hs_task_status!==undefined?'hs_task_status':'status');
  return /^(completed|done|completad[oa])$/i.test(String(record.values[key]??''));
}
function due(record:CrmRecord, spec:AppSpec):string {
  const value=String(record.values[spec.roles?.dueDate ?? (record.values.hs_timestamp!==undefined?'hs_timestamp':'due_date')]??'');
  return value.includes('T') && Number.isFinite(Date.parse(value)) ? madridDate(new Date(value)) : /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value)) ? value : '';
}
function closed(record:CrmRecord, spec:AppSpec) {
  const stage=String(record.values[spec.roles?.stage??'dealstage']??'');
  const text=spec.stages.find(s=>s.id===stage)?.label??'';
  return /^(won|lost|closedwon|closedlost)$/i.test(stage)||/^(ganad[oa]|perdid[oa]|completad[oa]|cerrad[oa])\b/i.test(text);
}

export interface SimulationAdapter {
  apply(key:string, proposalId:string, action:AgentAction, existing:SimulationArtifact[]):SimulationArtifact;
}
const simulatedAdapter:SimulationAdapter = {
  apply(key,proposalId,action,existing) { return existing.find(a=>a.key===key) ?? { key,proposalId,action,verifiedAt:new Date().toISOString() }; }
};

export class SalesAgents {
  constructor(private store:Store, private runtime=false, private adapter:SimulationAdapter=simulatedAdapter, private clock:()=>Date=()=>new Date()) {
    const state=this.state(); let changed=false;
    for(const run of state.runs) if(run.status==='running') { run.status='interrupted';run.completedAt=this.clock().toISOString();run.message='El proceso se cerró. Revisa las propuestas conservadas.';changed=true; }
    for(const proposal of state.proposals) if(proposal.status==='applying') { proposal.status='uncertain';proposal.error='La ejecución se interrumpió. Comprueba los resultados simulados antes de continuar.';changed=true; }
    if(changed)this.save(state);
  }
  private state():AgentState { return this.store.get('agentState',empty()); }
  private save(state:AgentState) { this.store.set('agentState',state); }
  private available() { return !this.runtime && this.store.ready && this.store.snapshot?.source.isTestData===true; }
  private assertAvailable() {
    if(!this.available())throw new AppError(403,'El agente 0.4 funciona únicamente sobre datos ficticios en el generador local.');
    if(this.store.get('returnBusy',false))throw new AppError(409,'Espera a que termine la devolución.');
  }
  private revision() { return bundleRevision(this.store.bundle()); }
  overview():AgentOverview {
    if(!this.available())return { ...empty(), available:false,mode:'simulation',limits:LIMITS };
    const revision=this.revision(),state=this.state();
    return { ...state, proposals:state.proposals.map(p=>({...p,stale:p.revision!==revision})),available:true,mode:'simulation',limits:LIMITS };
  }
  today():TodayStatus {
    const date=madridDate(this.clock());
    if(!this.available())return {available:false,date,openDeals:0,overdueTasks:0,dueToday:0,opportunities:[],tasks:[]};
    const spec=this.store.spec!,records=this.store.records();
    const tasks=records.filter(r=>r.entity==='tasks'&&!completed(r,spec));
    const deals=records.filter(r=>r.entity==='deals'&&!closed(r,spec));
    const taskRows=tasks.map(t=>{const dateDue=due(t,spec);return {id:t.id,label:label(t,spec),dueDate:dateDue,overdue:!!dateDue&&dateDue<date};});
    const coveredDeals=new Set<string>(),coveredContacts=new Set<string>(),horizon=addDays(date,7);
    for(let i=0;i<tasks.length;i++)if(taskRows[i].dueDate>=date&&taskRows[i].dueDate<=horizon){
      const deal=reference(tasks[i],'deals',spec),contact=reference(tasks[i],'contacts',spec);
      if(deal)coveredDeals.add(deal);else if(contact)coveredContacts.add(contact);
    }
    const opportunities=deals.filter(deal=>{
      const contact=reference(deal,'contacts',spec);return !coveredDeals.has(deal.id)&&!(contact&&coveredContacts.has(contact));
    }).slice(0,20).map(deal=>({id:deal.id,label:label(deal,spec),contactId:reference(deal,'contacts',spec),reason:'No tiene una tarea abierta con fecha en los próximos siete días.'}));
    return {available:true,date,openDeals:deals.length,overdueTasks:taskRows.filter(t=>t.overdue).length,dueToday:taskRows.filter(t=>t.dueDate===date).length,
      opportunities,tasks:taskRows.filter(t=>t.overdue||t.dueDate===date).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,20)};
  }
  run():AgentRun {
    this.assertAvailable();const state=this.state();
    if(state.runs.some(r=>r.status==='running'))throw new AppError(409,'Ya hay una ejecución en curso.');
    if(state.proposals.length>=100)throw new AppError(409,'Se alcanzó el límite de 100 propuestas de este ensayo. Conserva la evidencia antes de preparar otro ensayo.');
    const now=this.clock(),revision=this.revision(),capture=this.store.snapshot!;
    const run:AgentRun={id:randomUUID(),status:'running',startedAt:now.toISOString(),completedAt:null,revision,proposals:0,toolCalls:0,costUsd:0,message:'Leyendo el espacio de ensayo.'};
    state.runs=[run,...state.runs].slice(0,50);this.save(state);
    const step=()=>{ if(++run.toolCalls>LIMITS.maxToolCalls||this.clock().getTime()-now.getTime()>LIMITS.maxDurationSeconds*1000)throw new AppError(429,'Se alcanzó el límite de esta ejecución.'); };
    try {
      step();const today=this.today();step();const spec=this.store.spec!;
      const proposals:ActionProposal[]=[];
      for(const item of today.opportunities){
        if(state.proposals.length+proposals.length>=100)break;
        if(state.proposals.some(p=>p.dealId===item.id&&p.revision===revision&&p.status!=='rejected'))continue;
        const contact=item.contactId?this.store.record('contacts',item.contactId):null;
        const email=contact?String(contact.values.email??''):'';
        const recipient=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;
        const next=addDays(today.date,1);
        const base={contactId:item.contactId,recipient,dueDate:next,timeZone:'Europe/Madrid' as const};
        const actions:AgentAction[]=[{...base,kind:'task',destination:'planb',title:'Revisar seguimiento · '+item.label,detail:'Tarea de ensayo vinculada a esta oportunidad; no modifica el CRM activo.'}];
        if(recipient){
          actions.push({...base,kind:'email',destination:'gmail',title:'Seguimiento · '+item.label,detail:'Hola, ¿podemos revisar el siguiente paso de nuestra propuesta? Quedo pendiente de tu disponibilidad. Borrador de ensayo para revisión humana.'});
          actions.push({...base,kind:'meeting',destination:'calendar',title:'Revisar próximos pasos · '+item.label,detail:'Propuesta para las 10:00, Europe/Madrid. Disponibilidad sin comprobar; no se envía invitación.'});
        }
        const proposal:ActionProposal={id:randomUUID(),runId:run.id,captureId:capture.id+':'+capture.capturedAt,revision,contentHash:'',dealId:item.id,label:item.label,reason:item.reason,
          evidence:[{entity:'deals',id:item.id,label:item.label},...(contact?[{entity:'contacts' as const,id:contact.id,label:label(contact,spec)}]:[])],actions,
          status:'review',createdAt:now.toISOString(),approvedAt:null,completedAt:null,error:null};
        proposal.contentHash=contentHash(proposal);proposals.push(proposal);
      }
      step();if(this.revision()!==revision)throw new AppError(409,'El espacio cambió durante el análisis.');
      state.proposals=[...proposals,...state.proposals];run.proposals=proposals.length;run.status='succeeded';
      run.message=proposals.length?'Propuestas preparadas con reglas explícitas. Sin IA ni llamadas externas.':'No hay propuestas nuevas para esta revisión. Las tareas de seguimiento ya previstas se han respetado.';
    } catch(error){run.status='failed';run.message=error instanceof AppError?error.message:'No se completó el análisis. Se conserva el espacio de trabajo.';}
    run.completedAt=this.clock().toISOString();this.save(state);return run;
  }
  private proposal(state:AgentState,id:string) {
    this.assertAvailable();const p=state.proposals.find(p=>p.id===id);if(!p)throw new AppError(404,'Propuesta no encontrada.');return p;
  }
  private assertFresh(p:ActionProposal, expected:string) {
    if(p.revision!==this.revision()||p.contentHash!==contentHash(p)||expected!==p.contentHash)throw new AppError(409,'La propuesta o los datos cambiaron. Ejecuta de nuevo el análisis y revisa la nueva propuesta.');
  }
  approve(id:string,expected:string) {
    const state=this.state(),p=this.proposal(state,id);this.assertFresh(p,expected);
    if(!['review','approved'].includes(p.status))throw new AppError(409,'Esta propuesta ya fue resuelta.');
    p.status='approved';p.approvedAt=this.clock().toISOString();this.save(state);return p;
  }
  reject(id:string) {
    const state=this.state(),p=this.proposal(state,id);
    if(!['review','approved'].includes(p.status))throw new AppError(409,'Esta propuesta ya fue resuelta.');
    p.status='rejected';p.approvedAt=null;this.save(state);return p;
  }
  execute(id:string,expected:string) {
    const state=this.state(),p=this.proposal(state,id);this.assertFresh(p,expected);
    if(p.status==='verified')return p;
    if(p.status!=='approved'||!p.approvedAt)throw new AppError(409,'Aprueba la propuesta antes de ejecutarla en simulación.');
    if(this.clock().getTime()-Date.parse(p.approvedAt)>86400_000)throw new AppError(409,'La aprobación caducó. Rechaza esta propuesta y vuelve a analizar.');
    if(state.runs.some(r=>r.status==='running'))throw new AppError(409,'Ya hay una ejecución en curso.');
    const started=this.clock();
    const execution:AgentRun={id:randomUUID(),status:'running',startedAt:started.toISOString(),completedAt:null,revision:p.revision,proposals:1,toolCalls:0,costUsd:0,message:'Ejecutando propuesta aprobada en destinos simulados.'};
    state.runs=[execution,...state.runs].slice(0,50);
    p.status='applying';this.save(state);
    try {
      for(const action of p.actions){
        const key=p.id+':'+action.kind;
        if(state.artifacts.some(a=>a.key===key))continue;
        if(++execution.toolCalls>LIMITS.maxToolCalls||this.clock().getTime()-started.getTime()>LIMITS.maxDurationSeconds*1000)throw new Error('Límite de ejecución');
        const artifact=this.adapter.apply(key,p.id,action,state.artifacts);
        if(artifact.key!==key||artifact.proposalId!==p.id||hash(artifact.action)!==hash(action))throw new Error('Resultado no coincide');
        state.artifacts.push(artifact);this.save(state);
        const persisted=this.state().artifacts.find(a=>a.key===key);
        if(!persisted||hash(persisted.action)!==hash(action))throw new Error('No se confirmó la persistencia');
      }
      p.status='verified';p.completedAt=this.clock().toISOString();execution.status='succeeded';execution.message='Resultados de la simulación comprobados. Sin cambios en CRM ni servicios externos.';
    }catch{p.status='uncertain';p.error='Resultado simulado incompleto o incierto. Revisa los artefactos conservados; no se reintentará automáticamente.';execution.status='failed';execution.message=p.error;}
    execution.completedAt=this.clock().toISOString();
    this.save(state);return p;
  }
  integrations():IntegrationCapability[] {
    return [
      {id:'hubspot',label:'HubSpot',mode:this.runtime?'unavailable':this.store.get('hubspotConnection',null)?'readonly':'simulation',description:'La conexión existente conserva su alcance. El agente usa únicamente el ensayo local.',actions:['Lectura existente','Capturas conciliadas']},
      ...(['gmail','calendar','drive','docs','sheets'] as const).map(id=>({id,label:({gmail:'Gmail',calendar:'Google Calendar',drive:'Google Drive',docs:'Google Docs',sheets:'Google Sheets'})[id],mode:!this.runtime&&['gmail','calendar'].includes(id)?'simulation' as const:'unavailable' as const,
        description:['gmail','calendar'].includes(id)?'Adaptador de ensayo. Sin OAuth, envío ni acceso a una cuenta.':'Herramientas disponibles en el espacio comercial de equipo. Requieren su conexión y revisión propias.',actions:id==='gmail'?['Mensaje simulado']:id==='calendar'?['Propuesta de reunión simulada']:[]}))
    ];
  }
}
