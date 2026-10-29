import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { embeddedDatabase,type TeamDatabase } from '../server/team/database.js';
import { teamSchema } from '../server/team/schema.js';
import { TeamRepository } from '../server/team/repository.js';
import { CommercialService } from '../server/team/commercial.js';
import { DemoWorkspace } from '../server/team/google.js';
import { createTeamApp } from '../server/team/app.js';
import { makeFixture } from '../shared/fixtures.js';

// Decisión del usuario tras la auditoría: un visor de solo lectura ve únicamente la instantánea guardada.
let db:TeamDatabase,repo:TeamRepository;
const admin={uid:'snap-admin',email:'admin@ficticio.example'},viewer={uid:'snap-viewer',email:'viewer@ficticio.example'};
before(async()=>{db=await embeddedDatabase();await db.exec(teamSchema);repo=new TeamRepository(db);});
after(async()=>db.close());
async function space(){const s=await repo.createSpace(admin,'Visores ficticios');await repo.importSnapshot(s.id,admin,makeFixture());await repo.invite(s.id,admin,viewer.email,'viewer');await repo.spaces(viewer);return s.id;}
async function app(current:()=>{uid:string;email:string}){return (await createTeamApp({db,migrate:false,origin:'https://planb.example',demo:false,verify:async()=>current()})).app;}
const get=(server:Awaited<ReturnType<typeof app>>,url:string)=>server.inject({method:'GET',url,headers:{authorization:'Bearer prueba'}});

test('un visor no puede listar Drive, leer un documento ni consultar HubSpot en vivo; un escritor conserva su acceso',async()=>{
  const id=await space();let user=viewer;const server=await app(()=>user);
  try{
    const base='/api/team/spaces/'+id+'/v6';
    for(const path of [base+'/files',base+'/file-links/'+randomUUID()+'/context',base+'/hubspot/123']){
      user=viewer;const denied=await get(server,path);assert.equal(denied.statusCode,403,'visor: '+path);
      user=admin;const allowed=await get(server,path);assert.ok(allowed.statusCode!==403&&allowed.statusCode<500,'escritor (permitido, sin error de servidor): '+path+' → '+allowed.statusCode);
    }
    user=viewer;for(const path of [base+'/commercial',base+'/copilot','/api/team/spaces/'+id,base+'/capture-diff'])assert.equal((await get(server,path)).statusCode,200,'el visor sí ve la instantánea: '+path);
  }finally{await server.close();}
});

test('la lectura general de Comercial por un visor no modifica la base; la de un escritor concilia las ejecuciones interrumpidas',async()=>{
  const id=await space(),service=new CommercialService(repo,new DemoWorkspace(),true),draft=await service.prepare(id,admin,'contact-1');
  const old=new Date(Date.now()-3600_000).toISOString();
  await repo.system(id,sql=>sql.query("UPDATE team_sales_proposals SET status='executing',started_at=$3 WHERE tenant_id=$1 AND id=$2",[id,draft.id,old]));
  const status=async()=>(await repo.system(id,sql=>sql.query<{status:string}>('SELECT status FROM team_sales_proposals WHERE tenant_id=$1 AND id=$2',[id,draft.id]))).rows[0].status;
  let user=viewer;const server=await app(()=>user);
  try{
    const url='/api/team/spaces/'+id+'/v6/commercial';
    assert.equal((await get(server,url)).statusCode,200);assert.equal(await status(),'executing','la lectura del visor no escribe');
    const sales={uid:'snap-sales',email:'sales@ficticio.example'};await repo.invite(id,admin,sales.email,'sales');await repo.spaces(sales);
    user=sales;assert.equal((await get(server,url)).statusCode,200);assert.equal(await status(),'uncertain','un rol comercial también concilia');
  }finally{await server.close();}
});

test('la lectura del agente por un visor no modifica los análisis; la de un escritor marca los interrumpidos',async()=>{
  const id=await space(),runId=randomUUID(),old=new Date(Date.now()-3600_000).toISOString();
  await repo.system(id,sql=>sql.query("INSERT INTO team_copilot_runs(tenant_id,id,actor,opportunity_id,contact_id,revision,status,created_at) VALUES($1,$2,$3,'o','contact-1','r','running',$4)",[id,runId,viewer.uid,old]));
  const status=async()=>(await repo.system(id,sql=>sql.query<{status:string}>('SELECT status FROM team_copilot_runs WHERE tenant_id=$1 AND id=$2',[id,runId]))).rows[0].status;
  let user=viewer;const server=await app(()=>user);
  try{
    const url='/api/team/spaces/'+id+'/v6/copilot';
    assert.equal((await get(server,url)).statusCode,200);assert.equal(await status(),'running','la lectura del visor no escribe');
    user=admin;assert.equal((await get(server,url)).statusCode,200);assert.equal(await status(),'uncertain');
  }finally{await server.close();}
});
