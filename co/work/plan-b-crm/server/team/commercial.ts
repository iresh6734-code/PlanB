import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../store.js';
import { CommercialContentSchema, type CommercialContent, type CommercialEvidence, type CommercialProposal, type SheetSelection } from '../../shared/commercial.js';
import type { TeamPrincipal } from '../../shared/team.js';
import { validateRecord,type AppSpec,type CrmRecord } from '../../shared/model.js';
import type { Sql } from './database.js';
import { digest, TeamRepository } from './repository.js';
import type { WorkspaceProvider } from './google.js';
import { followupDraft } from '../../shared/followup-draft.js';
import type { CrmSnapshot } from '../../shared/model.js';
import { googleIntegrationStatus,type IntegrationOperation } from '../../shared/integration-status.js';
import { salesSource } from './sales-source.js';
import { FileLibrary } from './file-library.js';
/** Tiempo máximo entre aprobar y ejecutar. Las aprobaciones anteriores a esta regla no tienen fecha y no caducan por tiempo. */
const APPROVAL_TTL_MS=24*3600_000;
export class CommercialService {
  constructor(private repo:TeamRepository,private provider:WorkspaceProvider,private demo=false,private configured=false,private ownAccountOnly=false){}
  private checkRecipient(content:CommercialContent,account?:string){
    if(this.ownAccountOnly&&(content.email||content.meeting)&&(!account||content.recipient.trim().toLowerCase()!==account.trim().toLowerCase()))throw new AppError(403,'Este piloto solo permite enviar correos e invitaciones a la propia cuenta Google conectada. Puedes conservar cualquier destinatario en un borrador con Gmail y Calendar apagados.');
  }
  private async revision(sql:Sql,tenant:string){const records=(await sql.query('SELECT entity,id,version::text FROM team_records WHERE tenant_id=$1 ORDER BY entity,id',[tenant])).rows;const connection=(await sql.query('SELECT revision::text FROM team_google_connections WHERE tenant_id=$1',[tenant])).rows;const source=await salesSource(sql,tenant);return digest(JSON.stringify({records,connection,source:source?.snapshot.id,demo:this.demo}));}
  private hash(revision:string,content:CommercialContent){return digest(JSON.stringify({revision,content}));}
  async overview(tenant:string,user:TeamPrincipal){return this.repo.scoped(tenant,user,'read',async(sql,role)=>{
    // An interrupted external execution is never retried automatically. Un visor solo lee: lo concilia quien puede escribir.
    if(role!=='viewer')await sql.query("UPDATE team_sales_proposals SET status='uncertain',error='Ejecución interrumpida. Requiere conciliación; no se repetirá automáticamente.' WHERE tenant_id=$1 AND status IN ('executing','reconciling') AND started_at<$2",[tenant,new Date(this.repo.clock().getTime()-120000).toISOString()]);
    const proposals=(await sql.query<CommercialProposal>('SELECT id,contact_id,revision,content,content_hash,status,evidence,error,created_at,reconciliation,context FROM team_sales_proposals WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30',[tenant])).rows;
    const tasks=(await sql.query('SELECT id,title,due_at,status FROM team_sales_tasks WHERE tenant_id=$1 ORDER BY due_at LIMIT 30',[tenant])).rows;
    const connection=(await sql.query('SELECT account,revision::text FROM team_google_connections WHERE tenant_id=$1',[tenant])).rows[0]??null;
    const fileSource=await salesSource(sql,tenant);const links=(await sql.query('SELECT l.id,l.contact_id,l.file_id,l.name,l.mime_type FROM team_file_links l LEFT JOIN team_google_connections c ON c.tenant_id=l.tenant_id WHERE l.tenant_id=$1 AND l.source_key=$2 AND l.detached_at IS NULL AND (($3 AND l.account_subject=\'demo\') OR (NOT $3 AND l.account_subject=c.subject AND l.account=c.account)) ORDER BY l.name LIMIT 100',[tenant,fileSource?.key??'',this.demo])).rows;
    // Do not attribute another tenant's, another account's or legacy anonymous
    // execution evidence to the current connection. No token is read here.
    const operations=(await sql.query<IntegrationOperation>(`SELECT p.id,p.started_at,p.evidence FROM team_sales_proposals p JOIN team_google_connections c ON c.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.execution_account->>'subject'=c.subject AND p.execution_account->>'account'=c.account ORDER BY p.started_at DESC NULLS LAST LIMIT 100`,[tenant])).rows;
    const integrations=googleIntegrationStatus(this.demo,this.configured,!!connection,operations);
    const source=await salesSource(sql,tenant),contacts=source?.records.filter(r=>r.entity==='contacts')??[];
    return {demo:this.demo,configured:this.configured,ownAccountOnly:this.ownAccountOnly,connection,integrations,proposals,tasks,files:[],links,contacts,source:source?{id:source.snapshot.id,origin:source.origin,isTestData:source.snapshot.source.isTestData}:null};
  });}
  async prepare(tenant:string,user:TeamPrincipal,contactId:string,agent?:{id:string;draft:{subject:string;body:string};provider?:'copilot'|'ollama';verify?:(sql:Sql)=>Promise<void>},intent?:{sourceKey:string;internalOnly:boolean},requestId?:string){return this.repo.scoped(tenant,user,'write',async sql=>{
    if(agent?.verify){await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);await agent.verify(sql);}
    // Un id de petición (o el del borrador del agente) es una clave de idempotencia: repetirlo devuelve la propuesta existente sin tocarla.
    const wantedId=agent?.id??requestId;
    // Los ids de ejecuciones del agente son suyos: una petición ajena no puede adelantarse con uno de ellos.
    if(requestId&&!agent&&(await sql.query('SELECT 1 FROM team_copilot_runs WHERE tenant_id=$1 AND id=$2',[tenant,requestId])).rows.length)throw new AppError(409,'Ese identificador está reservado.');
    if(wantedId){const existing=(await sql.query<{id:string;contact_id:string}>('SELECT id,contact_id FROM team_sales_proposals WHERE tenant_id=$1 AND id=$2',[tenant,wantedId])).rows[0];if(existing){if(existing.contact_id!==contactId)throw new AppError(409,'La propuesta pertenece a otro contacto.');return {id:existing.id};}}
    const blueprint=await salesSource(sql,tenant);if(!blueprint)throw new AppError(409,'Captura HubSpot o instala datos antes de preparar el seguimiento.');
    if(intent&&intent.sourceKey!==blueprint.key)throw new AppError(409,'La fuente comercial cambió. Abre la ficha de la fuente activa.');
    const record=blueprint.records.find(r=>r.entity==='contacts'&&r.id===contactId);if(!record)throw new AppError(404,'El contacto no pertenece a la fuente comercial de esta empresa.');
    const c=record.values,recipient=String(c.email??'');if(!z.email().safeParse(recipient).success)throw new AppError(422,'El contacto necesita un correo válido para preparar el seguimiento.');
    const draft=followupDraft(record,blueprint.records,blueprint.spec,blueprint.snapshot.links);
    draft.context.push({label:'Origen',value:blueprint.snapshot.source.isTestData?'Datos ficticios':'Captura CRM autorizada'});
    const start=new Date(this.repo.clock().getTime()+2*86400000);start.setUTCHours(10,0,0,0);const end=new Date(start.getTime()+30*60000),name=String(c.firstname??contactId);
    const content=CommercialContentSchema.parse({recipient,subject:draft.subject,body:draft.body,emailFormat:'html',signature:'',email:true,meeting:true,document:true,spreadsheet:false,start:start.toISOString(),end:end.toISOString(),timeZone:'Europe/Madrid',reportRows:[['Campo','Detalle'],...draft.context.map(item=>[item.label,item.value]),['Próxima acción','Revisar el seguimiento y acordar el siguiente paso'],['Estado','Pendiente de revisión humana']],documentTitle:'Propuesta comercial · '+name,documentBody:'Propuesta comercial\n\nCliente: '+name+' '+String(c.lastname??'')+'\n\nObjetivo\nRevisar necesidades, alcance y próximos pasos.\n\nAlcance y condiciones\nPendientes de acordar con el cliente.\n\nEsta propuesta debe revisarse antes de compartirla.'});
    if(this.ownAccountOnly||intent?.internalOnly){content.email=false;content.meeting=false;content.document=false;content.spreadsheet=false;}
    if(agent){content.subject=agent.draft.subject;content.body=agent.draft.body;content.email=false;content.meeting=false;content.document=false;content.spreadsheet=false;CommercialContentSchema.parse(content);draft.context.push({label:'Borrador',value:(agent.provider==='ollama'?'Modelo local Ollama':'Copilot Studio')+' · revisión humana pendiente'});}
    const revision=await this.revision(sql,tenant),id=wantedId??randomUUID();const inserted=await sql.query('INSERT INTO team_sales_proposals(tenant_id,id,contact_id,revision,content,content_hash,context) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) ON CONFLICT(tenant_id,id) DO NOTHING RETURNING id',[tenant,id,contactId,revision,JSON.stringify(content),this.hash(revision,content),JSON.stringify(draft.context)]);
    if(inserted.rows.length)await this.repo.audit(sql,tenant,user.uid,'commercial.prepare',id);
    else{const raced=(await sql.query<{contact_id:string}>('SELECT contact_id FROM team_sales_proposals WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];if(raced&&raced.contact_id!==contactId)throw new AppError(409,'La propuesta pertenece a otro contacto.');}
    return {id};
  });}
  async edit(tenant:string,user:TeamPrincipal,id:string,raw:unknown){const content=CommercialContentSchema.parse(raw);return this.repo.scoped(tenant,user,'write',async sql=>{
    const revision=await this.revision(sql,tenant),hash=this.hash(revision,content);const result=await sql.query("UPDATE team_sales_proposals SET content=$3::jsonb,revision=$4,content_hash=$5,status='draft',approved_by=NULL,approved_at=NULL WHERE tenant_id=$1 AND id=$2 AND status IN ('draft','approved') RETURNING id",[tenant,id,JSON.stringify(content),revision,hash]);if(!result.rows.length)throw new AppError(409,'La propuesta ya no admite edición.');return {contentHash:hash};
  });}
  async approve(tenant:string,user:TeamPrincipal,id:string,hash:string){return this.repo.scoped(tenant,user,'write',async sql=>{
    const row=(await sql.query<CommercialProposal>('SELECT * FROM team_sales_proposals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];if(!row||row.status!=='draft'||row.content_hash!==hash||row.revision!==await this.revision(sql,tenant))throw new AppError(409,'La propuesta o sus datos cambiaron. Guarda y revisa la versión actual.');
    const content=CommercialContentSchema.parse(row.content);if(content.meeting&&Date.parse(content.start)<=this.repo.clock().getTime())throw new AppError(422,'Elige una reunión futura antes de aprobar.');if(!this.demo&&(content.email||content.meeting||content.document||content.spreadsheet)&&!(await sql.query('SELECT tenant_id FROM team_google_connections WHERE tenant_id=$1',[tenant])).rows.length)throw new AppError(409,'Conecta Google antes de aprobar acciones externas.');
    const account=(await sql.query<{account:string}>('SELECT account FROM team_google_connections WHERE tenant_id=$1',[tenant])).rows[0]?.account;this.checkRecipient(content,account);
    await sql.query("UPDATE team_sales_proposals SET status='approved',approved_by=$3,approved_at=$4 WHERE tenant_id=$1 AND id=$2",[tenant,id,user.uid,this.repo.clock().toISOString()]);await this.repo.audit(sql,tenant,user.uid,'commercial.approve',id);return {approved:true};
  });}
  async execute(tenant:string,user:TeamPrincipal,id:string,hash:string){
    const proposal=await this.repo.scoped(tenant,user,'jobs',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      if((await sql.query("SELECT id FROM team_copilot_runs WHERE tenant_id=$1 AND status='running' AND created_at>$2",[tenant,new Date(this.repo.clock().getTime()-120000).toISOString()])).rows.length)throw new AppError(409,'Ya hay un análisis en curso para esta empresa.');
      const connection=(await sql.query<{revision:string;account:string;subject:string}>('SELECT revision::text,account,subject FROM team_google_connections WHERE tenant_id=$1 FOR UPDATE',[tenant])).rows[0];
      const row=(await sql.query<CommercialProposal>('SELECT * FROM team_sales_proposals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];if(row?.status==='verified'&&row.content_hash===hash)return null;
      if(!row||row.status!=='approved'||row.content_hash!==hash||row.revision!==await this.revision(sql,tenant))throw new AppError(409,'Revisa y aprueba la propuesta actual. Las ejecuciones inciertas no se repiten.');
      // Una aprobación no es un permiso permanente: caduca a las 24 h y la reunión debe seguir en el futuro en el momento de ejecutar.
      const approvedValue=(row as CommercialProposal&{approved_at?:string|Date|null}).approved_at,approvedAt=approvedValue?new Date(approvedValue).getTime():null,approvedContent=CommercialContentSchema.parse(row.content);
      if(approvedAt!==null&&this.repo.clock().getTime()-approvedAt>APPROVAL_TTL_MS)throw new AppError(409,'La aprobación caducó (24 horas). Revisa la propuesta y vuelve a aprobarla.');
      if(approvedContent.meeting&&Date.parse(approvedContent.start)<=this.repo.clock().getTime())throw new AppError(409,'La reunión ya pasó. Cambia la fecha y vuelve a aprobar la propuesta.');
      if((await sql.query("SELECT id FROM team_sales_proposals WHERE tenant_id=$1 AND status IN ('executing','reconciling')",[tenant])).rows.length||(await sql.query("SELECT id FROM team_jobs WHERE tenant_id=$1 AND status='running' AND lease_until>now()",[tenant])).rows.length)throw new AppError(409,'Ya hay un trabajo en curso para esta empresa.');
      this.checkRecipient(CommercialContentSchema.parse(row.content),connection?.account);
      await sql.query("UPDATE team_sales_proposals SET status='executing',started_at=$3,execution_account=$4::jsonb WHERE tenant_id=$1 AND id=$2",[tenant,id,this.repo.clock().toISOString(),connection?JSON.stringify({account:connection.account,subject:connection.subject}):null]);await this.repo.audit(sql,tenant,user.uid,'commercial.execute',id);return {...row,googleRevision:connection?.revision};
    });if(!proposal)return {status:'verified'};
    const content=CommercialContentSchema.parse(proposal.content),evidence:CommercialEvidence[]=[];
    const save=async(item:CommercialEvidence)=>{const existing=evidence.findIndex(e=>e.step===item.step);if(existing<0)evidence.push(item);else evidence[existing]=item;await this.repo.system(tenant,async sql=>{await sql.query('UPDATE team_sales_proposals SET evidence=$3::jsonb WHERE tenant_id=$1 AND id=$2',[tenant,id,JSON.stringify(evidence)]);});};
    try {
      const task=await this.repo.system(tenant,async sql=>{const taskId=randomUUID();await sql.query('INSERT INTO team_sales_tasks VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,proposal_id) DO NOTHING',[tenant,taskId,id,'Seguimiento · '+content.subject,proposal.contact_id,content.start,'open']);return (await sql.query<{id:string}>('SELECT id FROM team_sales_tasks WHERE tenant_id=$1 AND proposal_id=$2',[tenant,id])).rows[0];});
      await save({step:'task',status:'verified',remoteId:task.id,detail:'Tarea interna guardada en Plan B; no enviada al CRM.'});
      await this.provider.execute(tenant,id,hash,content,save,proposal.googleRevision);
      const completed=await this.repo.system(tenant,async sql=>{const result=await sql.query("UPDATE team_sales_proposals SET status='verified',error=NULL WHERE tenant_id=$1 AND id=$2 AND status='executing' RETURNING id",[tenant,id]);if(result.rows.length)await this.repo.audit(sql,tenant,user.uid,'commercial.verified',id);return result.rows.length>0;});return {status:completed?'verified':'uncertain'};
    }catch{await this.repo.system(tenant,sql=>sql.query("UPDATE team_sales_proposals SET status='uncertain',error=$3 WHERE tenant_id=$1 AND id=$2",[tenant,id,'Ejecución incompleta. Consulta las evidencias y concilia el resultado antes de actuar fuera de Plan B. No se reintentará automáticamente.']));return {status:'uncertain'};}
  }
  async reconcile(tenant:string,user:TeamPrincipal,id:string,hash:string){
    const proposal=await this.repo.scoped(tenant,user,'jobs',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      const row=(await sql.query<CommercialProposal&{execution_account:{account:string;subject:string}|null}>('SELECT * FROM team_sales_proposals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];
      if(row?.status==='verified'&&row.content_hash===hash)return null;
      if(!row||row.status!=='uncertain'||row.content_hash!==hash)throw new AppError(409,'Solo puede comprobarse la versión incierta revisada.');
      if(!this.provider.reconcile)throw new AppError(409,'Este conector necesita una conciliación humana.');
      if((await sql.query("SELECT id FROM team_sales_proposals WHERE tenant_id=$1 AND status IN ('executing','reconciling')",[tenant])).rows.length||(await sql.query("SELECT id FROM team_jobs WHERE tenant_id=$1 AND status='running' AND lease_until>now()",[tenant])).rows.length)throw new AppError(409,'Ya hay un trabajo en curso para esta empresa.');
      const content=CommercialContentSchema.parse(row.content);
      const connection=(await sql.query<{revision:string;account:string;subject:string}>('SELECT revision::text,account,subject FROM team_google_connections WHERE tenant_id=$1 FOR UPDATE',[tenant])).rows[0];
      if(!this.demo&&(content.email||content.meeting||content.document||content.spreadsheet)&&(!row.execution_account||!connection||row.execution_account.account!==connection.account||row.execution_account.subject!==connection.subject))throw new AppError(409,'Conecta la misma cuenta utilizada en la ejecución. Si no se conserva su identidad, requiere revisión humana.');
      await sql.query("UPDATE team_sales_proposals SET status='reconciling',started_at=$3 WHERE tenant_id=$1 AND id=$2",[tenant,id,this.repo.clock().toISOString()]);await this.repo.audit(sql,tenant,user.uid,'commercial.reconcile',id);return {...row,googleRevision:connection?.revision};
    });if(!proposal)return {status:'verified'};
    try{
      const content=CommercialContentSchema.parse(proposal.content);
      const result=await this.provider.reconcile!(tenant,id,hash,content,proposal.evidence,proposal.googleRevision);
      return await this.repo.system(tenant,async sql=>{
        const task=(await sql.query<{id:string}>('SELECT id FROM team_sales_tasks WHERE tenant_id=$1 AND proposal_id=$2',[tenant,id])).rows[0];
        const evidence=result.evidence.filter(e=>e.step!=='task');if(task)evidence.unshift({step:'task',status:'verified',remoteId:task.id,detail:'Tarea interna existente comprobada; no enviada al CRM.'});
        const complete=!!task&&(['email','meeting','document','spreadsheet'] as const).every(step=>!content[step]||evidence.some(e=>e.step===step&&!!e.remoteId&&e.status===(step==='email'?'accepted':'verified')));
        const status=complete?'verified':'uncertain',reconciliation={at:this.repo.clock().toISOString(),notes:result.notes};
        const updated=await sql.query("UPDATE team_sales_proposals SET status=$3,evidence=$4::jsonb,reconciliation=$5::jsonb,error=$6 WHERE tenant_id=$1 AND id=$2 AND status='reconciling' RETURNING id",[tenant,id,status,JSON.stringify(evidence),JSON.stringify(reconciliation),complete?null:'Faltan resultados por confirmar. Consulta las comprobaciones; no se ha repetido ninguna acción.']);
        if(updated.rows.length)await this.repo.audit(sql,tenant,user.uid,complete?'commercial.reconciled':'commercial.unresolved',id);return {status:updated.rows.length?status:'uncertain'};
      });
    }catch{await this.repo.system(tenant,sql=>sql.query("UPDATE team_sales_proposals SET status='uncertain',error=$3 WHERE tenant_id=$1 AND id=$2 AND status='reconciling'",[tenant,id,'La comprobación no se completó. Los resultados siguen pendientes; no se han repetido acciones.']));return {status:'uncertain'};}
  }
  async files(tenant:string,user:TeamPrincipal){return (await new FileLibrary(this.repo,this.provider,this.demo).page(tenant,user)).files;}
  async linkFile(tenant:string,user:TeamPrincipal,contactId:string,fileId:string){return new FileLibrary(this.repo,this.provider,this.demo).linkMany(tenant,user,contactId,[fileId]);}
  async document(tenant:string,user:TeamPrincipal,id:string){return new FileLibrary(this.repo,this.provider,this.demo).document(tenant,user,id);}
  async preview(tenant:string,user:TeamPrincipal,selection:SheetSelection){await this.repo.scoped(tenant,user,'write',async()=>{});const values=await this.provider.sheet(tenant,selection.fileId,selection.range);return this.repo.scoped(tenant,user,'write',async sql=>{
    const records=(await sql.query<{value:CrmRecord}>('SELECT value FROM team_records WHERE tenant_id=$1 AND entity=$2',[tenant,'contacts'])).rows,emails=new Set(records.map(r=>String(r.value.values.email??'').trim().toLowerCase()));
    const blueprint=(await sql.query<{blueprint:{spec:AppSpec}}>('SELECT blueprint FROM team_spaces WHERE id=$1',[tenant])).rows[0].blueprint;
    const rows=values.slice(1,101).map((row,index)=>{const email=(row[selection.mapping.email]??'').trim().toLowerCase().slice(0,254),firstname=(row[selection.mapping.firstname]??'').trim().slice(0,200);const values={firstname,lastname:selection.mapping.lastname===undefined?'':(row[selection.mapping.lastname]??'').slice(0,100),email,phone:selection.mapping.phone===undefined?'':(row[selection.mapping.phone]??'').slice(0,100)};const invalid=!z.email().safeParse(email).success||!firstname||firstname.length>100||!blueprint||Object.keys(validateRecord(blueprint.spec,{entity:'contacts',id:'preview',values})).length>0;const status=invalid?'invalid':emails.has(email)?'duplicate':'ready';if(!invalid)emails.add(email);return {row:index+2,status,values,operationId:randomUUID(),recordId:'sheet-'+randomUUID()};});
    // Las vistas previas pendientes se limpian a las 24 h y solo se conservan las 20 más recientes por empresa (nunca bloquea al usuario).
    await sql.query("DELETE FROM team_sheet_previews WHERE tenant_id=$1 AND status='review' AND created_at<now()-interval '24 hours'",[tenant]);
    await sql.query("DELETE FROM team_sheet_previews WHERE tenant_id=$1 AND status='review' AND id IN (SELECT id FROM team_sheet_previews WHERE tenant_id=$1 AND status='review' ORDER BY created_at DESC OFFSET 19)",[tenant]);
    const id=randomUUID(),content={selection,headers:values[0]??[],rows},contentHash=digest(JSON.stringify(content));await sql.query('INSERT INTO team_sheet_previews VALUES($1,$2,$3::jsonb,$4,$5)',[tenant,id,JSON.stringify(content),contentHash,'review']);return {id,contentHash,...content};
  });}
  async importSheet(tenant:string,user:TeamPrincipal,id:string,hash:string){return this.repo.scoped(tenant,user,'write',async sql=>{
    await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);const preview=(await sql.query<{content:any;content_hash:string;status:string}>('SELECT content,content_hash,status FROM team_sheet_previews WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];if(!preview||preview.content_hash!==hash)throw new AppError(409,'La vista previa cambió. Revísala de nuevo.');if(preview.status==='imported')return {alreadyImported:true};
    const existing=new Set((await sql.query<{email:string}>("SELECT lower(value->'values'->>'email') email FROM team_records WHERE tenant_id=$1 AND entity='contacts'",[tenant])).rows.map(r=>r.email));let imported=0;
    for(const row of preview.content.rows){if(row.status!=='ready'||existing.has(row.values.email))continue;const result=await this.repo.apply(sql,tenant,'00000000-0000-0000-0000-000000000000',user.uid,{id:row.operationId,entity:'contacts',recordId:row.recordId,baseVersion:0,values:row.values});if(result.status!=='applied')throw new AppError(409,'No se pudo conciliar la importación.');existing.add(row.values.email);imported++;}
    await sql.query("UPDATE team_sheet_previews SET status='imported' WHERE tenant_id=$1 AND id=$2",[tenant,id]);await this.repo.audit(sql,tenant,user.uid,'sheets.import',id);return {imported};
  });}
}
