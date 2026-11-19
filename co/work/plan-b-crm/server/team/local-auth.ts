import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TeamPrincipal } from '../../shared/team.js';
import { open, seal } from '../crypto.js';
import { AppError } from '../store.js';

const credentialSchema=z.object({uid:z.string().uuid(),salt:z.string().regex(/^[a-f0-9]{32}$/),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export interface LocalPilotOptions {folder:string;key:Buffer;clock?:()=>number;}
// A single operator on this Windows installation. This is not managed team identity.
export function registerLocalPilotAuth(app:FastifyInstance,options:LocalPilotOptions){
  const file=join(options.folder,'.operator.enc'),now=options.clock??Date.now;
  let saved:z.infer<typeof credentialSchema>|null=null;
  if(existsSync(file)){
    const raw=readFileSync(file,'utf8');if(!raw.startsWith('enc1:'))throw new Error('La protección del piloto debe estar cifrada.');
    saved=credentialSchema.parse(JSON.parse(open(raw,options.key)));
  }
  const sessions=new Map<string,number>();let attempts={start:now(),count:0};
  const cookie=(r:FastifyRequest)=>/(?:^|;\s*)planb_pilot=([a-f0-9]{64})(?:;|$)/.exec(r.headers.cookie??'')?.[1]??'';
  const active=(r:FastifyRequest)=>{const id=cookie(r),expiry=sessions.get(id);if(!expiry||expiry<=now()){sessions.delete(id);return false;}return true;};
  const principal=async(r:FastifyRequest):Promise<TeamPrincipal>=>{
    if(!saved||!active(r))throw new AppError(401,'Desbloquea el piloto local para continuar.');
    return {uid:saved.uid,email:'operador@piloto.planb.invalid'};
  };
  const session=()=>{
    for(const [id,expiry] of sessions)if(expiry<=now())sessions.delete(id);
    if(sessions.size>=8)sessions.delete(sessions.keys().next().value!);
    const token=randomBytes(32).toString('hex');sessions.set(token,now()+30*60_000);
    return 'planb_pilot='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800';
  };
  app.get('/api/team/local-pilot/status',async r=>({configured:!!saved,authenticated:!!saved&&active(r)}));
  app.post('/api/team/local-pilot/setup',async(r,reply)=>{
    if(saved)throw new AppError(409,'La protección ya está configurada.');
    const {password}=z.object({password:z.string().min(12).max(200)}).strict().parse(r.body);
    const salt=randomBytes(16).toString('hex'),value={uid:randomUUID(),salt,hash:scryptSync(password,Buffer.from(salt,'hex'),32).toString('hex')};
    writeFileSync(file,seal(JSON.stringify(value),options.key),{flag:'wx',mode:0o600});saved=value;
    reply.header('Set-Cookie',session());return {authenticated:true};
  });
  app.post('/api/team/local-pilot/login',async(r,reply)=>{
    if(now()-attempts.start>=60_000)attempts={start:now(),count:0};
    if(++attempts.count>5)throw new AppError(429,'Demasiados intentos. Espera un minuto.');
    const {password}=z.object({password:z.string().max(200)}).strict().parse(r.body);
    if(!saved||!timingSafeEqual(scryptSync(password,Buffer.from(saved.salt,'hex'),32),Buffer.from(saved.hash,'hex')))throw new AppError(401,'Contraseña incorrecta.');
    attempts.count=0;reply.header('Set-Cookie',session());return {authenticated:true};
  });
  app.post('/api/team/local-pilot/lock',async(r,reply)=>{
    sessions.delete(cookie(r));reply.header('Set-Cookie','planb_pilot=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return {locked:true};
  });
  app.addHook('onClose',async()=>{sessions.clear();});
  return principal;
}
