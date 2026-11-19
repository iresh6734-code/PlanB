import { readFileSync, unlinkSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { storeLocalGoogleClient } from '../server/team/local-config.js';

const [source,folder,remove]=process.argv.slice(2);
try{
  if(process.platform!=='win32')throw new Error('Este guardado requiere la protección DPAPI de Windows.');
  if(!source||!folder||remove&&remove!=='--remove-source')throw new Error('Uso: tsx scripts/store-google-oauth.ts ARCHIVO_JSON CARPETA_NUEVA [--remove-source]');
  const input=resolve(source),destination=resolve(folder);
  if(!basename(destination).startsWith('planb-local-')||statSync(input).size>30000)throw new Error('Selecciona el JSON del cliente y una carpeta independiente de Plan B.');
  const result=storeLocalGoogleClient(destination,readFileSync(input,'utf8'));
  if(remove)unlinkSync(input);
  console.log(JSON.stringify({...result,sourceRemoved:!!remove}));
}catch(error){console.error(error instanceof Error?error.message:'No se pudo guardar OAuth; conserva el archivo de origen.');process.exitCode=1;}
