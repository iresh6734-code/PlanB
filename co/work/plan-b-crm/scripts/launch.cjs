// Windows portable launcher. No installation, admin rights or network exposure.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=__dirname;
const data=path.join(root,'data'),endpoint=path.join(data,'.endpoint.json');
const entry=process.argv[2]==='runtime.mjs'?'runtime.mjs':'server.mjs';
const noBrowser=process.env.PLANB_LAUNCH_NO_BROWSER==='1';
async function existing(){
  try{
    const value=JSON.parse(fs.readFileSync(endpoint,'utf8'));
    if(typeof value.url!=='string'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)||typeof value.instanceId!=='string'||!value.instanceId)return null;
    const response=await fetch(value.url+'/api/health',{signal:AbortSignal.timeout(1500),redirect:'error'});
    if(!response.ok){
      await response.body?.cancel();
      return null;
    }
    const health=await response.json();
    return health.ok&&health.instanceId===value.instanceId?value.url:null;
  }catch{return null;}
}
async function hasHome(url){
  try{
    const response=await fetch(url+'/',{signal:AbortSignal.timeout(1500),redirect:'error'});
    const type=response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
    await response.body?.cancel();
    return response.ok&&type==='text/html';
  }catch{return false;}
}
function open(url){
  console.log('Plan B disponible: '+url);
  if(noBrowser)return;
  const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});
  child.on('error',()=>console.log('Abre la dirección indicada en tu navegador.'));child.unref();
}
async function openIfReady(){
  const url=await existing();
  if(!url)return false;
  if(!(await hasHome(url))){
    throw new Error('Plan B responde, pero la portada no está disponible. Comprueba que la carpeta incluya dist/index.html.');
  }
  open(url);
  return true;
}
(async()=>{
  if(await openIfReady())return;
  for(const file of [entry,'dist/index.html']){
    if(!fs.statSync(path.join(root,file),{throwIfNoEntry:false})?.isFile()){
      throw new Error('Extrae el paquete completo antes de abrirlo. Falta '+file+'.');
    }
  }
  fs.mkdirSync(data,{recursive:true});
  const logfile=path.join(data,'startup.log');
  if(fs.existsSync(logfile)&&fs.statSync(logfile).size>1024*1024)fs.writeFileSync(logfile,'');
  const platformVariables=new Set(['path','systemroot','windir','comspec','pathext','temp','tmp','tmpdir','lang','lc_all','lc_ctype','tz','processor_architecture','number_of_processors']);
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>platformVariables.has(name.toLowerCase())));
  env.PLANB_DATA_DIR=data;
  const log=fs.openSync(logfile,'a');
  const child=spawn(process.execPath,[path.join(root,entry)],{cwd:root,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
  for(let i=0;i<120;i++){
    if(await openIfReady())return;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('No se confirmó el arranque. Conserva la carpeta y revisa data/startup.log.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
