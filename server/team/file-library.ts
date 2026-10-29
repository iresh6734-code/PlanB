import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../store.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { CustomerFileLibrary,CustomerFileLink,WorkspaceFile } from '../../shared/commercial.js';
import type { TeamRepository } from './repository.js';
import type { WorkspaceProvider } from './google.js';
import type { Sql } from './database.js';
import { salesSource } from './sales-source.js';

export const fileId=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const supported=['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet'];
interface Identity {account:string;subject:string;revision:string;}
interface Binding {sourceKey:string;identity:Identity;}
interface LinkRow {id:string;contact_id:string;file_id:string;name:string;mime_type:string;source_key:string;account:string;account_subject:string;detached_at:string|null;}
export const fileUrl=(id:string,mime:string)=>mime===supported[0]?'https://docs.google.com/document/d/'+encodeURIComponent(id)+'/edit':'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(id)+'/edit';

export class FileLibrary {
  constructor(private repo:TeamRepository,private provider:WorkspaceProvider,private demo=false,private pickerConfigured=false){}
  async identity(sql:Sql,tenant:string):Promise<Identity|null>{
    if(this.demo)return {account:'Ensayo simulado',subject:'demo',revision:'demo'};
    return (await sql.query<Identity>('SELECT account,subject,revision::text FROM team_google_connections WHERE tenant_id=$1',[tenant])).rows[0]??null;
  }
  private async binding(sql:Sql,tenant:string,contact:string,local=false,expectedSource?:string):Promise<Binding>{
    const source=await salesSource(sql,tenant,local);if(!source?.records.some(r=>r.entity==='contacts'&&r.id===contact))throw new AppError(404,'El cliente no pertenece a esta fuente de la empresa.');
    if(expectedSource&&source.key!==expectedSource)throw new AppError(409,'La fuente cambió. Abre de nuevo la ficha.');
    const identity=await this.identity(sql,tenant);if(!identity)throw new AppError(409,'Conecta Google antes de seleccionar archivos.');return {sourceKey:source.key,identity};
  }
  private same(a:Binding,b:Binding){if(a.sourceKey!==b.sourceKey||a.identity.account!==b.identity.account||a.identity.subject!==b.identity.subject||a.identity.revision!==b.identity.revision)throw new AppError(409,'La fuente o la cuenta cambió. Vuelve a revisar la selección.');}
  async links(tenant:string,user:TeamPrincipal,contact:string,local=false):Promise<CustomerFileLibrary>{return this.repo.scoped(tenant,user,'read',async sql=>{
    const source=await salesSource(sql,tenant,local);if(!source?.records.some(r=>r.entity==='contacts'&&r.id===contact))throw new AppError(404,'Cliente fuera de esta fuente.');
    const identity=await this.identity(sql,tenant),rows=identity?(await sql.query<LinkRow>('SELECT * FROM team_file_links WHERE tenant_id=$1 AND source_key=$2 AND contact_id=$3 AND account_subject=$4 AND account=$5 AND detached_at IS NULL ORDER BY name,id LIMIT 100',[tenant,source.key,contact,identity.subject,identity.account])).rows:[];
    const legacy=Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_file_links WHERE tenant_id=$1 AND contact_id=$2 AND (source_key IS NULL OR account_subject IS NULL)',[tenant,contact])).rows[0].n);
    return {links:rows.map(row=>({id:row.id,contact_id:row.contact_id,file_id:row.file_id,name:row.name,mime_type:row.mime_type,url:fileUrl(row.file_id,row.mime_type)})),sourceKey:source.key,account:this.demo?null:identity?.account??null,connected:!!identity,pickerConfigured:this.pickerConfigured,legacyCount:legacy,connectionRevision:identity?.revision??null};
  });}
  async page(tenant:string,user:TeamPrincipal,cursor?:string){
    const identity=await this.repo.scoped(tenant,user,'write',sql=>this.identity(sql,tenant));if(!identity)throw new AppError(409,'Conecta Google para cargar los archivos autorizados.');
    const page=this.provider.filePage?await this.provider.filePage(tenant,cursor,identity.revision):{files:await this.provider.files(tenant)};
    await this.repo.scoped(tenant,user,'write',async sql=>{const next=await this.identity(sql,tenant);if(!next||next.subject!==identity.subject||next.account!==identity.account||next.revision!==identity.revision)throw new AppError(409,'La cuenta cambió durante la lectura.');});return {...page,connectionRevision:identity.revision};
  }
  async linkMany(tenant:string,user:TeamPrincipal,contact:string,ids:string[],local=false,expectedSource?:string,expectedConnection?:string){
    const selected=[...new Set(z.array(fileId).min(1).max(10).parse(ids))];
    const initial=await this.repo.scoped(tenant,user,'write',sql=>this.binding(sql,tenant,contact,local,expectedSource));
    if(expectedConnection&&initial.identity.revision!==expectedConnection)throw new AppError(409,'La cuenta cambió. Vuelve a cargar los archivos antes de vincular.');
    const files:WorkspaceFile[]=[];
    for(const id of selected){const file=this.provider.file?await this.provider.file(tenant,id,initial.identity.revision):(await this.provider.files(tenant)).find(file=>file.id===id);if(!file||file.id!==id||!supported.includes(file.mimeType))throw new AppError(403,'Selecciona un documento u hoja autorizado para esta cuenta y app.');files.push(file);}
    return this.repo.scoped(tenant,user,'write',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);this.same(initial,await this.binding(sql,tenant,contact,local,expectedSource));
      for(const file of files){await sql.query('INSERT INTO team_file_links(tenant_id,id,contact_id,file_id,name,mime_type,source_key,account,account_subject,connection_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,source_key,contact_id,account_subject,file_id) DO UPDATE SET name=excluded.name,mime_type=excluded.mime_type,account=excluded.account,connection_revision=excluded.connection_revision,detached_at=NULL',[tenant,randomUUID(),contact,file.id,file.name,file.mimeType,initial.sourceKey,initial.identity.account,initial.identity.subject,initial.identity.revision]);}
      await this.repo.audit(sql,tenant,user.uid,'file.link',contact);return {linked:true,count:files.length};
    });
  }
  private async link(sql:Sql,tenant:string,id:string){
    const row=(await sql.query<LinkRow>('SELECT * FROM team_file_links WHERE tenant_id=$1 AND id=$2 AND detached_at IS NULL',[tenant,id])).rows[0];if(!row||!row.source_key||!row.account_subject)throw new AppError(404,'Documento no vinculado a esta empresa, fuente y cuenta.');
    const binding=await this.binding(sql,tenant,row.contact_id,row.source_key==='local',row.source_key);if(binding.identity.subject!==row.account_subject||binding.identity.account!==row.account)throw new AppError(403,'Este vínculo corresponde a otra cuenta Google.');return {row,binding};
  }
  async document(tenant:string,user:TeamPrincipal,id:string){
    const initial=await this.repo.scoped(tenant,user,'write',sql=>this.link(sql,tenant,id));if(initial.row.mime_type!==supported[0]||!this.provider.document)throw new AppError(404,'El vínculo no es un documento legible.');
    const text=await this.provider.document(tenant,initial.row.file_id,initial.binding.identity.revision);
    await this.repo.scoped(tenant,user,'write',async sql=>{this.same(initial.binding,(await this.link(sql,tenant,id)).binding);await this.repo.audit(sql,tenant,user.uid,'file.context.read',id);});
    return {name:initial.row.name,text:text.slice(0,20000),partial:true};
  }
  async detach(tenant:string,user:TeamPrincipal,id:string){return this.repo.scoped(tenant,user,'write',async sql=>{
    const {row}=await this.link(sql,tenant,id);await sql.query('UPDATE team_file_links SET detached_at=$3 WHERE tenant_id=$1 AND id=$2',[tenant,row.id,this.repo.clock().toISOString()]);await this.repo.audit(sql,tenant,user.uid,'file.detach',id);return {detached:true};
  });}
}
