import type { Sql } from './database.js';
import { makeDemoSpec } from '../../shared/fixtures.js';
import type { AppSpec,CrmRecord,CrmSnapshot } from '../../shared/model.js';

// A current portal capture stays separate from local edits and historical demos.
export async function salesSource(sql:Sql,tenant:string,local=false){
  const connection=(await sql.query<{account_id:string}>('SELECT account_id FROM team_connections WHERE tenant_id=$1',[tenant])).rows[0];
  if(connection&&!local){
    const capture=(await sql.query<{snapshot:CrmSnapshot}>(`SELECT snapshot FROM team_captures WHERE tenant_id=$1 AND snapshot->'source'->>'accountId'=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,[tenant,connection.account_id])).rows[0];
    if(!capture)return null;
    return {snapshot:capture.snapshot,spec:makeDemoSpec(capture.snapshot),records:capture.snapshot.records,origin:'hubspot' as const,key:'hubspot:'+connection.account_id};
  }
  const row=(await sql.query<{blueprint:{snapshot:CrmSnapshot;spec:AppSpec}|null}>('SELECT blueprint FROM team_spaces WHERE id=$1',[tenant])).rows[0];
  if(!row?.blueprint)return null;
  const records=(await sql.query<{value:CrmRecord}>('SELECT value FROM team_records WHERE tenant_id=$1 ORDER BY entity,id',[tenant])).rows.map(r=>r.value);
  return {...row.blueprint,records,origin:'local' as const,key:'local'};
}
