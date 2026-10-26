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
    if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)||!value.instanceId)return null;
    const response=await fetch(value.url+'/api/health',{signal:AbortSignal.timeout(1500)});
    const health=await response.json();
    return health.ok&&health.instanceId===value.instanceId?value.url:null;
  }catch{return null;}
}
function open(url){
  console.log('Plan B disponible: '+url);
  if(noBrowser)return;
  const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});
  child.on('error',()=>console.log('Abre la dirección indicada en tu navegador.'));child.unref();
}
(async()=>{
  let url=await existing();if(url){open(url);return;}
  if(!fs.existsSync(path.join(root,entry)))throw new Error('Extrae el paquete completo antes de abrirlo.');
  fs.mkdirSync(data,{recursive:true});
  const logfile=path.join(data,'startup.log');
  if(fs.existsSync(logfile)&&fs.statSync(logfile).size>1024*1024)fs.writeFileSync(logfile,'');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/API_KEY|TOKEN|SECRET|NODE_OPTIONS|NODE_ENV|^PLANB_/i.test(name)));
  env.PLANB_DATA_DIR=data;
  const log=fs.openSync(logfile,'a');
  const child=spawn(process.execPath,[path.join(root,entry)],{cwd:root,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
  for(let i=0;i<120;i++){
    url=await existing();if(url){open(url);return;}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('No se confirmó el arranque. Conserva la carpeta y revisa data/startup.log.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
