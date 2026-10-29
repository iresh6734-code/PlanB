import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SnapshotSchema, reconcile, validateSpec, validateRecord, type AppSpec, type CrmRecord, type CrmSnapshot } from '../../shared/model.js';
import { makeDemoSpec } from '../../shared/fixtures.js';
import { permissions, type SyncOperation, type SyncResult, type TeamPrincipal, type TeamRole } from '../../shared/team.js';
import { AppError } from '../store.js';
import type { Sql, TeamDatabase } from './database.js';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
type Member={role:TeamRole;email:string};
/** Una invitación sin canjear caduca a los 14 días; volver a invitar renueva el plazo. */
const INVITE_TTL_MS=14*86_400_000;
export class TeamRepository {
  constructor(public db:TeamDatabase,public clock:()=>Date=()=>new Date()){}
  async scoped<T>(tenant:string,principal:TeamPrincipal,permission:string,run:(sql:Sql,role:TeamRole)=>Promise<T>):Promise<T>{
    return this.db.transaction(async sql=>{
      const member=(await sql.query<Member>('SELECT role,email FROM team_members WHERE tenant_id=$1 AND user_id=$2',[tenant,principal.uid])).rows[0];
      if(!member||!permissions[member.role].includes(permission))throw new AppError(403,'No tienes permiso para esta empresa y operación.');
      await this.context(sql,tenant);return run(sql,member.role);
    });
  }
  async system<T>(tenant:string,run:(sql:Sql)=>Promise<T>){return this.db.transaction(async sql=>{await this.context(sql,tenant);return run(sql);});}
  private async context(sql:Sql,tenant:string){await sql.query('SET LOCAL ROLE planb_scoped');await sql.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);}
  async audit(sql:Sql,tenant:string,actor:string,action:string,reference:string){await sql.query('INSERT INTO team_audit(tenant_id,actor,action,reference) VALUES($1,$2,$3,$4)',[tenant,actor,action,reference]);}
  async spaces(principal:TeamPrincipal){
    await this.db.transaction(async sql=>{
      await sql.query('INSERT INTO team_members(tenant_id,user_id,email,role) SELECT tenant_id,$1,email,role FROM team_invites WHERE email=$2 AND created_at>$3 ON CONFLICT DO NOTHING',[principal.uid,principal.email.toLowerCase(),new Date(this.clock().getTime()-INVITE_TTL_MS).toISOString()]);
      await sql.query('DELETE FROM team_invites WHERE email=$1',[principal.email.toLowerCase()]);
    });
    return (await this.db.query('SELECT s.id,s.name,m.role FROM team_spaces s JOIN team_members m ON m.tenant_id=s.id WHERE m.user_id=$1 ORDER BY s.name',[principal.uid])).rows;
  }
  async createSpace(principal:TeamPrincipal,name:string){const id=randomUUID();await this.db.transaction(async sql=>{await sql.query('INSERT INTO team_spaces(id,name) VALUES($1,$2)',[id,name]);await sql.query('INSERT INTO team_members VALUES($1,$2,$3,$4)',[id,principal.uid,principal.email,'admin']);});return {id,name,role:'admin' as const};}
  async invite(tenant:string,principal:TeamPrincipal,email:string,role:Exclude<TeamRole,'admin'>){return this.scoped(tenant,principal,'members',async sql=>{
    await sql.query('INSERT INTO team_invites(tenant_id,email,role,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,email) DO UPDATE SET role=excluded.role,created_at=excluded.created_at',[tenant,email.toLowerCase(),role,this.clock().toISOString()]);
    await this.audit(sql,tenant,principal.uid,'member.invite',email.toLowerCase());return {invited:true};
  });}
  async changeRole(tenant:string,principal:TeamPrincipal,userId:string,role:TeamRole|null){return this.scoped(tenant,principal,'members',async sql=>{
    await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
    const target=(await sql.query<Member>('SELECT role,email FROM team_members WHERE tenant_id=$1 AND user_id=$2',[tenant,userId])).rows[0];if(!target)throw new AppError(404,'Miembro no encontrado.');
    if(target.role==='admin'&&role!=='admin'&&Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_members WHERE tenant_id=$1 AND role=$2',[tenant,'admin'])).rows[0].n)<=1)throw new AppError(409,'Conserva al menos un administrador.');
    if(role)await sql.query('UPDATE team_members SET role=$3 WHERE tenant_id=$1 AND user_id=$2',[tenant,userId,role]);else await sql.query('DELETE FROM team_members WHERE tenant_id=$1 AND user_id=$2',[tenant,userId]);
    await sql.query('UPDATE team_devices SET revoked_at=$3 WHERE tenant_id=$1 AND owner_id=$2 AND revoked_at IS NULL',[tenant,userId,this.clock().toISOString()]);
    await this.audit(sql,tenant,principal.uid,'member.role',userId);return {updated:true};
  });}
  async importSnapshot(tenant:string,principal:TeamPrincipal,snapshot:CrmSnapshot){return this.scoped(tenant,principal,'connections',async sql=>this.install(sql,tenant,snapshot,principal.uid));}
  async install(sql:Sql,tenant:string,raw:CrmSnapshot,actor:string){
    const snapshot=SnapshotSchema.parse(raw),spec=makeDemoSpec(snapshot);
    const report=reconcile(snapshot),errors=validateSpec(spec,snapshot);
    if(!report.complete||errors.length||snapshot.records.some(record=>Object.keys(validateRecord(spec,record)).length))throw new AppError(422,'La captura no supera las comprobaciones de integridad.');
    await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
    const bound=(await sql.query<{account_id:string;account_type:string}>('SELECT account_id,account_type FROM team_connections WHERE tenant_id=$1',[tenant])).rows[0];
    if(bound&&snapshot.source.accountId!==bound.account_id)throw new AppError(409,'La captura pertenece a otro portal.');
    if(bound?.account_type==='STANDARD'&&(snapshot.source.isTestData||snapshot.source.kind!=='hubspot'||snapshot.source.environment!=='production'||snapshot.source.accountType!=='STANDARD'))throw new AppError(409,'Este espacio está vinculado a un portal real. Conserva los ensayos en otro espacio.');
    if(Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_records WHERE tenant_id=$1',[tenant])).rows[0].n))throw new AppError(409,'Esta empresa ya tiene datos. Conserva la captura nueva aparte y revisa sus diferencias.');
    await sql.query('UPDATE team_spaces SET blueprint=$2::jsonb WHERE id=$1',[tenant,JSON.stringify({snapshot,spec})]);
    await sql.query(`WITH inserted AS (
      INSERT INTO team_records(tenant_id,entity,id,value)
      SELECT $1,record->>'entity',record->>'id',record FROM jsonb_array_elements($2::jsonb) record RETURNING entity,id,value,version
    ) INSERT INTO team_events(tenant_id,entity,record_id,value,version,actor) SELECT $1,entity,id,value,version,$3 FROM inserted`,[tenant,JSON.stringify(snapshot.records),actor]);
    await this.audit(sql,tenant,actor,'snapshot.install',snapshot.id);return {installed:true,records:snapshot.records.length};
  }
  async records(tenant:string,principal:TeamPrincipal){return this.scoped(tenant,principal,'read',async sql=>(await sql.query('SELECT entity,id,value,version::int FROM team_records WHERE tenant_id=$1 ORDER BY entity,id LIMIT 10000',[tenant])).rows);}
  async overview(tenant:string,principal:TeamPrincipal){return this.scoped(tenant,principal,'read',async(sql,role)=>{
    const space=(await sql.query<{id:string;name:string}>('SELECT id,name FROM team_spaces WHERE id=$1',[tenant])).rows[0];
    const members=(await sql.query('SELECT user_id,email,role FROM team_members WHERE tenant_id=$1 ORDER BY email',[tenant])).rows;
    const jobs=(await sql.query('SELECT id,kind,status,attempts,created_at,error,result FROM team_jobs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30',[tenant])).rows;
    const devices=(await sql.query('SELECT id,name,revoked_at,last_seen FROM team_devices WHERE tenant_id=$1 ORDER BY name',[tenant])).rows;
    const conflicts=(await sql.query(`SELECT c.id,c.entity,c.record_id,c.local_values,COALESCE(r.value,'null'::jsonb) remote_value,COALESCE(r.version,0)::int remote_version,c.status
      FROM team_conflicts c LEFT JOIN team_records r ON r.tenant_id=c.tenant_id AND r.entity=c.entity AND r.id=c.record_id WHERE c.tenant_id=$1 AND c.status=$2 LIMIT 50`,[tenant,'open'])).rows;
    const connection=(await sql.query('SELECT account_id,status,verified_at FROM team_connections WHERE tenant_id=$1',[tenant])).rows[0]??null;
    const recordCount=Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_records WHERE tenant_id=$1',[tenant])).rows[0].n);
    return {space:{...space,role},members,jobs,devices,conflicts,connection,recordCount};
  });}
  async pair(tenant:string,principal:TeamPrincipal,name:string){return this.scoped(tenant,principal,'devices',async sql=>{
    const id=randomUUID(),token=randomBytes(32).toString('hex');await sql.query('INSERT INTO team_devices(tenant_id,id,name,token_hash,owner_id) VALUES($1,$2,$3,$4,$5)',[tenant,id,name,digest(token),principal.uid]);
    await sql.query('INSERT INTO team_device_keys VALUES($1,$2,$3,$4)',[digest(token),tenant,id,principal.uid]);
    await this.audit(sql,tenant,principal.uid,'device.pair',id);return {id,token,tenantId:tenant};
  });}
  async revoke(tenant:string,principal:TeamPrincipal,id:string){return this.scoped(tenant,principal,'devices',async sql=>{
    const device=(await sql.query<{owner_id:string}>('SELECT owner_id FROM team_devices WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];
    if(!device)throw new AppError(404,'Dispositivo no encontrado.');
    const member=(await sql.query<Member>('SELECT role,email FROM team_members WHERE tenant_id=$1 AND user_id=$2',[tenant,principal.uid])).rows[0];
    if(device.owner_id!==principal.uid&&!['admin','manager'].includes(member.role))throw new AppError(403,'Solo puedes revocar tus dispositivos.');
    await sql.query('UPDATE team_devices SET revoked_at=$3 WHERE tenant_id=$1 AND id=$2',[tenant,id,this.clock().toISOString()]);await this.audit(sql,tenant,principal.uid,'device.revoke',id);return {revoked:true};
  });}
  async device<T>(token:string,run:(sql:Sql,tenant:string,device:string,owner:string)=>Promise<T>){
    const row=(await this.db.query<{tenant_id:string;id:string;owner_id:string}>('SELECT tenant_id,id,owner_id FROM team_device_keys WHERE token_hash=$1',[digest(token)])).rows[0];
    if(!row)throw new AppError(401,'Vinculación no válida o revocada.');
    return this.db.transaction(async sql=>{
      await this.context(sql,row.tenant_id);
      const check=(await sql.query('SELECT id FROM team_devices WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL FOR UPDATE',[row.tenant_id,row.id])).rows[0];
      const member=(await sql.query<Member>('SELECT role,email FROM team_members WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.owner_id])).rows[0];
      if(!check||!member||!permissions[member.role].includes('devices'))throw new AppError(401,'La vinculación perdió sus permisos.');
      await sql.query('UPDATE team_devices SET last_seen=$3 WHERE tenant_id=$1 AND id=$2',[row.tenant_id,row.id,this.clock().toISOString()]);return run(sql,row.tenant_id,row.id,row.owner_id);
    });
  }
  async exchange(token:string,operations:SyncOperation[],cursor:number){return this.device(token,async(sql,tenant,device,owner)=>{
    const results:SyncResult[]=[];for(const operation of operations)results.push(await this.apply(sql,tenant,device,owner,operation));
    const events=(await sql.query('SELECT seq::text,entity,record_id,value,version::int FROM team_events WHERE tenant_id=$1 AND seq>$2 ORDER BY seq LIMIT 500',[tenant,cursor])).rows;
    const resolved=(await sql.query<{id:string}>("SELECT o.id FROM team_operations o JOIN team_conflicts c ON c.tenant_id=o.tenant_id AND c.id::text=o.result->>'conflictId' WHERE o.tenant_id=$1 AND o.device_id=$2 AND c.status<>'open'",[tenant,device])).rows;
    return {tenantId:tenant,results,events,resolvedConflicts:resolved.map(row=>row.id),cursor:events.length?Number(events.at(-1)!.seq):cursor,hasMore:events.length===500};
  });}
  async apply(sql:Sql,tenant:string,device:string,actor:string,operation:SyncOperation):Promise<SyncResult>{
    const payloadHash=digest(JSON.stringify({id:operation.id,entity:operation.entity,recordId:operation.recordId,baseVersion:operation.baseVersion,values:Object.fromEntries(Object.entries(operation.values).sort(([a],[b])=>a<b?-1:a>b?1:0))}));
    await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
    const prior=(await sql.query<{device_id:string;payload_hash:string;result:SyncResult}>('SELECT device_id,payload_hash,result FROM team_operations WHERE tenant_id=$1 AND id=$2',[tenant,operation.id])).rows[0];
    if(prior){if(prior.device_id!==device||prior.payload_hash!==payloadHash)throw new AppError(409,'El identificador ya corresponde a otra operación.');return prior.result;}
    const current=(await sql.query<{value:CrmRecord;version:string}>('SELECT value,version FROM team_records WHERE tenant_id=$1 AND entity=$2 AND id=$3 FOR UPDATE',[tenant,operation.entity,operation.recordId])).rows[0];
    const version=Number(current?.version??0);let result:SyncResult;
    if(operation.baseVersion!==version){
      const conflictId=randomUUID();await sql.query('INSERT INTO team_conflicts VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)',[tenant,conflictId,operation.entity,operation.recordId,JSON.stringify(operation.values),JSON.stringify(current?.value??null),version,'open']);
      result={operationId:operation.id,status:'conflict',recordId:operation.recordId,version,conflictId};
    }else{
      const blueprint=(await sql.query<{blueprint:{spec:AppSpec}|null}>('SELECT blueprint FROM team_spaces WHERE id=$1',[tenant])).rows[0].blueprint;
      if(!blueprint)throw new AppError(409,'Instala una captura antes de editar.');
      const record:CrmRecord={entity:operation.entity,id:operation.recordId,values:{...current?.value.values,...operation.values}};
      const errors=validateRecord(blueprint.spec,record,current?.value);
      const definition=blueprint.spec.entities.find(e=>e.id===record.entity)!;
      if(Object.keys(operation.values).some(key=>!definition.fields.some(f=>f.key===key&&!f.readOnly)))throw new AppError(422,'Hay campos no editables o desconocidos.');
      for(const field of definition.fields)if(field.type==='reference'&&record.values[field.key]&&!(await sql.query('SELECT id FROM team_records WHERE tenant_id=$1 AND entity=$2 AND id=$3',[tenant,field.referenceEntity,String(record.values[field.key])])).rows.length)errors[field.key]='Referencia fuera de la empresa o ausente.';
      if(Object.keys(errors).length)throw new AppError(422,'Revisa los campos del cambio.',errors);
      if(!current&&Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_records WHERE tenant_id=$1',[tenant])).rows[0].n)>=10000)throw new AppError(413,'Límite de 10.000 registros.');
      await sql.query('INSERT INTO team_records(tenant_id,entity,id,value,version) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(tenant_id,entity,id) DO UPDATE SET value=excluded.value,version=excluded.version',[tenant,record.entity,record.id,JSON.stringify(record),version+1]);await this.event(sql,tenant,record,version+1,actor);
      result={operationId:operation.id,status:'applied',recordId:record.id,version:version+1};
    }
    await sql.query('INSERT INTO team_operations VALUES($1,$2,$3,$4,$5::jsonb)',[tenant,operation.id,device,payloadHash,JSON.stringify(result)]);await this.audit(sql,tenant,actor,'sync.'+result.status,operation.id);return result;
  }
  private async event(sql:Sql,tenant:string,record:CrmRecord,version:number,actor:string){await sql.query('INSERT INTO team_events(tenant_id,entity,record_id,value,version,actor) VALUES($1,$2,$3,$4::jsonb,$5,$6)',[tenant,record.entity,record.id,JSON.stringify(record),version,actor]);}
  async edit(tenant:string,principal:TeamPrincipal,operation:SyncOperation){return this.scoped(tenant,principal,'write',sql=>this.apply(sql,tenant,'00000000-0000-0000-0000-000000000000',principal.uid,operation));}
  async resolve(tenant:string,principal:TeamPrincipal,id:string,decision:'remote'|'local',expectedVersion:number){return this.scoped(tenant,principal,'resolve',async sql=>{
    await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
    const conflict=(await sql.query<{entity:CrmRecord['entity'];record_id:string;local_values:CrmRecord['values'];status:string}>('SELECT entity,record_id,local_values,status FROM team_conflicts WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,id])).rows[0];
    if(!conflict||conflict.status!=='open')throw new AppError(409,'Conflicto ya resuelto o no disponible.');
    const current=(await sql.query<{version:string}>('SELECT version FROM team_records WHERE tenant_id=$1 AND entity=$2 AND id=$3 FOR UPDATE',[tenant,conflict.entity,conflict.record_id])).rows[0];
    if(Number(current?.version??0)!==expectedVersion)throw new AppError(409,'La revisión remota cambió. Vuelve a revisar el conflicto.');
    if(decision==='local')await this.apply(sql,tenant,'00000000-0000-0000-0000-000000000000',principal.uid,{id:randomUUID(),entity:conflict.entity,recordId:conflict.record_id,baseVersion:expectedVersion,values:conflict.local_values});
    await sql.query('UPDATE team_conflicts SET status=$3 WHERE tenant_id=$1 AND id=$2',[tenant,id,'resolved_'+decision]);await this.audit(sql,tenant,principal.uid,'conflict.resolve',id);return {resolved:true};
  });}
  async disconnectHubspot(tenant:string,principal:TeamPrincipal){return this.scoped(tenant,principal,'connections',async sql=>{
    await sql.query('DELETE FROM team_connections WHERE tenant_id=$1',[tenant]);await sql.query('DELETE FROM team_oauth_states WHERE tenant_id=$1',[tenant]);
    await sql.query("UPDATE team_jobs SET status='failed',error='Conexión retirada de Plan B.',lease_token=NULL,lease_until=NULL WHERE tenant_id=$1 AND kind='hubspot-capture' AND status IN ('queued','running')",[tenant]);
    await this.audit(sql,tenant,principal.uid,'hubspot.disconnect','connection');return {disconnected:true};
  });}
}
