import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { seal, open } from '../crypto.js';
import { AppError } from '../store.js';
import { inspectConnection, readonlyFetch } from '../connection.js';
import { importHubspot } from '../hubspot.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { Sql } from './database.js';
import { digest, TeamRepository } from './repository.js';
import { normalizeHubspotActivityTime, compareHubspotActivityTime } from './hubspot-activity-time.js';
const scopes=['oauth','crm.objects.contacts.read','crm.objects.companies.read','crm.objects.deals.read','crm.schemas.contacts.read','crm.schemas.companies.read','crm.schemas.deals.read'];
const tokenSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive(),hub_id:z.union([z.number(),z.string()]).optional(),scopes:z.array(z.string()).optional()});
type ContextSource={accountId:string;mode:'test'|'production_readonly'};
type ContextReadOptions={timeoutMs?:number;requestTimeoutMs?:number;signal?:AbortSignal};
type OAuthTokens=z.infer<typeof tokenSchema>;
type ConnectionRow={account_id:string;account_type:string;status:string;secret:string;expires_at:string;verified_at:string};
type AccessConnection=ContextSource&{token:string;scopes:string[];identity:{accountType:string;verifiedAt:string}};
class HubspotTokenError extends AppError {
  constructor(readonly revoked:boolean){super(502,'HubSpot no aceptó la autorización. Vuelve a conectar.');}
}
export interface HubspotOAuthConfig {clientId:string;clientSecret:string;redirectUri:string;encryptionKey:Buffer;}
export class TeamOAuth {
  private refreshes=new Map<string,Promise<void>>();
  constructor(private repo:TeamRepository,private config:HubspotOAuthConfig|null,private fetcher:typeof fetch=fetch,private localEncryptionKey?:Buffer){}
  private encryptionKey(){const key=this.config?.encryptionKey??this.localEncryptionKey;if(key?.length!==32)throw new AppError(503,'Falta la protección de credenciales de esta instalación.');return key;}
  async connectPrivate(tenant:string,principal:TeamPrincipal,token:string,accountId:string){
    return this.savePrivate(tenant,principal,token,accountId,false);
  }
  async connectPrivateProduction(tenant:string,principal:TeamPrincipal,input:unknown){
    const review=z.object({accountId:z.string().regex(/^\d+$/),confirmedAccountId:z.string(),token:z.string().min(10).max(4096),reviewed:z.literal(true)}).strict().refine(value=>value.accountId===value.confirmedAccountId,'Confirma el ID exacto del portal autorizado.').parse(input);
    return this.savePrivate(tenant,principal,review.token,review.accountId,true);
  }
  private async productionSpace(sql:Sql,tenant:string,accountId:string){
    // A real portal may only use an empty space or its own earlier production data.
    const space=(await sql.query<{blueprint:{snapshot:{source:{accountId:string;environment?:string}}}|null}>('SELECT blueprint FROM team_spaces WHERE id=$1',[tenant])).rows[0];
    const source=space?.blueprint?.snapshot?.source;
    const records=(await sql.query('SELECT id FROM team_records WHERE tenant_id=$1 LIMIT 1',[tenant])).rows.length;
    const foreignCapture=(await sql.query("SELECT id FROM team_captures WHERE tenant_id=$1 AND (snapshot->'source'->>'accountId' IS DISTINCT FROM $2 OR snapshot->'source'->>'environment' IS DISTINCT FROM 'production') LIMIT 1",[tenant,accountId])).rows.length;
    if(foreignCapture||source&&(source.accountId!==accountId||source.environment!=='production')||records&&!source)throw new AppError(409,'Usa un espacio nuevo para este portal real. Los datos anteriores se conservan en su espacio.');
  }
  private async savePrivate(tenant:string,principal:TeamPrincipal,token:string,accountId:string,production:boolean){
    if(!this.localEncryptionKey)throw new AppError(403,'Esta conexión está disponible solo en el piloto local protegido.');
    await this.repo.scoped(tenant,principal,'connections',async sql=>{if((await sql.query('SELECT tenant_id FROM team_connections WHERE tenant_id=$1',[tenant])).rows.length)throw new AppError(409,'Desconecta la conexión anterior antes de sustituirla.');if(production)await this.productionSpace(sql,tenant,accountId);});
    const account=await inspectConnection({token,accountId,mode:production?'production_readonly':'test',confirmedProduction:production,confirmedTestAccount:!production},this.fetcher);
    const owners=await readonlyFetch(this.fetcher)('https://api.hubapi.com/crm/v3/owners?limit=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
    if(!owners.ok&&owners.status!==403)throw new AppError(502,'HubSpot no confirmó el alcance de lectura.');
    const ownerRead=owners.ok&&Array.isArray((await owners.json()).results);
    return this.repo.scoped(tenant,principal,'connections',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      if((await sql.query('SELECT tenant_id FROM team_connections WHERE tenant_id=$1',[tenant])).rows.length)throw new AppError(409,'La conexión cambió durante la comprobación.');
      if(production)await this.productionSpace(sql,tenant,accountId);
      await sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7)',[tenant,accountId,account.accountType,'readonly',seal(JSON.stringify({kind:production?'private-production-readonly':'private',...(production?{authorizedPortalId:accountId}:{}),access_token:token,scopes:ownerRead?['crm.objects.owners.read']:[]}),this.encryptionKey()),account.verifiedAt,'9999-01-01T00:00:00Z']);
      await this.repo.audit(sql,tenant,principal.uid,production?'hubspot.private_production_readonly':'hubspot.private_readonly',accountId);return {connected:true,accountId,mode:'readonly'};
    });
  }
  private settings(){if(!this.config||this.config.encryptionKey.length!==32)throw new AppError(503,'OAuth pendiente de configurar en el despliegue.');return this.config;}
  async begin(tenant:string,principal:TeamPrincipal,accountId:string,extendedRead=false){const config=this.settings();return this.repo.scoped(tenant,principal,'connections',async sql=>{
    await sql.query('DELETE FROM team_oauth_states WHERE tenant_id=$1 AND expires_at<=$2',[tenant,this.repo.clock().toISOString()]);
    const state=randomBytes(32).toString('hex');await sql.query('INSERT INTO team_oauth_states VALUES($1,$2,$3,$4,$5,false)',[tenant,digest(state),principal.uid,accountId,new Date(this.repo.clock().getTime()+600000).toISOString()]);
    const url=new URL('https://app.hubspot.com/oauth/authorize');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,scope:[...scopes,...(extendedRead?['crm.objects.owners.read']:[])].join(' '),state}).toString();return {url:url.href,state};
  });}
  private async tokens(body:URLSearchParams,prior?:OAuthTokens){
    const response=await this.fetcher('https://api.hubapi.com/oauth/v3/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok){const error=await response.json().catch(()=>null);throw new HubspotTokenError(response.status<500&&(error?.error==='invalid_grant'||error?.status==='BAD_REFRESH_TOKEN'));}
    const payload=await response.json().catch(()=>null);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new AppError(502,'HubSpot no confirmó una credencial válida.');
    // Only optional refresh metadata may be omitted. A fresh access token and lifetime are required.
    const parsed=tokenSchema.safeParse({...prior,...payload,access_token:payload.access_token,expires_in:payload.expires_in});
    if(!parsed.success)throw new AppError(502,'HubSpot no confirmó una credencial válida.');return parsed.data;
  }
  async complete(tenant:string,principal:TeamPrincipal,state:string,code:string){
    const config=this.settings();const expected=await this.repo.scoped(tenant,principal,'connections',async sql=>{
      const row=(await sql.query<{account_id:string}>('UPDATE team_oauth_states SET consumed=true WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND consumed=false AND expires_at>$4 RETURNING account_id',[tenant,digest(state),principal.uid,this.repo.clock().toISOString()])).rows[0];if(!row)throw new AppError(409,'La autorización caducó, ya se usó o no pertenece a esta empresa.');return row.account_id;
    });
    const tokens=await this.tokens(new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code}));
    if(tokens.scopes?.some(scope=>![...scopes,'crm.objects.owners.read'].includes(scope)))throw new AppError(403,'La aplicación ha recibido permisos fuera del alcance de lectura previsto.');
    const infoResponse=await readonlyFetch(this.fetcher)('https://api.hubapi.com/account-info/2026-09/details',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});
    if(!infoResponse.ok)throw new AppError(502,'No se pudo verificar el portal.');const info=await infoResponse.json();
    if(String(info.portalId)!==expected||!['STANDARD','DEVELOPER_TEST','SANDBOX'].includes(info.accountType))throw new AppError(403,'Portal o tipo de cuenta no autorizado.');
    const mode=info.accountType==='STANDARD'?'production_readonly' as const:'test' as const;
    const account=await inspectConnection({token:tokens.access_token,accountId:expected,mode,confirmedProduction:true,confirmedTestAccount:true},this.fetcher);
    if(tokens.hub_id!==undefined&&String(tokens.hub_id)!==expected)throw new AppError(403,'El portal autorizado no coincide.');
    return this.repo.scoped(tenant,principal,'connections',async sql=>{
      // Serialize against imports/disconnects before consuming the final state row.
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      const active=(await sql.query('SELECT id FROM team_oauth_states WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND consumed=true FOR UPDATE',[tenant,digest(state),principal.uid])).rows[0];
      if(!active)throw new AppError(409,'La conexión fue retirada mientras se autorizaba. Inicia otra autorización.');
      const prior=(await sql.query<{account_id:string}>('SELECT account_id FROM team_connections WHERE tenant_id=$1',[tenant])).rows[0];if(prior&&prior.account_id!==expected)throw new AppError(409,'Esta empresa ya está vinculada a otro portal.');
      if(mode==='production_readonly')await this.productionSpace(sql,tenant,expected);
      await sql.query('INSERT INTO team_connections VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id) DO UPDATE SET secret=excluded.secret,account_type=excluded.account_type,verified_at=excluded.verified_at,expires_at=excluded.expires_at,status=excluded.status',[tenant,expected,account.accountType,'readonly',seal(JSON.stringify(tokens),config.encryptionKey),account.verifiedAt,new Date(this.repo.clock().getTime()+tokens.expires_in*1000).toISOString()]);
      await this.repo.audit(sql,tenant,principal.uid,'hubspot.authorized_readonly',expected);return {connected:true,accountId:expected,mode:'readonly'};
    });
  }
  private async refresh(tenant:string,row:ConnectionRow,prior:OAuthTokens){
    const config=this.settings();
    const markReconnect=()=>this.repo.system(tenant,async sql=>(await sql.query("UPDATE team_connections SET status='needs_reconnect' WHERE tenant_id=$1 AND secret=$2 AND account_id=$3 AND account_type=$4 AND verified_at::text=$5 AND status='readonly' RETURNING tenant_id",[tenant,row.secret,row.account_id,row.account_type,row.verified_at])).rows.length>0);
    let tokens:OAuthTokens;
    try{tokens=await this.tokens(new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,client_secret:config.clientSecret,refresh_token:prior.refresh_token}),prior);}
    catch(error){
      if(error instanceof HubspotTokenError&&error.revoked){if(await markReconnect())throw new AppError(409,'La autorización de HubSpot caducó o fue retirada. Vuelve a conectar.');return;}
      throw error;
    }
    if(tokens.hub_id!==undefined&&String(tokens.hub_id)!==row.account_id||tokens.scopes?.some(scope=>![...scopes,'crm.objects.owners.read'].includes(scope))){
      if(await markReconnect())throw new AppError(403,'La renovación cambió el portal o alcance. Vuelve a conectar.');return;
    }
    const encrypted=seal(JSON.stringify(tokens),config.encryptionKey),expiresAt=new Date(this.repo.clock().getTime()+tokens.expires_in*1000).toISOString();
    // Compare-and-set: a stale response cannot replace a reconnection or a refresh from another process.
    // A valid grant for this exact baseline can recover an earlier failed concurrent refresh.
    await this.repo.system(tenant,sql=>sql.query("UPDATE team_connections SET status='readonly',secret=$3,expires_at=$4 WHERE tenant_id=$1 AND secret=$2 AND account_id=$5 AND account_type=$6 AND verified_at::text=$7 AND status IN ('readonly','needs_reconnect')",[tenant,row.secret,encrypted,expiresAt,row.account_id,row.account_type,row.verified_at]));
  }
  private async access(tenant:string,source?:ContextSource,afterRefresh=false):Promise<AccessConnection>{const key=this.encryptionKey();
      const row=await this.repo.system(tenant,async sql=>(await sql.query<ConnectionRow>('SELECT account_id,account_type,status,secret,expires_at,verified_at::text AS verified_at FROM team_connections WHERE tenant_id=$1',[tenant])).rows[0]);if(!row)throw new AppError(409,'Conecta HubSpot antes de capturar.');
      const mode=row.account_type==='STANDARD'?'production_readonly' as const:'test' as const;
      if(row.status!=='readonly'||!['STANDARD','DEVELOPER_TEST','SANDBOX'].includes(row.account_type))throw new AppError(409,'Vuelve a conectar HubSpot antes de leer esta fuente.');
      if(source&&(row.account_id!==source.accountId||mode!==source.mode))throw new AppError(409,'La captura y la conexión pertenecen a fuentes distintas. Vuelve a abrir la ficha.');
      const identity={accountType:row.account_type,verifiedAt:row.verified_at};
      const raw=JSON.parse(open(row.secret,key));
      if(raw.kind==='private'||raw.kind==='private-production-readonly'){
        const production=raw.kind==='private-production-readonly';
        if(!this.localEncryptionKey||(production?row.account_type!=='STANDARD'||raw.authorizedPortalId!==row.account_id:!['DEVELOPER_TEST','SANDBOX'].includes(row.account_type)))throw new AppError(403,'Credencial local fuera del portal y modo autorizados.');
        return {token:z.string().min(10).max(4096).parse(raw.access_token),accountId:row.account_id,scopes:z.array(z.literal('crm.objects.owners.read')).default([]).parse(raw.scopes),mode:production?'production_readonly' as const:'test' as const,identity};
      }
      this.settings();const tokens=tokenSchema.parse(raw),remaining=Date.parse(String(row.expires_at))-this.repo.clock().getTime();
      if(!Number.isFinite(remaining)||afterRefresh&&remaining<=0)throw new AppError(409,'La renovación no confirmó una credencial vigente. Vuelve a conectar.');
      if(remaining<60000&&!afterRefresh){
        const refreshKey=tenant+':'+digest(row.secret);let pending=this.refreshes.get(refreshKey);
        if(!pending){pending=this.refresh(tenant,row,tokens);this.refreshes.set(refreshKey,pending);}
        try{await pending;}finally{if(this.refreshes.get(refreshKey)===pending)this.refreshes.delete(refreshKey);}
        return this.access(tenant,source,true);
      }
      return {token:tokens.access_token,accountId:row.account_id,scopes:tokens.scopes??[],mode,identity};
  }
  async capture(tenant:string,signal?:AbortSignal){const {identity,...connection}=await this.access(tenant);
    return importHubspot({...connection,signal,confirmedTestAccount:connection.mode==='test',selectedFields:{contacts:['firstname','lastname','email','phone'],companies:['name','domain','phone'],deals:['dealname','amount','dealstage','pipeline','closedate'],tasks:['hs_task_subject','hs_task_status','hs_timestamp']}},readonlyFetch(this.fetcher));
  }
  async context(tenant:string,contactId:string,source?:ContextSource,options:ContextReadOptions={}){
    const policy=z.object({timeoutMs:z.number().int().min(1).max(30000).default(30000),requestTimeoutMs:z.number().int().min(1).max(12000).default(12000)}).parse({timeoutMs:options.timeoutMs,requestTimeoutMs:options.requestTimeoutMs});
    const callerSignal=options.signal,cancelled=()=>new AppError(409,'La lectura de la ficha se ha cancelado.');
    if(callerSignal?.aborted)throw cancelled();
    if(!/^\d{1,100}$/.test(contactId))throw new AppError(422,'Esta ficha no tiene un ID remoto de HubSpot.');const connection=await this.access(tenant,source),safe=readonlyFetch(this.fetcher);
    // One deadline for the read phase, including identity checks and JSON bodies. OAuth access is separate.
    const budget=new AbortController(),deadline=setTimeout(()=>budget.abort(new AppError(504,'HubSpot agotó el tiempo total de lectura de la ficha. Vuelve a intentarlo.')),policy.timeoutMs);
    const cancel=()=>budget.abort(cancelled());callerSignal?.addEventListener('abort',cancel,{once:true});if(callerSignal?.aborted)cancel();
    const bounded=<T>(action:(signal:AbortSignal)=>Promise<T>,requestMs?:number)=>new Promise<T>((resolve,reject)=>{
      const request=new AbortController();let finished=false,timer:ReturnType<typeof setTimeout>|undefined;
      const finish=(ok:boolean,value:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);budget.signal.removeEventListener('abort',abort);if(ok)resolve(value as T);else reject(value);};
      const abort=()=>{request.abort(budget.signal.reason);finish(false,budget.signal.reason);};
      if(budget.signal.aborted){abort();return;}
      budget.signal.addEventListener('abort',abort,{once:true});
      if(requestMs!==undefined)timer=setTimeout(()=>{const error=new AppError(504,'HubSpot agotó el tiempo de una lectura de la ficha. Vuelve a intentarlo.');request.abort(error);finish(false,error);},requestMs);
      // Attach both handlers even if the transport ignores cancellation or settles after timeout.
      Promise.resolve().then(()=>{request.signal.throwIfAborted();return action(request.signal);}).then(value=>finish(true,value),error=>finish(false,error));
    });
    try{
    // Short database reads surround network waits; a token refresh alone preserves this identity.
    const assertCurrent=()=>this.repo.system(tenant,async sql=>{
      const row=(await sql.query<{account_id:string;account_type:string;status:string;verified_at:string}>('SELECT account_id,account_type,status,verified_at::text AS verified_at FROM team_connections WHERE tenant_id=$1',[tenant])).rows[0];
      if(!row||row.status!=='readonly'||row.account_id!==connection.accountId||row.account_type!==connection.identity.accountType||row.verified_at!==connection.identity.verifiedAt)throw new AppError(409,'La conexión cambió mientras se leía la ficha. Vuelve a abrirla.');
    });
    const notFound=Symbol('not-found');
    const pause=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    });
    const retryDelay=(header:string|null)=>{
      const value=header?.trim()??'';
      if(/^\d+$/.test(value))return Number(value)*1000;
      // HTTP dates begin with a weekday; do not parse negative/fractional numbers as dates.
      const at=/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:[a-z]*,|,| )/.test(value)?Date.parse(value):NaN;
      return Number.isFinite(at)?Math.max(0,at-Date.now()):1000;
    };
    let logicalReads=0,physicalAttempts=0;
    const request=(path:string,body:Record<string,unknown>|null=null,optional=false)=>{
      if(++logicalReads>7)throw new AppError(502,'La ficha supera el presupuesto de lecturas permitido.');
      // A retry reuses these exact bytes, the same deadline and the same connection identity.
      const init:RequestInit={headers:{Authorization:'Bearer '+connection.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})};
      return bounded(async signal=>{
      for(let attempt=0;attempt<2;attempt++){
        await assertCurrent();signal.throwIfAborted();
        if(++physicalAttempts>14)throw new AppError(502,'La ficha supera el presupuesto de intentos permitido.');
        const response=await safe('https://api.hubapi.com'+path,{...init,signal});signal.throwIfAborted();
        await assertCurrent();signal.throwIfAborted();
        if(response.status===429){
          // Release a response we will not parse. Cancellation failure must not hide the rate limit.
          try{void response.body?.cancel().catch(()=>{});}catch{}
        }
        if(response.status===429&&attempt===0){
          const delay=retryDelay(response.headers.get('Retry-After'));
          if(!Number.isFinite(delay)||delay>5000)throw new AppError(502,'HubSpot ha limitado las lecturas. Vuelve a intentarlo más tarde.');
          // The wait and second attempt share this request's original timer and the global deadline.
          await pause(delay,signal);continue;
        }
        if(optional&&response.status===404)return notFound;
        if(!response.ok)throw new AppError(response.status===403?403:502,'No se pudo leer la ficha. Revisa los permisos de esta conexión.');
        const value=await response.json();signal.throwIfAborted();await assertCurrent();signal.throwIfAborted();if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError(502,'HubSpot no confirmó una ficha válida.');return value;
      }
      throw new AppError(502,'HubSpot no confirmó la lectura de la ficha.');
      },policy.requestTimeoutMs);
    };
    const invalid=()=>new AppError(502,'HubSpot no confirmó una ficha o búsqueda válida.');
    const isObject=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
    const isId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
    const contact=await request('/crm/v3/objects/contacts/'+contactId+'?properties=firstname,lastname,email,hubspot_owner_id&associations=notes,tasks,meetings,calls,emails');
    if(contact.id!==contactId||!isObject(contact.properties)||contact.associations!==undefined&&!isObject(contact.associations))throw invalid();
    const timeline:{kind:string;id:string;at:string|null;title:string;body:string}[]=[];
    const fields:Record<string,string>={notes:'hs_note_body,hs_timestamp',tasks:'hs_task_subject,hs_task_body,hs_task_status,hs_task_priority,hs_task_type,hs_timestamp,hubspot_owner_id',meetings:'hs_meeting_title,hs_meeting_body,hs_timestamp',calls:'hs_call_title,hs_call_body,hs_timestamp',emails:'hs_email_subject,hs_email_text,hs_timestamp'};
    const content:Record<string,{title:string|null;body:string}>={notes:{title:null,body:'hs_note_body'},tasks:{title:'hs_task_subject',body:'hs_task_body'},meetings:{title:'hs_meeting_title',body:'hs_meeting_body'},calls:{title:'hs_call_title',body:'hs_call_body'},emails:{title:'hs_email_subject',body:'hs_email_text'}};
    const available=new Map<string,number>(),quotas=new Map<string,number>();
    for(const kind of Object.keys(fields)){
      const association=contact.associations?.[kind];
      if(association===undefined){available.set(kind,0);continue;}
      if(!isObject(association)||!Array.isArray(association.results))throw invalid();
      const ids=association.results.slice(0,2).map((item:unknown)=>{if(!isObject(item)||!isId(item.id))throw invalid();return item.id;});
      if(new Set(ids).size!==ids.length)throw invalid();
      available.set(kind,ids.length);
    }
    // Fix the diverse quotas before reading the index; sparse results never trigger refills or paging.
    let allocated=0;
    for(let round=0;round<2;round++)for(const kind of Object.keys(fields))if((available.get(kind)??0)>round&&allocated<8){quotas.set(kind,(quotas.get(kind)??0)+1);allocated++;}
    for(const [kind,limit] of quotas){
      const result=await request('/crm/objects/2026-09/'+kind+'/search',{filterGroups:[{filters:[{propertyName:'associations.contact',operator:'EQ',value:contactId}]}],sorts:['-hs_createdate'],properties:['hs_createdate',...fields[kind].split(',')],limit});
      if(!Array.isArray(result.results)||result.results.length>limit||result.total!==undefined&&(!Number.isSafeInteger(result.total)||result.total<result.results.length))throw invalid();
      const seen=new Set<string>();let previousCreation=Infinity;
      for(const object of result.results){
        if(!isObject(object)||!isId(object.id)||seen.has(object.id)||object.archived!==undefined&&object.archived!==false||!isObject(object.properties))throw invalid();
        seen.add(object.id);const p=object.properties,created=normalizeHubspotActivityTime(p.hs_createdate);
        if(created===null||Date.parse(created)>previousCreation)throw invalid();previousCreation=Date.parse(created);
        for(const field of fields[kind].split(','))if(field!=='hs_timestamp'&&p[field]!==undefined&&p[field]!==null&&typeof p[field]!=='string')throw invalid();
        const shown=content[kind];timeline.push({kind,id:object.id,at:normalizeHubspotActivityTime(p.hs_timestamp),title:(shown.title?p[shown.title]:null)??'Nota',body:(p[shown.body]??'').replace(/<[^>]*>/g,'').slice(0,4000)});
      }
    }
    const ownerId=contact.properties.hubspot_owner_id;
    if(ownerId!==undefined&&ownerId!==null&&ownerId!==''&&!isId(ownerId))throw invalid();
    const ownerRequested=!!ownerId&&connection.scopes.includes('crm.objects.owners.read'),ownerResult=ownerRequested?await request('/crm/v3/owners/'+encodeURIComponent(ownerId),null,true):null,owner=ownerResult===notFound?null:ownerResult;
    if(owner&&(String(owner.id)!==ownerId||['firstName','lastName'].some(field=>owner[field]!==undefined&&owner[field]!==null&&typeof owner[field]!=='string')))throw invalid();
    await bounded(()=>assertCurrent());
    const unavailable=ownerResult===notFound?' El propietario asociado ya no está disponible.':'';
    return {contactId,owner:owner?{name:[owner.firstName,owner.lastName].filter(Boolean).join(' '),id:String(owner.id)}:null,ownerPermission:connection.scopes.includes('crm.objects.owners.read'),timeline:timeline.sort(compareHubspotActivityTime),partial:true,description:'Muestra acotada: hasta dos actividades por tipo y ocho objetos, dando una primera plaza a cada tipo observado en las asociaciones del contacto. Selección por creación del registro CRM en el índice de búsqueda; se muestran ordenadas por la fecha de actividad o vencimiento de tarea. La indexación puede demorarse, los archivados no se incluyen y los campos pueden no estar disponibles. Una búsqueda vacía no demuestra ausencia de historial. No garantiza la última interacción ni sustituye el historial completo de HubSpot.'+unavailable};
    }finally{clearTimeout(deadline);callerSignal?.removeEventListener('abort',cancel);}
  }

}
