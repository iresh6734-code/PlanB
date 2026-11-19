import { randomUUID } from 'node:crypto';
import { AppError } from '../store.js';
import type { TeamPrincipal } from '../../shared/team.js';
import type { CrmSnapshot } from '../../shared/model.js';
import { TeamRepository } from './repository.js';
export class TeamJobs {
  constructor(private repo:TeamRepository,private capture?:(tenant:string,signal:AbortSignal)=>Promise<CrmSnapshot>){}
  async enqueue(tenant:string,principal:TeamPrincipal,kind:'sync-audit'|'hubspot-capture',dedupe:string){return this.repo.scoped(tenant,principal,kind==='hubspot-capture'?'connections':'jobs',async sql=>{
    const id=randomUUID();await sql.query('INSERT INTO team_jobs(tenant_id,id,kind,dedupe_key) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,dedupe_key) DO NOTHING',[tenant,id,kind,dedupe]);
    const job=(await sql.query<{id:string;kind:string}>('SELECT id,kind FROM team_jobs WHERE tenant_id=$1 AND dedupe_key=$2',[tenant,dedupe])).rows[0];
    if(job.kind!==kind)throw new AppError(409,'La clave ya identifica otro trabajo.');await this.repo.audit(sql,tenant,principal.uid,'job.enqueue',job.id);return job;
  });}
  async run(tenant:string,id:string){
    const now=this.repo.clock(),lease=randomUUID();
    const claimed=await this.repo.system(tenant,async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[tenant]);
      if((await sql.query("SELECT id FROM team_copilot_runs WHERE tenant_id=$1 AND status='running' AND created_at>$2",[tenant,new Date(now.getTime()-120000).toISOString()])).rows.length)return null;
      if((await sql.query("SELECT id FROM team_sales_proposals WHERE tenant_id=$1 AND status IN ('executing','reconciling') AND started_at>$2",[tenant,new Date(now.getTime()-120000).toISOString()])).rows.length)return null;
      if((await sql.query('SELECT id FROM team_jobs WHERE tenant_id=$1 AND status=$2 AND lease_until>$3',[tenant,'running',now.toISOString()])).rows.length)return null;
      return (await sql.query<{id:string;kind:string;attempts:number}>(`UPDATE team_jobs SET status='running',attempts=attempts+1,lease_token=$3,lease_until=$4,error=NULL
        WHERE tenant_id=$1 AND id=$2 AND attempts<3 AND available_at<=$5 AND (status='queued' OR (status='running' AND lease_until<=$5)) RETURNING id,kind,attempts`,[tenant,id,lease,new Date(now.getTime()+150000).toISOString(),now.toISOString()])).rows[0]??null;
    });
    if(!claimed)return {claimed:false};
    try {
      const snapshot=claimed.kind==='hubspot-capture'?await this.capture?.(tenant,AbortSignal.timeout(100000)):null;
      if(claimed.kind==='hubspot-capture'&&!snapshot)throw new Error('Conector no configurado');
      return await this.repo.system(tenant,async sql=>{
        const job=(await sql.query('SELECT id FROM team_jobs WHERE tenant_id=$1 AND id=$2 AND lease_token=$3 AND status=$4 FOR UPDATE',[tenant,id,lease,'running'])).rows[0];
        if(!job)throw new AppError(409,'Otro ejecutor ha recuperado este trabajo.');
        let result:unknown;
        if(snapshot){
          await sql.query('INSERT INTO team_captures(tenant_id,id,snapshot) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[tenant,id,JSON.stringify(snapshot)]);
          const count=Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_records WHERE tenant_id=$1',[tenant])).rows[0].n);
          if(!count)await this.repo.install(sql,tenant,snapshot,'worker');
          result={captureId:id,records:snapshot.records.length,installed:count===0};
        }else result={records:Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_records WHERE tenant_id=$1',[tenant])).rows[0].n),conflicts:Number((await sql.query<{n:string}>('SELECT count(*) n FROM team_conflicts WHERE tenant_id=$1 AND status=$2',[tenant,'open'])).rows[0].n)};
        await sql.query('UPDATE team_jobs SET status=$4,result=$5::jsonb,lease_until=NULL WHERE tenant_id=$1 AND id=$2 AND lease_token=$3',[tenant,id,lease,'succeeded',JSON.stringify(result)]);
        await this.repo.audit(sql,tenant,'worker','job.succeeded',id);return {claimed:true,status:'succeeded',result};
      });
    }catch{
      await this.repo.system(tenant,async sql=>{
        await sql.query('UPDATE team_jobs SET status=$4,error=$5,available_at=$6,lease_until=NULL WHERE tenant_id=$1 AND id=$2 AND lease_token=$3 AND status=$7',[tenant,id,lease,claimed.attempts>=3?'failed':'queued','No se completó el trabajo de lectura. Revisa conexión y permisos.',new Date(this.repo.clock().getTime()+30000*2**(claimed.attempts-1)).toISOString(),'running']);
      });return {claimed:true,status:'retry_or_failed'};
    }
  }
  async pending(){const spaces=(await this.repo.db.query<{id:string}>('SELECT id FROM team_spaces ORDER BY created_at')).rows;const pending:{tenant:string;id:string;attempts:number}[]=[];
    for(const space of spaces)await this.repo.system(space.id,async sql=>{
      await sql.query("UPDATE team_jobs SET status='failed',error='Se agotaron los intentos después de una interrupción.' WHERE tenant_id=$1 AND status='running' AND lease_until<=$2 AND attempts>=3",[space.id,this.repo.clock().toISOString()]);
      const jobs=(await sql.query<{id:string;attempts:number}>("SELECT id,attempts FROM team_jobs WHERE tenant_id=$1 AND attempts<3 AND available_at<=$2 AND (status='queued' OR (status='running' AND lease_until<=$2)) ORDER BY created_at LIMIT 10",[space.id,this.repo.clock().toISOString()])).rows;
      pending.push(...jobs.map(job=>({...job,tenant:space.id})));
    });return pending;
  }
}
