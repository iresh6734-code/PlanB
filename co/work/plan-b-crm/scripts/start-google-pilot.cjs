// Dedicated runtime and new data folder on the current Windows computer.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {ensureAlias}=require('./start-pilot-alias.cjs');
const source=path.resolve(__dirname,'..'),folder=path.join(source,'planb-local-google-pilot-2026-10-27');
const origin='http://localhost:4334';
async function health(){try{const response=await fetch(origin+'/api/team/health',{signal:AbortSignal.timeout(1000)});return response.ok?await response.json():null;}catch{return null;}}
(async()=>{
  if(process.platform!=='win32')throw new Error('Este piloto utiliza protección de Windows.');
  if(!fs.existsSync(path.join(folder,'.google-oauth.enc'))||!fs.existsSync(path.join(folder,'.planb-key')))throw new Error('Falta la configuración Google cifrada de esta instalación.');
  const existing=await health();
  if(existing){if(existing.mode!=='local-pilot'||!fs.existsSync(path.join(folder,'.instance')))throw new Error('El puerto está ocupado por otro servicio.');await ensureAlias();console.log('Plan B: '+origin+'/team');return;}
  fs.mkdirSync(path.join(folder,'runtime'),{recursive:true});
  fs.copyFileSync(path.join(source,'build','team.mjs'),path.join(folder,'runtime','team.mjs'));
  fs.copyFileSync(path.join(source,'build','copilot-worker.mjs'),path.join(folder,'runtime','copilot-worker.mjs'));
  fs.cpSync(path.join(source,'dist'),path.join(folder,'runtime','dist'),{recursive:true});
  const modules=path.join(folder,'runtime','node_modules');if(!fs.existsSync(modules))fs.symlinkSync(path.join(source,'node_modules'),modules,'junction');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/API_KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|^PG|^FIREBASE_|^GOOGLE_|^HUBSPOT_|NODE_OPTIONS|NODE_ENV|^PLANB_/i.test(name)));
  const log=fs.openSync(path.join(folder,'pilot.log'),'a');
  const child=spawn(process.execPath,[path.join(folder,'runtime','team.mjs')],{cwd:path.join(folder,'runtime'),env:{...env,PLANB_TEAM_LOCAL_PILOT:'1',PLANB_TEAM_DATA_DIR:folder},windowsHide:true,detached:true,stdio:['ignore',log,log]});
  child.unref();fs.closeSync(log);
  for(let i=0;i<80;i++){const result=await health();if(result?.mode==='local-pilot'){await ensureAlias();console.log(JSON.stringify({ok:true,url:origin+'/team',pid:child.pid,mode:result.mode}));return;}await new Promise(resolve=>setTimeout(resolve,500));}
  throw new Error('No se confirmó el arranque. Revisa pilot.log en la carpeta del piloto.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
