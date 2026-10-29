import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve,join,sep } from 'node:path';
import { parseLocalGoogleClient,storeLocalGoogleClient,readLocalGoogleClient } from '../server/team/local-config.js';
const raw=JSON.stringify({web:{project_id:'planb-crm-piloto-20261027',client_id:'699668775458-synthetic.apps.googleusercontent.com',client_secret:'synthetic-client-secret-only',redirect_uris:['http://localhost:4334/team/oauth/google/callback']}});
test('OAuth local: cifrado, recuperación, otra clave y rechazo de sustitución',()=>{
  const root=resolve('tests/.tmp');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'google-config-')),key=randomBytes(32);
  try{assert.equal(storeLocalGoogleClient(folder,raw,key).stored,true);const content=readFileSync(join(folder,'.google-oauth.enc'),'utf8');assert.ok(content.startsWith('enc1:'));assert.ok(!content.includes('synthetic-client-secret'));assert.equal(readLocalGoogleClient(folder,key).clientSecret,'synthetic-client-secret-only');assert.throws(()=>readLocalGoogleClient(folder,randomBytes(32)));assert.throws(()=>storeLocalGoogleClient(folder,raw,key),/sustituido/);}
  finally{assert.ok(folder.startsWith(root+sep));rmSync(folder,{recursive:true,force:true});}
});
test('OAuth local: rechaza otro proyecto/callback y configuración sin cifrar, sin mostrar secretos',()=>{
  assert.throws(()=>parseLocalGoogleClient(raw.replace('planb-crm-piloto-20261027','otro-proyecto')),/cliente web/);assert.throws(()=>parseLocalGoogleClient(raw.replace('localhost:4334','otro.example')),/cliente web/);assert.throws(()=>parseLocalGoogleClient('{"client_secret":"never-logged"}'),e=>e instanceof Error&&!e.message.includes('never-logged'));
  const root=resolve('tests/.tmp');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'google-config-'));try{writeFileSync(join(folder,'.google-oauth.enc'),raw);assert.throws(()=>readLocalGoogleClient(folder,randomBytes(32)),/cifrada/);}finally{assert.ok(folder.startsWith(root+sep));rmSync(folder,{recursive:true,force:true});}
});
