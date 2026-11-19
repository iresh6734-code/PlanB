const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
async function ensureAlias(){
  try{const response=await fetch('http://127.0.0.1:4335/api/team/health',{signal:AbortSignal.timeout(1000)});const state=await response.json();return state.mode==='pilot-alias';}catch(error){if(error?.cause?.code&&error.cause.code!=='ECONNREFUSED')return false;}
  const source=path.resolve(__dirname,'..'),folder=path.join(source,'planb-local-google-pilot-2026-10-27');
  const log=fs.openSync(path.join(folder,'alias.log'),'a');
  const child=spawn(process.execPath,[path.join(source,'build','pilot-alias.mjs')],{cwd:source,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,PLANB_PILOT_ALIAS:'1'},windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
  fs.writeFileSync(path.join(folder,'.alias-instance'),String(child.pid));return true;
}
module.exports={ensureAlias};if(require.main===module)void ensureAlias().then(ok=>console.log(ok?'Entrada anterior enlazada al piloto.':'El puerto anterior pertenece a otro servicio. No se modifica.'));
