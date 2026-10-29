import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { seal, open } from '../crypto.js';
import { AppError } from '../store.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { CommercialContent, CommercialEvidence, CommercialReconciliation, WorkspaceFile,WorkspaceFilePage } from '../../shared/commercial.js';
import { digest, TeamRepository } from './repository.js';
import { commercialMime } from './email-mime.js';
import { commercialReportRows,commercialReportRange } from '../../shared/commercial-report.js';
import { documentRequests,spreadsheetPayload } from './google-presentation.js';
export const googleScopes=['openid','email','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/calendar.events.owned','https://www.googleapis.com/auth/calendar.freebusy','https://www.googleapis.com/auth/drive.file'];
export interface GoogleConfig {clientId:string;clientSecret:string;redirectUri:string;encryptionKey:Buffer;pickerEnabled?:boolean;}
interface Tokens {access_token:string;refresh_token:string;expires_in:number;scope:string;id_token?:string;}
const tokenSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().optional(),expires_in:z.number().positive(),scope:z.string().optional(),id_token:z.string().optional()});
const fileSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),name:z.string().min(1).max(1000),mimeType:z.enum(['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet']),trashed:z.literal(false).optional()});
export interface WorkspaceProvider {
  execute(tenant:string,id:string,hash:string,content:CommercialContent,save:(e:CommercialEvidence)=>Promise<void>,expectedConnection?:string):Promise<void>;
  files(tenant:string):Promise<WorkspaceFile[]>;sheet(tenant:string,id:string,range:string):Promise<string[][]>;
  filePage?(tenant:string,cursor?:string,expectedConnection?:string):Promise<WorkspaceFilePage>;
  file?(tenant:string,id:string,expectedConnection?:string):Promise<WorkspaceFile>;
  document?(tenant:string,id:string,expectedConnection?:string):Promise<string>;
  reconcile?(tenant:string,id:string,hash:string,content:CommercialContent,evidence:CommercialEvidence[],expectedConnection?:string):Promise<CommercialReconciliation>;
}
class GoogleRequestError extends Error {constructor(public status:number){super('Google no completó la operación.');}}
export class GoogleWorkspace implements WorkspaceProvider {
  constructor(private repo:TeamRepository,private config:GoogleConfig|null,private fetcher:typeof fetch=fetch,private verify?:(idToken:string)=>Promise<{email:string;sub:string;email_verified:boolean}>){ }
  configured(){return !!this.config&&this.config.encryptionKey.length===32;}
  private settings(){if(!this.configured())throw new AppError(503,'Google Workspace necesita una autorización propia en este despliegue.');return this.config!;}
  async begin(tenant:string,user:TeamPrincipal,email:string){const config=this.settings();return this.repo.scoped(tenant,user,'connections',async sql=>{
    const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
    await sql.query('DELETE FROM team_google_states WHERE tenant_id=$1 AND expires_at<=now()',[tenant]);
    await sql.query('INSERT INTO team_google_states(tenant_id,id,user_id,account,verifier,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[tenant,digest(state),user.uid,email.toLowerCase(),seal(verifier,config.encryptionKey),new Date(this.repo.clock().getTime()+600000).toISOString()]);
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:googleScopes.join(' '),state,access_type:'offline',prompt:'consent',include_granted_scopes:'false',login_hint:email,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();return {url:url.href,state};
  });}
  private async token(body:URLSearchParams){const r=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new AppError(502,'Google no aceptó la autorización. Vuelve a conectar.');return tokenSchema.parse(await r.json());}
  async complete(tenant:string,user:TeamPrincipal,state:string,code:string){const config=this.settings();const pending=await this.repo.scoped(tenant,user,'connections',async sql=>{
    const row=(await sql.query<{account:string;verifier:string}>('UPDATE team_google_states SET consumed=true WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND consumed=false AND expires_at>$4 RETURNING account,verifier',[tenant,digest(state),user.uid,this.repo.clock().toISOString()])).rows[0];if(!row)throw new AppError(409,'La autorización caducó, ya se usó o corresponde a otra empresa.');return row;
  });
    const tokens=await this.token(new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code,code_verifier:open(pending.verifier,config.encryptionKey)}));
    if(!tokens.id_token||!tokens.refresh_token||!googleScopes.filter(s=>s.startsWith('https://')).every(s=>(tokens.scope??'').split(' ').includes(s)))throw new AppError(403,'Google no concedió todos los permisos seleccionados.');
    const identity=this.verify?await this.verify(tokens.id_token):await new OAuth2Client(config.clientId).verifyIdToken({idToken:tokens.id_token,audience:config.clientId}).then(t=>t.getPayload());
    if(!identity?.sub||!identity.email_verified||identity.email?.toLowerCase()!==pending.account)throw new AppError(403,'La cuenta autorizada no coincide con la revisada.');
    return this.repo.scoped(tenant,user,'connections',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      if(!(await sql.query('SELECT id FROM team_google_states WHERE tenant_id=$1 AND id=$2 AND consumed=true FOR UPDATE',[tenant,digest(state)])).rows.length)throw new AppError(409,'La conexión fue retirada durante la autorización.');
      await sql.query('INSERT INTO team_google_connections(tenant_id,account,subject,revision,secret,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id) DO UPDATE SET account=excluded.account,subject=excluded.subject,revision=excluded.revision,secret=excluded.secret,expires_at=excluded.expires_at',[tenant,pending.account,identity.sub,randomUUID(),seal(JSON.stringify(tokens),config.encryptionKey),new Date(this.repo.clock().getTime()+tokens.expires_in*1000).toISOString()]);await sql.query('DELETE FROM team_google_file_connections WHERE tenant_id=$1 AND (account<>$2 OR subject<>$3)',[tenant,pending.account,identity.sub]);await sql.query('DELETE FROM team_google_picker_states WHERE tenant_id=$1',[tenant]);await this.repo.audit(sql,tenant,user.uid,'google.authorized',pending.account);return {connected:true};
    });
  }
  async disconnect(tenant:string,user:TeamPrincipal){return this.repo.scoped(tenant,user,'connections',async sql=>{await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);await sql.query('DELETE FROM team_google_connections WHERE tenant_id=$1',[tenant]);await sql.query('DELETE FROM team_google_states WHERE tenant_id=$1',[tenant]);await sql.query('DELETE FROM team_google_file_connections WHERE tenant_id=$1',[tenant]);await sql.query('DELETE FROM team_google_picker_states WHERE tenant_id=$1',[tenant]);await sql.query("UPDATE team_sales_proposals SET status='draft',approved_by=NULL WHERE tenant_id=$1 AND status='approved'",[tenant]);await this.repo.audit(sql,tenant,user.uid,'google.disconnect','workspace');return {disconnected:true};});}
  private async access(tenant:string,expectedConnection?:string){const config=this.settings();return this.repo.system(tenant,async sql=>{
    const row=(await sql.query<{secret:string;expires_at:string;revision:string}>('SELECT secret,expires_at,revision::text FROM team_google_connections WHERE tenant_id=$1 FOR UPDATE',[tenant])).rows[0];if(!row)throw new AppError(409,'Conecta Google Workspace antes de ejecutar acciones reales.');
    if(expectedConnection&&row.revision!==expectedConnection)throw new AppError(409,'La conexión cambió durante la ejecución.');
    let tokens=JSON.parse(open(row.secret,config.encryptionKey)) as Tokens;
    if(new Date(row.expires_at).getTime()-this.repo.clock().getTime()<60000){const next=await this.token(new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,client_secret:config.clientSecret,refresh_token:tokens.refresh_token}));tokens={...tokens,...next,scope:next.scope??tokens.scope,refresh_token:next.refresh_token??tokens.refresh_token};await sql.query('UPDATE team_google_connections SET secret=$2,expires_at=$3 WHERE tenant_id=$1',[tenant,seal(JSON.stringify(tokens),config.encryptionKey),new Date(this.repo.clock().getTime()+tokens.expires_in*1000).toISOString()]);}return tokens.access_token;
  });}
  private async request(tenant:string,url:string,method='GET',body?:unknown,deadline?:AbortSignal,expectedConnection?:string,fileOnly=false){deadline?.throwIfAborted();const origin=new URL(url).origin;if(!['https://www.googleapis.com','https://gmail.googleapis.com','https://docs.googleapis.com','https://sheets.googleapis.com'].includes(origin))throw new AppError(403,'Destino Google no permitido.');const token=fileOnly?await this.fileAccess(tenant,expectedConnection):await this.access(tenant,expectedConnection);const r=await this.fetcher(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:deadline?AbortSignal.any([deadline,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});if(!r.ok)throw new GoogleRequestError(r.status);return r.json();}
  private async fileAccess(tenant:string,expectedConnection?:string){
    const fallback=await this.access(tenant,expectedConnection),config=this.settings();
    return this.repo.system(tenant,async sql=>{
      const row=(await sql.query<{secret:string;expires_at:string}>("SELECT f.secret,f.expires_at FROM team_google_file_connections f JOIN team_google_connections c ON c.tenant_id=f.tenant_id AND c.account=f.account AND c.subject=f.subject WHERE f.tenant_id=$1 FOR UPDATE OF f",[tenant])).rows[0];
      if(!row)return fallback;
      let tokens=JSON.parse(open(row.secret,config.encryptionKey)) as Tokens;
      if(new Date(row.expires_at).getTime()-this.repo.clock().getTime()<60000){
        const next=await this.token(new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,client_secret:config.clientSecret,refresh_token:tokens.refresh_token}));
        if(next.scope&&next.scope!=='https://www.googleapis.com/auth/drive.file')throw new AppError(403,'La autorización de archivos cambió de alcance.');
        tokens={...tokens,...next,refresh_token:next.refresh_token??tokens.refresh_token,scope:next.scope??tokens.scope};
        await sql.query('UPDATE team_google_file_connections SET secret=$2,expires_at=$3 WHERE tenant_id=$1',[tenant,seal(JSON.stringify(tokens),config.encryptionKey),new Date(this.repo.clock().getTime()+tokens.expires_in*1000).toISOString()]);
      }
      return tokens.access_token;
    });
  }
  async files(tenant:string):Promise<WorkspaceFile[]>{return (await this.filePage(tenant)).files;}
  async filePage(tenant:string,cursor?:string,expectedConnection?:string):Promise<WorkspaceFilePage>{
    const url=new URL('https://www.googleapis.com/drive/v3/files');url.search=new URLSearchParams({pageSize:'50',fields:'files(id,name,mimeType,trashed),nextPageToken',orderBy:'name',q:"trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet')",...(cursor?{pageToken:cursor}:{})}).toString();
    const data=await this.request(tenant,url.href,'GET',undefined,undefined,expectedConnection,true);
    const page=z.object({files:z.array(fileSchema).max(50),nextPageToken:z.string().max(2048).optional()}).parse(data);
    return {files:page.files.map(({id,name,mimeType})=>({id,name,mimeType})),nextPageToken:page.nextPageToken};
  }
  async file(tenant:string,id:string,expectedConnection?:string):Promise<WorkspaceFile>{
    const value=fileSchema.parse(await this.request(tenant,'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,trashed','GET',undefined,undefined,expectedConnection,true));
    if(value.id!==id)throw new AppError(403,'El archivo no coincide con la selección.');return {id:value.id,name:value.name,mimeType:value.mimeType};
  }
  async document(tenant:string,id:string,expectedConnection?:string){const data=await this.request(tenant,'https://docs.googleapis.com/v1/documents/'+encodeURIComponent(id),'GET',undefined,undefined,expectedConnection,true);return (data.body?.content??[]).flatMap((p:any)=>p.paragraph?.elements??[]).map((e:any)=>e.textRun?.content??'').join('').slice(0,20000);}
  async reconcile(tenant:string,id:string,hash:string,content:CommercialContent,previous:CommercialEvidence[],expectedConnection?:string):Promise<CommercialReconciliation>{
    // Remote read failures must not retain an old verified result as current proof.
    const evidence=structuredClone(previous).map(e=>e.step==='email'||e.step==='task'?e:{...e,status:'accepted' as const,detail:'Referencia conservada; comprobación actual pendiente.'}),notes:string[]=[],deadline=AbortSignal.timeout(60000);
    const read=(url:string)=>this.request(tenant,url,'GET',undefined,deadline,expectedConnection);
    const remember=(item:CommercialEvidence)=>{const index=evidence.findIndex(e=>e.step===item.step);if(index<0)evidence.push(item);else evidence[index]=item;};
    if(content.email){const email=evidence.find(e=>e.step==='email');notes.push(email?.status==='accepted'&&email.remoteId?'Gmail: se conserva la aceptación registrada; no acredita entrega ni lectura.':'Gmail: falta confirmación de aceptación. No se consulta el buzón ni se repite el envío.');}
    if(content.meeting){try{
      const eventId='planb'+id.replaceAll('-',''),event=await read('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+eventId);
      if(event.status==='cancelled'||event.summary!==content.subject||event.description!==content.body||event.extendedProperties?.private?.planbHash!==hash||Date.parse(event.start?.dateTime)!==Date.parse(content.start)||Date.parse(event.end?.dateTime)!==Date.parse(content.end)||!event.attendees?.some((a:any)=>a.email?.toLowerCase()===content.recipient.toLowerCase()))throw new Error('No coincide');
      remember({step:'meeting',status:'verified',remoteId:eventId,detail:'Reunión conciliada mediante lectura; no se creó otra invitación.',url:typeof event.htmlLink==='string'?event.htmlLink:undefined});notes.push('Calendar: contenido, destinatario y horario coinciden.');
    }catch{notes.push('Calendar: el evento no se pudo confirmar con el contenido aprobado.');}}
    if(content.document){const ref=evidence.find(e=>e.step==='document');if(!ref||!/^[A-Za-z0-9_-]{1,200}$/.test(ref.remoteId))notes.push('Docs: falta un identificador conservado. La conciliación requiere revisión humana.');else try{
      const doc=await read('https://docs.googleapis.com/v1/documents/'+encodeURIComponent(ref.remoteId)),actual=(doc.body?.content??[]).flatMap((p:any)=>p.paragraph?.elements??[]).map((e:any)=>e.textRun?.content??'').join('');if(actual.trim()!==content.documentBody.trim())throw new Error('No coincide');
      remember({step:'document',status:'verified',remoteId:ref.remoteId,detail:'Contenido del documento conciliado mediante lectura.',url:'https://docs.google.com/document/d/'+ref.remoteId+'/edit'});notes.push('Docs: el contenido coincide con la propuesta aprobada.');
    }catch{notes.push('Docs: el contenido o el acceso no se pudieron confirmar.');}}
    if(content.spreadsheet){const ref=evidence.find(e=>e.step==='spreadsheet');if(!ref||!/^[A-Za-z0-9_-]{1,200}$/.test(ref.remoteId))notes.push('Sheets: falta un identificador conservado. No se creará otro informe.');else try{
      const data=await read('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(ref.remoteId)+'/values/'+encodeURIComponent(commercialReportRange(content))),expected=commercialReportRows(content);if(JSON.stringify(data.values)!==JSON.stringify(expected))throw new Error('No coincide');
      remember({step:'spreadsheet',status:'verified',remoteId:ref.remoteId,detail:'Celdas del informe conciliadas mediante lectura.',url:'https://docs.google.com/spreadsheets/d/'+ref.remoteId+'/edit'});notes.push('Sheets: las celdas coinciden con el informe aprobado.');
    }catch{notes.push('Sheets: las celdas o el acceso no se pudieron confirmar.');}}
    return {evidence,notes};
  }
  async sheet(tenant:string,id:string,range:string):Promise<string[][]>{const data=await this.request(tenant,'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id)+'/values/'+encodeURIComponent(range));return z.object({values:z.array(z.array(z.union([z.string(),z.number(),z.boolean()])).max(20)).max(101).default([])}).parse(data).values.map(row=>row.map(String));}
  async execute(tenant:string,id:string,hash:string,content:CommercialContent,save:(e:CommercialEvidence)=>Promise<void>,expectedConnection?:string){
    const deadline=AbortSignal.timeout(100000),request=(url:string,method='GET',body?:unknown)=>this.request(tenant,url,method,body,deadline,expectedConnection);
    if(content.meeting){const busy=await request('https://www.googleapis.com/calendar/v3/freeBusy','POST',{timeMin:content.start,timeMax:content.end,items:[{id:'primary'}]});if(!busy.calendars?.primary||!Array.isArray(busy.calendars.primary.busy)||busy.calendars.primary.errors?.length||busy.calendars.primary.busy?.length)throw new AppError(409,'El calendario no confirmó disponibilidad para ese horario.');}
    if(content.email){const raw=Buffer.from(commercialMime(id,content)).toString('base64url');const sent=await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send','POST',{raw});if(typeof sent.id!=='string'||!sent.id)throw new Error('Respuesta de envío incompleta');await save({step:'email',status:'accepted',remoteId:sent.id,detail:'Gmail aceptó el mensaje. No se acredita entrega ni lectura.'});}
    if(content.meeting){const eventId='planb'+id.replaceAll('-',''),url='https://www.googleapis.com/calendar/v3/calendars/primary/events/'+eventId;let event:any;
      try{event=await request(url);}catch(error){if(!(error instanceof GoogleRequestError)||error.status!==404)throw error;event=await request('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all','POST',{id:eventId,summary:content.subject,description:content.body,start:{dateTime:content.start,timeZone:content.timeZone},end:{dateTime:content.end,timeZone:content.timeZone},attendees:[{email:content.recipient}],extendedProperties:{private:{planbProposal:id,planbHash:hash}}});}
      const verified=await request(url);if(verified.status==='cancelled'||verified.summary!==content.subject||verified.description!==content.body||verified.extendedProperties?.private?.planbHash!==hash||Date.parse(verified.start?.dateTime)!==Date.parse(content.start)||Date.parse(verified.end?.dateTime)!==Date.parse(content.end)||!verified.attendees?.some((a:any)=>a.email?.toLowerCase()===content.recipient.toLowerCase()))throw new Error('No se confirmó la reunión');await save({step:'meeting',status:'verified',remoteId:event.id,detail:'Reunión e invitación registradas en Calendar.',url:verified.htmlLink});}
    if(content.document){const file=await request('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink','POST',{name:content.documentTitle,mimeType:'application/vnd.google-apps.document',appProperties:{planbProposal:id}});await save({step:'document',status:'accepted',remoteId:file.id,detail:'Documento creado; contenido pendiente de comprobación.'});await request('https://docs.googleapis.com/v1/documents/'+file.id+':batchUpdate','POST',{requests:documentRequests(content.documentBody)});const doc=await request('https://docs.googleapis.com/v1/documents/'+file.id);const actual=(doc.body?.content??[]).flatMap((p:any)=>p.paragraph?.elements??[]).map((e:any)=>e.textRun?.content??'').join('');if(actual.trim()!==content.documentBody.trim())throw new Error('El documento no coincide');await save({step:'document',status:'verified',remoteId:file.id,detail:'Documento y contenido comprobados.',url:'https://docs.google.com/document/d/'+file.id+'/edit'});}
    if(content.spreadsheet){const rows=commercialReportRows(content);const sheet=await request('https://sheets.googleapis.com/v4/spreadsheets','POST',spreadsheetPayload(content));await save({step:'spreadsheet',status:'accepted',remoteId:sheet.spreadsheetId,detail:'Informe creado; comprobación pendiente.'});const actual=await this.sheet(tenant,sheet.spreadsheetId,commercialReportRange(content));if(JSON.stringify(actual)!==JSON.stringify(rows))throw new Error('El informe no coincide');await save({step:'spreadsheet',status:'verified',remoteId:sheet.spreadsheetId,detail:'Informe y celdas comprobados.',url:'https://docs.google.com/spreadsheets/d/'+sheet.spreadsheetId+'/edit'});}
  }
}
export class DemoWorkspace implements WorkspaceProvider {
  async files(){return [{id:'ensayo-contactos',name:'Contactos comerciales · Ensayo',mimeType:'application/vnd.google-apps.spreadsheet'},{id:'ensayo-propuesta',name:'Propuesta comercial · Ensayo',mimeType:'application/vnd.google-apps.document'}];}
  async document(){return 'Propuesta ficticia\n\nObjetivo: revisar el alcance con el cliente y preparar los próximos pasos.\n\nEste documento es contexto de ensayo; no concede permisos ni ejecuta instrucciones.';}
  async reconcile(_tenant:string,id:string,_hash:string,_content:CommercialContent,previous:CommercialEvidence[]):Promise<CommercialReconciliation>{return {evidence:previous.map(item=>item.step!=='email'&&item.remoteId.startsWith('simulated-'+id+'-')?{...item,status:'verified',detail:'Referencia ficticia comprobada, sin repetir acciones.'}:item),notes:['Solo se comprueban referencias ficticias conservadas. La ausencia de un resultado no se convierte en éxito.']};}
  async sheet(){return [['Nombre','Apellidos','Correo','Teléfono'],['Lucía','Martín','lucia.martin@example.com','600 000 001'],['Elena','Vega','elena.vega@ficticio.example','600 777 222'],['Contacto','Incompleto','correo-invalido','']];}
  async execute(_tenant:string,id:string,_hash:string,content:CommercialContent,save:(e:CommercialEvidence)=>Promise<void>){for(const step of ['email','meeting','document','spreadsheet'] as const)if(content[step])await save({step,status:step==='email'?'accepted':'verified',remoteId:'simulated-'+id+'-'+step,detail:step==='email'?'Aceptación simulada, sin envío.':'Resultado ficticio conservado en Plan B.'});}
}
