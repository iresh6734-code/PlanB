import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { localKey, open, seal } from '../crypto.js';

const webClient=z.object({web:z.object({
  project_id:z.literal('planb-crm-piloto-20261027'),
  client_id:z.string().regex(/^699668775458-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/),
  client_secret:z.string().min(12).max(500),
  redirect_uris:z.array(z.string()).refine(uris=>uris.length===1&&uris[0]==='http://localhost:4334/team/oauth/google/callback')
})});
export interface LocalGoogleClient {projectId:string;clientId:string;clientSecret:string;redirectUri:string;}
export function readLocalPickerEnabled(folder:string){const file=join(folder,'google-picker.json');return existsSync(file)?z.object({enabled:z.boolean()}).strict().parse(JSON.parse(readFileSync(file,'utf8'))).enabled:false;}
export function parseLocalGoogleClient(raw:string):LocalGoogleClient {
  try{const value=webClient.parse(JSON.parse(raw)).web;return {projectId:value.project_id,clientId:value.client_id,clientSecret:value.client_secret,redirectUri:value.redirect_uris[0]};}
  catch{throw new Error('El archivo no corresponde al cliente web del piloto ni a su callback autorizado.');}
}
export function readLocalGoogleClient(folder:string,key=localKey(folder)):LocalGoogleClient {
  const raw=readFileSync(join(folder,'.google-oauth.enc'),'utf8');
  if(!raw.startsWith('enc1:'))throw new Error('La configuración OAuth debe estar cifrada.');
  const value=JSON.parse(open(raw,key));return parseLocalGoogleClient(JSON.stringify({web:{project_id:value.projectId,client_id:value.clientId,client_secret:value.clientSecret,redirect_uris:[value.redirectUri]}}));
}
export function storeLocalGoogleClient(folder:string,raw:string,key=localKey(folder)) {
  const value=parseLocalGoogleClient(raw),path=join(folder,'.google-oauth.enc');
  if(existsSync(path))throw new Error('Ya hay una configuración OAuth en esta carpeta. No se ha sustituido.');
  writeFileSync(path,seal(JSON.stringify(value),key),{encoding:'utf8',mode:0o600,flag:'wx'});
  const check=readLocalGoogleClient(folder,key);if(check.clientId!==value.clientId||check.clientSecret!==value.clientSecret)throw new Error('No se confirmó la configuración cifrada. Conserva el archivo de origen.');
  return {stored:true,projectId:value.projectId,redirectUri:value.redirectUri};
}
