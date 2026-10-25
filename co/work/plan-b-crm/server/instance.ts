import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export function lockInstance(folder:string) {
  mkdirSync(folder,{recursive:true});const path=join(folder,'.instance');
  if(existsSync(path)) {
    const pid=Number(readFileSync(path,'utf8'));
    try{process.kill(pid,0);throw new Error('Plan B ya está abierto para esta carpeta. Usa la ventana existente.');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;unlinkSync(path);}
  }
  writeFileSync(path,String(process.pid),{flag:'wx'});
  const release=()=>{try{if(readFileSync(path,'utf8')===String(process.pid))unlinkSync(path);}catch{}};
  process.on('exit',release);return release;
}
