import { randomBytes } from 'node:crypto';
import { PublicClientApplication } from '@azure/msal-node';
import { CopilotStudioClient,ConnectionSettings } from '@microsoft/agents-copilotstudio-client';
import { z } from 'zod';
import type { TeamPrincipal } from '../../shared/team.js';
import { open,seal } from '../crypto.js';
import { AppError } from '../store.js';
import { digest,type TeamRepository } from './repository.js';
export const CopilotConfigSchema=z.object({tenantId:z.string().uuid(),clientId:z.string().uuid(),environmentId:z.string().regex(/^Default-[a-f0-9-]{36}$/i),schemaName:z.string().regex(/^[a-zA-Z0-9_]{1,150}$/),monthlyTurnLimit:z.number().int().min(1).max(25).default(1)}).strict();
export type CopilotConfig=z.infer<typeof CopilotConfigSchema>&{encryptionKey:Buffer;redirectUri:string};
export class CopilotAuth {
  constructor(private repo:TeamRepository,public config:CopilotConfig|null){}
  private settings(){if(!this.config||this.config.encryptionKey.length!==32)throw new AppError(503,'Copilot necesita su registro de aplicación y agente compatible.');return this.config;}
  private client(){const c=this.settings();return new PublicClientApplication({auth:{clientId:c.clientId,authority:'https://login.microsoftonline.com/'+c.tenantId},system:{loggerOptions:{loggerCallback:()=>{},piiLoggingEnabled:false}}});}
  private scopes(){const c=this.settings();return [CopilotStudioClient.scopeFromSettings(new ConnectionSettings({environmentId:c.environmentId,schemaName:c.schemaName}))];}
  async begin(tenant:string,user:TeamPrincipal){const c=this.settings();return this.repo.scoped(tenant,user,'connections',async sql=>{
    const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url'),challenge=Buffer.from(digest(verifier),'hex').toString('base64url');
    await sql.query('DELETE FROM team_copilot_states WHERE tenant_id=$1 AND user_id=$2',[tenant,user.uid]);
    await sql.query('INSERT INTO team_copilot_states VALUES($1,$2,$3,$4,$5,false)',[tenant,digest(state),user.uid,seal(verifier,c.encryptionKey),new Date(this.repo.clock().getTime()+600000).toISOString()]);
    return {state,url:await this.client().getAuthCodeUrl({scopes:this.scopes(),redirectUri:c.redirectUri,state,codeChallenge:challenge,codeChallengeMethod:'S256',prompt:'select_account'})};
  });}
  async complete(tenant:string,user:TeamPrincipal,state:string,code:string){const c=this.settings();
    const pending=await this.repo.scoped(tenant,user,'connections',async sql=>(await sql.query<{verifier:string}>('UPDATE team_copilot_states SET consumed=true WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND expires_at>$4 AND consumed=false RETURNING verifier',[tenant,digest(state),user.uid,this.repo.clock().toISOString()])).rows[0]);
    if(!pending)throw new AppError(409,'La autorización Microsoft caducó o no pertenece a esta empresa.');
    const client=this.client();let token;
    try{token=await client.acquireTokenByCode({scopes:this.scopes(),redirectUri:c.redirectUri,code,codeVerifier:open(pending.verifier,c.encryptionKey)});}catch{throw new AppError(403,'Microsoft no concedió acceso al agente. Revisa registro y consentimiento.');}
    if(!token?.account||token.tenantId.toLowerCase()!==c.tenantId.toLowerCase())throw new AppError(403,'La identidad Microsoft no pertenece al entorno autorizado.');
    const accountName=token.account.username;
    return this.repo.scoped(tenant,user,'connections',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      const active=await sql.query('DELETE FROM team_copilot_states WHERE tenant_id=$1 AND id=$2 AND user_id=$3 AND consumed=true RETURNING id',[tenant,digest(state),user.uid]);if(!active.rows.length)throw new AppError(409,'La autorización fue retirada.');
      await sql.query('INSERT INTO team_copilot_connections VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,user_id) DO UPDATE SET account=excluded.account,cache=excluded.cache,revision=excluded.revision',[tenant,user.uid,accountName,seal(client.getTokenCache().serialize(),c.encryptionKey),randomBytes(16).toString('hex')]);
      await this.repo.audit(sql,tenant,user.uid,'copilot.authorized',c.schemaName);return {connected:true};
    });
  }
  async token(tenant:string,user:TeamPrincipal){const c=this.settings(),client=this.client();
    const row=await this.repo.scoped(tenant,user,'jobs',async sql=>(await sql.query<{cache:string;revision:string}>('SELECT cache,revision FROM team_copilot_connections WHERE tenant_id=$1 AND user_id=$2',[tenant,user.uid])).rows[0]);
    if(!row)throw new AppError(409,'Autoriza tu cuenta Microsoft antes de analizar.');
    try{
      client.getTokenCache().deserialize(open(row.cache,c.encryptionKey));const accounts=await client.getTokenCache().getAllAccounts();if(accounts.length!==1)throw new Error('Identidad no única');
      const result=await client.acquireTokenSilent({scopes:this.scopes(),account:accounts[0]});if(!result?.accessToken||result.tenantId.toLowerCase()!==c.tenantId.toLowerCase())throw new Error('Identidad incorrecta');
      await this.repo.scoped(tenant,user,'jobs',async sql=>{const saved=await sql.query('UPDATE team_copilot_connections SET cache=$4 WHERE tenant_id=$1 AND user_id=$2 AND revision=$3 RETURNING user_id',[tenant,user.uid,row.revision,seal(client.getTokenCache().serialize(),c.encryptionKey)]);if(!saved.rows.length)throw new AppError(409,'La conexión Microsoft cambió.');});return result.accessToken;
    }catch{throw new AppError(403,'Microsoft requiere volver a autorizar la conexión del agente.');}
  }
  async disconnect(tenant:string,user:TeamPrincipal){return this.repo.scoped(tenant,user,'connections',async sql=>{
    await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);await sql.query('DELETE FROM team_copilot_states WHERE tenant_id=$1 AND user_id=$2',[tenant,user.uid]);await sql.query('DELETE FROM team_copilot_connections WHERE tenant_id=$1 AND user_id=$2',[tenant,user.uid]);await this.repo.audit(sql,tenant,user.uid,'copilot.disconnect','microsoft');return {disconnected:true};
  });}
}
