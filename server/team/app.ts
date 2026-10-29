import Fastify, { type FastifyRequest } from 'fastify';
import staticPlugin from '@fastify/static';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../store.js';
import { APP_VERSION } from '../../shared/version.js';
import { SnapshotSchema } from '../../shared/model.js';
import { SyncOperationSchema, TeamRoleSchema, type TeamPrincipal } from '../../shared/team.js';
import { type TeamDatabase } from './database.js';
import { teamSchema } from './schema.js';
import { digest, TeamRepository } from './repository.js';
import { TeamJobs } from './jobs.js';
import { TeamOAuth, type HubspotOAuthConfig } from './oauth.js';
import type { VerifyIdentity } from './identity.js';
import { registerHubspotContext } from './hubspot-routes.js';
import { registerCustomers } from './customers.js';
import { registerCommercial } from './commercial-routes.js';
import type { GoogleConfig,WorkspaceProvider } from './google.js';
import { registerLocalPilotAuth, type LocalPilotOptions } from './local-auth.js';
import { makeFixture } from '../../shared/fixtures.js';
import { registerCopilot } from './copilot-routes.js';
import type { CopilotConfig } from './copilot-auth.js';
export const demoUsers=[{uid:'demo-admin',email:'admin@planb.example',label:'Administración'},{uid:'demo-manager',email:'responsable@planb.example',label:'Responsable comercial'},{uid:'demo-sales',email:'comercial@planb.example',label:'Comercial'},{uid:'demo-viewer',email:'lector@planb.example',label:'Solo lectura'}];
export interface TeamAppOptions { db:TeamDatabase;origin:string;localOrigin?:string;localPilot?:LocalPilotOptions;google?:GoogleConfig|null;copilot?:CopilotConfig|null;workspaceProvider?:WorkspaceProvider;demo?:boolean;verify?:VerifyIdentity;workerVerify?:(token:string,request:FastifyRequest)=>Promise<boolean>;staticDir?:string;migrate?:boolean;oauth?:HubspotOAuthConfig|null;fetcher?:typeof fetch;firebase?:{apiKey:string;authDomain:string;projectId:string}; }
export async function createTeamApp(options:TeamAppOptions){
  if(options.demo&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(options.origin))throw new Error('La demo de equipos solo puede escuchar en loopback.');
  if(options.localPilot&&(options.origin!=='http://localhost:4334'||options.demo||options.verify||options.firebase||options.workerVerify||options.workspaceProvider))throw new Error('El piloto requiere su origen local y autenticación propia, sin identidades ni proveedores simulados.');
  if(options.migrate!==false)await options.db.exec(teamSchema);
  const repo=new TeamRepository(options.db),oauth=new TeamOAuth(repo,options.oauth??null,options.fetcher,options.localPilot?.key),jobs=new TeamJobs(repo,(tenant,signal)=>oauth.capture(tenant,signal));
  const app=Fastify({logger:false,bodyLimit:20_000_000,requestTimeout:120000});
  app.setErrorHandler((error,request,reply)=>{const status=error instanceof AppError?error.status:error instanceof z.ZodError?422:500;return reply.code(status).send({error:error instanceof AppError?error.message:error instanceof z.ZodError?'Revisa los datos enviados.':'La operación no se completó. Conserva los cambios pendientes.',requestId:request.id});});
  app.addHook('onRequest',async(request,reply)=>{
    if(request.headers.origin&&request.headers.origin!==options.origin)return reply.code(403).send({error:'Origen no autorizado.'});
    if(options.localPilot){
      if(request.headers.host!=='localhost:4334')return reply.code(403).send({error:'Abre el piloto desde localhost:4334.'});
      if(!['GET','HEAD'].includes(request.method)&&request.headers.origin!==options.origin)return reply.code(403).send({error:'Abre el piloto desde su propia dirección.'});
      if(/^\/api\/team\/(device\/|spaces\/[^/]+\/(invites|members|devices)(\/|$))/.test(request.url))return reply.code(403).send({error:'El piloto local es de un operador. Usa identidad gestionada para compartir acceso.'});
    }
    if(options.demo&&!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host??''))return reply.code(403).send({error:'Demo disponible solo en loopback.'});
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('X-Request-Id',request.id);
    reply.header('Content-Security-Policy',"default-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com https://accounts.google.com; script-src 'self'"+(!options.demo&&options.firebase?" https://apis.google.com":"")+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
  });
  const localPrincipal=options.localPilot?registerLocalPilotAuth(app,options.localPilot):null;
  const bearer=(request:FastifyRequest)=>/^Bearer ([^\s]+)$/.exec(request.headers.authorization??'')?.[1]??'';
  const principal=async(request:FastifyRequest):Promise<TeamPrincipal>=>{
    if(localPrincipal)return localPrincipal(request);
    if(options.demo){const cookie=/planb_team_demo=([a-f0-9]{64})/.exec(request.headers.cookie??'')?.[1];
      if(cookie){const row=(await options.db.query<{user_id:string;email:string}>('SELECT user_id,email FROM team_demo_sessions WHERE token_hash=$1 AND expires_at>$2',[digest(cookie),repo.clock().toISOString()])).rows[0];if(row)return {uid:row.user_id,email:row.email};}
    }
    const token=bearer(request);if(!token||!options.verify)throw new AppError(401,'Inicia sesión para acceder al equipo.');return options.verify(token);
  };
  const tenant=(request:FastifyRequest)=>z.object({tenant:z.string().uuid()}).passthrough().parse(request.params).tenant;
  registerHubspotContext(app,repo,oauth,principal,!!options.demo);
  registerCustomers(app,repo,principal);
  const commercial=registerCommercial(app,repo,{ownAccountOnly:!!options.localPilot,demo:options.demo,google:options.google,fetcher:options.fetcher,provider:options.workspaceProvider,principal});
  // A stale Microsoft configuration must never reactivate a corporate route in the local pilot.
  registerCopilot(app,repo,commercial,options.demo||options.localPilot?null:options.copilot??null,principal,!!(options.demo||options.localPilot));
  const worker=async(request:FastifyRequest)=>{if(!options.workerVerify||!await options.workerVerify(bearer(request),request))throw new AppError(403,'Ejecutor no autorizado.');};
  app.get('/api/team/health',async()=>{await options.db.query('SELECT id FROM team_spaces LIMIT 1');return {ok:true,version:APP_VERSION,mode:options.demo?'local-demo':options.localPilot?'local-pilot':'managed'};});
  app.get('/api/team/config',async()=>({demo:!!options.demo,localPilot:!!options.localPilot,users:options.demo?demoUsers:[],firebase:options.firebase??null,oauthConfigured:!!options.oauth,hubspotPrivate:!!options.localPilot,hubspotProductionPrivate:!!options.localPilot,localOrigin:options.demo&&/^http:\/\/127\.0\.0\.1:\d+$/.test(options.localOrigin??'')?options.localOrigin:null}));
  if(options.localPilot)app.post('/api/team/local-pilot/fixture/:tenant',async request=>{
    z.object({reviewed:z.literal(true)}).strict().parse(request.body);
    const user=await principal(request),id=tenant(request);
    return repo.scoped(id,user,'connections',async sql=>{
      await sql.query('SELECT id FROM team_spaces WHERE id=$1 FOR UPDATE',[id]);
      if((await sql.query('SELECT tenant_id FROM team_connections WHERE tenant_id=$1',[id])).rows.length||(await sql.query('SELECT id FROM team_captures WHERE tenant_id=$1 LIMIT 1',[id])).rows.length)throw new AppError(409,'Este espacio tiene una fuente CRM. Conserva los ensayos en otro espacio.');
      return repo.install(sql,id,makeFixture('agency'),user.uid);
    });
  });
  if(options.demo)app.post('/api/team/demo/session',async(request,reply)=>{
    if(request.headers.origin!==options.origin)throw new AppError(403,'Abre la demo desde su propia dirección.');
    const {uid}=z.object({uid:z.enum(['demo-admin','demo-manager','demo-sales','demo-viewer'])}).strict().parse(request.body);const user=demoUsers.find(u=>u.uid===uid)!;
    const token=randomBytes(32).toString('hex');await options.db.query('DELETE FROM team_demo_sessions WHERE expires_at<=now()');await options.db.query('INSERT INTO team_demo_sessions VALUES($1,$2,$3,$4)',[digest(token),uid,user.email,new Date(Date.now()+3600000).toISOString()]);
    reply.header('Set-Cookie','planb_team_demo='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600');return {signedIn:true};
  });
  app.get('/api/team/spaces',async request=>({spaces:await repo.spaces(await principal(request))}));
  app.post('/api/team/spaces',async request=>{const user=await principal(request);const {name}=z.object({name:z.string().min(2).max(80)}).strict().parse(request.body);if((await repo.spaces(user)).length>=5)throw new AppError(409,'Límite de cinco espacios por usuario en el piloto.');return repo.createSpace(user,name);});
  app.get('/api/team/spaces/:tenant',async request=>repo.overview(tenant(request),await principal(request)));
  app.get('/api/team/spaces/:tenant/records',async request=>({records:await repo.records(tenant(request),await principal(request))}));
  app.post('/api/team/spaces/:tenant/records',async request=>repo.edit(tenant(request),await principal(request),SyncOperationSchema.parse(request.body)));
  app.post('/api/team/spaces/:tenant/invites',async request=>{const body=z.object({email:z.string().email().max(200),role:z.enum(['manager','sales','viewer'])}).strict().parse(request.body);return repo.invite(tenant(request),await principal(request),body.email,body.role);});
  app.post('/api/team/spaces/:tenant/members',async request=>{const body=z.object({userId:z.string().min(1).max(200),role:TeamRoleSchema.nullable()}).strict().parse(request.body);return repo.changeRole(tenant(request),await principal(request),body.userId,body.role);});
  app.post('/api/team/spaces/:tenant/import',async request=>{const body=z.object({snapshot:SnapshotSchema,reviewed:z.literal(true)}).strict().parse(request.body);return repo.importSnapshot(tenant(request),await principal(request),body.snapshot);});
  app.post('/api/team/spaces/:tenant/devices',async request=>{const body=z.object({name:z.string().min(2).max(80)}).strict().parse(request.body);return repo.pair(tenant(request),await principal(request),body.name);});
  app.post('/api/team/spaces/:tenant/devices/:id/revoke',async request=>repo.revoke(tenant(request),await principal(request),z.object({id:z.string().uuid()}).passthrough().parse(request.params).id));
  app.post('/api/team/spaces/:tenant/conflicts/:id',async request=>{const body=z.object({decision:z.enum(['local','remote']),expectedVersion:z.number().int().min(0)}).strict().parse(request.body);return repo.resolve(tenant(request),await principal(request),z.object({id:z.string().uuid()}).passthrough().parse(request.params).id,body.decision,body.expectedVersion);});
  app.post('/api/team/spaces/:tenant/jobs',async request=>{const body=z.object({kind:z.enum(['sync-audit','hubspot-capture']),dedupeKey:z.string().uuid()}).strict().parse(request.body);return jobs.enqueue(tenant(request),await principal(request),body.kind,body.dedupeKey);});
  app.post('/api/team/spaces/:tenant/oauth/hubspot/begin',async request=>{const body=z.object({accountId:z.string().regex(/^\d+$/),authorizedRead:z.literal(true),extendedRead:z.boolean().default(false)}).strict().parse(request.body);return oauth.begin(tenant(request),await principal(request),body.accountId,body.extendedRead);});
  app.post('/api/team/spaces/:tenant/hubspot/private',async request=>{if(!options.localPilot)throw new AppError(403,'Conexión privada disponible solo en el piloto local.');const body=z.object({accountId:z.string().regex(/^\d+$/),token:z.string().min(10).max(4096),reviewed:z.literal(true)}).strict().parse(request.body);return oauth.connectPrivate(tenant(request),await principal(request),body.token,body.accountId);});
  app.post('/api/team/spaces/:tenant/hubspot/private-production',async request=>{if(!options.localPilot)throw new AppError(403,'Conexión privada disponible solo en el piloto local.');return oauth.connectPrivateProduction(tenant(request),await principal(request),request.body);});
  app.post('/api/team/spaces/:tenant/oauth/hubspot/complete',async request=>{const body=z.object({state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(1).max(2000)}).strict().parse(request.body);return oauth.complete(tenant(request),await principal(request),body.state,body.code);});
  app.post('/api/team/spaces/:tenant/oauth/hubspot/disconnect',async request=>{z.object({reviewed:z.literal(true)}).strict().parse(request.body);return repo.disconnectHubspot(tenant(request),await principal(request));});
  app.get('/api/team/device/bootstrap',async request=>repo.device(bearer(request),async(sql,id)=>{
    const data=(await sql.query<{blueprint:unknown}>('SELECT blueprint FROM team_spaces WHERE id=$1',[id])).rows[0];if(!data?.blueprint)throw new AppError(409,'Todavía no hay una captura disponible.');
    const records=(await sql.query('SELECT entity,id,value,version::int FROM team_records WHERE tenant_id=$1 ORDER BY entity,id LIMIT 10000',[id])).rows;
    const cursor=Number((await sql.query<{n:string}>('SELECT COALESCE(max(seq),0)::text n FROM team_events WHERE tenant_id=$1',[id])).rows[0].n);
    return {tenantId:id,demo:!!options.demo,blueprint:data.blueprint,records,cursor};
  }));
  app.post('/api/team/device/exchange',async request=>{const body=z.object({operations:z.array(SyncOperationSchema).max(100),cursor:z.number().int().nonnegative()}).strict().parse(request.body);return repo.exchange(bearer(request),body.operations,body.cursor);});
  app.post('/internal/jobs/:tenant/:id',async request=>{await worker(request);const params=z.object({tenant:z.string().uuid(),id:z.string().uuid()}).parse(request.params);return jobs.run(params.tenant,params.id);});
  if(options.staticDir&&existsSync(options.staticDir)){await app.register(staticPlugin,{root:options.staticDir});app.get('/',async(_request,reply)=>reply.redirect('/team'));app.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')||request.url.startsWith('/internal/')?reply.code(404).send({error:'Operación no disponible.'}):reply.sendFile('index.html'));}
  return {app,repo,jobs,oauth};
}
