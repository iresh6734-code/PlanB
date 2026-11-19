import { resolve } from 'node:path';
import type { FastifyRequest } from 'fastify';
import { postgresDatabase, embeddedDatabase } from './database.js';
import { teamSchema } from './schema.js';
import { managedIdentity, workerIdentity } from './identity.js';
import { createTeamApp } from './app.js';
import { seedTeamDemo } from './demo.js';
import { cloudDispatcher } from './dispatch.js';
import { lockInstance } from '../instance.js';
import { localKey } from '../crypto.js';
import { readLocalGoogleClient,readLocalPickerEnabled } from './local-config.js';

async function main(){
const demo=process.env.PLANB_TEAM_DEMO==='1',pilot=process.env.PLANB_TEAM_LOCAL_PILOT==='1',port=pilot?4334:Number(process.env.PORT||process.env.PLANB_TEAM_PORT||4328);
if(pilot&&(demo||process.platform!=='win32'))throw new Error('El piloto real requiere Windows y una instalación distinta de la demo.');
if(demo&&process.env.NODE_ENV==='production')throw new Error('La demo local está bloqueada en producción.');
const folder=resolve(process.env.PLANB_TEAM_DATA_DIR||(pilot?'planb-local-google-pilot-2026-10-27':'data/team-demo')),release=demo||pilot?lockInstance(folder):()=>{};
if(!demo&&!pilot&&!process.env.DATABASE_URL)throw new Error('Configura DATABASE_URL desde Secret Manager.');
const db=demo||pilot?await embeddedDatabase(resolve(folder,'postgres')):postgresDatabase(process.env.DATABASE_URL!);
if(process.env.PLANB_TEAM_ROLE==='migrate'){await db.exec(teamSchema);await db.close();release();process.exit(0);}
const origin=pilot?'http://localhost:4334':demo?'http://127.0.0.1:'+port:process.env.PLANB_TEAM_PUBLIC_ORIGIN;
if(!origin||!demo&&!pilot&&!origin.startsWith('https://'))throw new Error('Configura el origen HTTPS del servicio.');
const workerUrl=pilot?undefined:process.env.PLANB_TEAM_WORKER_URL,workerAccount=pilot?undefined:process.env.PLANB_TEAM_WORKER_ACCOUNT;
const workerCheck=workerAccount?async(token:string,request:FastifyRequest)=>{if(!/^[a-z0-9.-]+\.run\.app$/.test(request.hostname))throw new Error('El ejecutor requiere el dominio gestionado.');return workerIdentity('https://'+request.hostname,workerAccount)(token);}:undefined;
const key=pilot?localKey(folder):process.env.PLANB_TEAM_ENCRYPTION_KEY?Buffer.from(process.env.PLANB_TEAM_ENCRYPTION_KEY,'base64'):null;
const client=pilot?readLocalGoogleClient(folder,key!):null;
// Microsoft/IFR is excluded. Do not inspect or load historical local credentials.
const copilot=null;
const oauth=!pilot&&process.env.HUBSPOT_CLIENT_ID&&process.env.HUBSPOT_CLIENT_SECRET&&key?.length===32?{clientId:process.env.HUBSPOT_CLIENT_ID,clientSecret:process.env.HUBSPOT_CLIENT_SECRET,redirectUri:origin+'/team/oauth/hubspot/callback',encryptionKey:key}:null;
const google=client?{...client,encryptionKey:key!,pickerEnabled:readLocalPickerEnabled(folder)}:process.env.GOOGLE_WORKSPACE_CLIENT_ID&&process.env.GOOGLE_WORKSPACE_CLIENT_SECRET&&key?.length===32?{pickerEnabled:process.env.GOOGLE_PICKER_ENABLED==='1',clientId:process.env.GOOGLE_WORKSPACE_CLIENT_ID,clientSecret:process.env.GOOGLE_WORKSPACE_CLIENT_SECRET,redirectUri:origin+'/team/oauth/google/callback',encryptionKey:key}:null;
const {app,repo,jobs}=await createTeamApp({db,origin,demo,localPilot:pilot?{folder,key:key!}:undefined,localOrigin:demo?process.env.PLANB_LOCAL_ORIGIN:undefined,migrate:demo||pilot,staticDir:resolve('dist'),verify:demo||pilot?undefined:managedIdentity(process.env.GOOGLE_CLOUD_PROJECT||''),workerVerify:workerCheck,
  oauth,google,copilot,firebase:!demo&&!pilot&&process.env.FIREBASE_API_KEY?{apiKey:process.env.FIREBASE_API_KEY,authDomain:process.env.FIREBASE_AUTH_DOMAIN||'',projectId:process.env.GOOGLE_CLOUD_PROJECT||''}:undefined});
let timer:ReturnType<typeof setInterval>|undefined;
if(demo||pilot){if(demo)await seedTeamDemo(repo);let working=false;timer=setInterval(()=>{if(working)return;working=true;void(async()=>{for(const job of await jobs.pending())await jobs.run(job.tenant,job.id);})().catch(()=>{console.error('Plan B · No se pudo revisar la cola; se conserva para el siguiente intento.');}).finally(()=>{working=false;});},3000);timer.unref();}
if(!demo&&workerCheck&&workerUrl&&workerAccount){const dispatch=cloudDispatcher(jobs,{project:process.env.GOOGLE_CLOUD_PROJECT!,region:'europe-west1',queue:process.env.PLANB_TEAM_QUEUE||'planb-jobs',workerUrl,serviceAccount:workerAccount});
  app.post('/internal/dispatch',async request=>{await workerCheck(/^Bearer (.+)$/.exec(request.headers.authorization??'')?.[1]??'',request);return dispatch();});}
await app.listen({host:demo||pilot?'127.0.0.1':'0.0.0.0',port});
console.log(pilot?'Plan B · Piloto local autenticado · '+origin+'/team':demo?'Plan B · Equipo de ensayo local · '+origin+'/team':'Plan B · Servicio de equipos iniciado');
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;if(timer)clearInterval(timer);await app.close();await db.close();release();};
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void stop().then(()=>process.exit(0)));
}
void main().catch(()=>{console.error('Plan B · No se pudo iniciar el servicio. Revisa configuración, permisos y migración; los valores secretos no se registran.');process.exit(1);});
