import { generateKeyPairSync,privateDecrypt,createDecipheriv,constants } from 'node:crypto';
import { readFileSync,writeFileSync,unlinkSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { localKey,seal,open } from '../server/crypto.js';
import { storeLocalGoogleClient } from '../server/team/local-config.js';
const folder=resolve('planb-local-google-pilot-2026-10-27');
try{
  const key=localKey(folder),privateFile=join(folder,'.oauth-transfer-private.enc'),publicFile=join(folder,'.oauth-transfer-public.pem'),envelopeFile=join(folder,'.oauth-transfer-envelope.json');
  if(process.argv[2]==='prepare'){
    const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
    writeFileSync(privateFile,seal(pair.privateKey,key),{flag:'wx',mode:0o600});writeFileSync(publicFile,pair.publicKey,{flag:'wx',mode:0o600});console.log('Transporte preparado: clave privada cifrada y protegida por DPAPI.');
  }else if(process.argv[2]==='finish'){
    const envelope=JSON.parse(readFileSync(envelopeFile,'utf8'));
    const transportKey=privateDecrypt({key:open(readFileSync(privateFile,'utf8'),key),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.wrappedKey,'base64'));
    const decipher=createDecipheriv('aes-256-gcm',transportKey,Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const raw=Buffer.concat([decipher.update(Buffer.from(envelope.body,'base64')),decipher.final()]).toString('utf8');const result=storeLocalGoogleClient(folder,raw,key);transportKey.fill(0);
    for(const file of [privateFile,publicFile,envelopeFile])unlinkSync(file);console.log(JSON.stringify({...result,temporaryEncryptedTransportRemoved:true}));
  }else throw new Error('Elige prepare o finish.');
}catch{console.error('No se completó el transporte cifrado. Conserva el diálogo; no se muestran valores secretos.');process.exitCode=1;}
