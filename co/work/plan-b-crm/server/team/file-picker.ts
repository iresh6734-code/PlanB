import { createHash,randomBytes } from 'node:crypto';
import { z } from 'zod';
import { seal,open } from '../crypto.js';
import { AppError } from '../store.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { GoogleConfig } from './google.js';
import type { TeamRepository } from './repository.js';
import { digest } from './repository.js';
import { salesSource } from './sales-source.js';
import type { FileLibrary } from './file-library.js';

const driveScope='https://www.googleapis.com/auth/drive.file';
interface Pending {account:string;subject:string;verifier:string;connection_revision:string;contact_id:string;source_key:string;local_source:boolean;}
export class GoogleFilePicker {
  constructor(private repo:TeamRepository,private config:GoogleConfig|null,private library:FileLibrary,private fetcher:typeof fetch=fetch){}
  configured(){return !!this.config?.pickerEnabled&&this.config.encryptionKey.length===32;}
  private settings(){if(!this.configured())throw new AppError(503,'Google Picker necesita activar su API y la configuración propia del piloto. Los archivos ya autorizados siguen disponibles.');return this.config!;}
  async begin(tenant:string,user:TeamPrincipal,contactId:string,sourceKey:string,local=false,expectedConnection?:string){
    const config=this.settings();
    return this.repo.scoped(tenant,user,'connections',async sql=>{
      const source=await salesSource(sql,tenant,local);if(source?.key!==sourceKey||!source.records.some(r=>r.entity==='contacts'&&r.id===contactId))throw new AppError(409,'Revisa el cliente y la fuente antes de elegir archivos.');
      const account=await this.library.identity(sql,tenant);if(!account)throw new AppError(409,'Conecta primero tu cuenta Google.');if(expectedConnection&&account.revision!==expectedConnection)throw new AppError(409,'La cuenta cambió. Vuelve a revisar la selección.');
      const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
      await sql.query('DELETE FROM team_google_picker_states WHERE tenant_id=$1 AND expires_at<=$2',[tenant,this.repo.clock().toISOString()]);
      await sql.query('INSERT INTO team_google_picker_states(tenant_id,id,user_id,verifier,connection_revision,account,subject,contact_id,source_key,local_source,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[tenant,digest(state),user.uid,seal(verifier,config.encryptionKey),account.revision,account.account,account.subject,contactId,sourceKey,local,new Date(this.repo.clock().getTime()+600000).toISOString()]);
      const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:driveScope,access_type:'offline',prompt:'consent',include_granted_scopes:'false',trigger_onepick:'true',allow_multiple:'true',mimetypes:'application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet',login_hint:account.account,state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();
      return {url:url.href,state};
    });
  }
  async cancel(tenant:string,user:TeamPrincipal,state:string){return this.repo.scoped(tenant,user,'connections',async sql=>{await sql.query('DELETE FROM team_google_picker_states WHERE tenant_id=$1 AND id=$2 AND user_id=$3',[tenant,digest(state),user.uid]);return {cancelled:true};});}
  async complete(tenant:string,user:TeamPrincipal,state:string,code:string,ids:string[]){
    const config=this.settings();
    const pending=await this.repo.scoped(tenant,user,'connections',async sql=>{
      const row=(await sql.query<Pending>('UPDATE team_google_picker_states SET consumed=true WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND consumed=false AND expires_at>$4 RETURNING *',[tenant,digest(state),user.uid,this.repo.clock().toISOString()])).rows[0];if(!row)throw new AppError(409,'La selección caducó, ya se usó o pertenece a otra sesión.');return row;
    });
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,code,code_verifier:open(pending.verifier,config.encryptionKey)}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new AppError(502,'Google no confirmó la selección. No se ha vinculado ningún archivo.');
    const tokens=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive(),scope:z.literal(driveScope)}).parse(await response.json());
    const identityResponse=await this.fetcher('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{headers:{Authorization:'Bearer '+tokens.access_token},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!identityResponse.ok)throw new AppError(403,'No se pudo comprobar la cuenta de la selección.');
    const identity=z.object({user:z.object({emailAddress:z.email()})}).parse(await identityResponse.json());if(identity.user.emailAddress.toLowerCase()!==pending.account.toLowerCase())throw new AppError(403,'Elige archivos con la misma cuenta Google conectada a esta empresa.');
    await this.repo.scoped(tenant,user,'connections',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      const account=await this.library.identity(sql,tenant),source=await salesSource(sql,tenant,pending.local_source),exists=(await sql.query('SELECT id FROM team_google_picker_states WHERE tenant_id=$1 AND id=$2 AND consumed=true',[tenant,digest(state)])).rows.length;
      if(!exists||!account||account.revision!==pending.connection_revision||account.account!==pending.account||account.subject!==pending.subject||source?.key!==pending.source_key||!source.records.some(r=>r.entity==='contacts'&&r.id===pending.contact_id))throw new AppError(409,'La cuenta, la fuente o el cliente cambió durante la selección.');
      await sql.query('INSERT INTO team_google_file_connections(tenant_id,account,subject,secret,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET account=excluded.account,subject=excluded.subject,secret=excluded.secret,expires_at=excluded.expires_at',[tenant,pending.account,pending.subject,seal(JSON.stringify(tokens),config.encryptionKey),new Date(this.repo.clock().getTime()+tokens.expires_in*1000).toISOString()]);
      await this.repo.audit(sql,tenant,user.uid,'file.picker.authorized',pending.contact_id);
    });
    const result=await this.library.linkMany(tenant,user,pending.contact_id,ids,pending.local_source,pending.source_key,pending.connection_revision);
    return {...result,contactId:pending.contact_id,local:pending.local_source};
  }
}
