import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, Store } from './store.js';
import { APP_VERSION } from '../shared/version.js';
import { hashPassword, verifyPassword, type StoredPassword } from './password-hash.js';

const localAuthorization = Symbol('planb.localAuthorization');
type CaptureAuthorization = (cookieHeader?: string) => () => boolean;

/** Retrieve the original authorization capture for this app. Requires registerSecurity. */
export function getLocalAuthorizationCapture(app: FastifyInstance): CaptureAuthorization {
  return app.getDecorator<CaptureAuthorization>(localAuthorization);
}

export function registerSecurity(app: FastifyInstance, store: Store) {
  const sessions = new Map<string,number>(), attempts = new Map<string,{at:number;count:number}>();
  const credential = () => store.get<StoredPassword|null>('password',null);
  const cookie = (header?:string) => /(?:^|;\s*)planb_session=([a-f0-9]+)/.exec(header ?? '')?.[1] ?? '';
  const authenticated = (header?:string,extend=false) => {
    const id = cookie(header), expiry = sessions.get(id);
    if (!expiry || expiry < Date.now()) { sessions.delete(id); return false; }
    if(extend)sessions.set(id,Date.now()+30*60_000); return true;
  };
  // Operations that await I/O can recheck their original authorization without renewing it.
  function captureAuthorization(cookieHeader?: string): () => boolean {
    let protectedAtStart: boolean;
    try {
      protectedAtStart = !!credential();
      if (protectedAtStart && !authenticated(cookieHeader)) return () => false;
    } catch {
      return () => false;
    }
    let current = true;
    return () => {
      if (!current) return false;
      try {
        current = !!credential() === protectedAtStart && (!protectedAtStart || authenticated(cookieHeader));
      } catch {
        current = false;
      }
      return current;
    };
  }
  app.decorate(localAuthorization, captureAuthorization);
  app.addHook('onRequest',async (request,reply) => {
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/') || path.startsWith('/api/v2/auth/') || path === '/api/health') return;
    const extend=request.method!=='GET'||path.startsWith('/api/v2/records/');
    if (credential() && !authenticated(request.headers.cookie,extend)) return reply.code(401).send({error:'Desbloquea tu copia local para continuar.'});
    if(credential()&&extend)reply.header('Set-Cookie','planb_session='+cookie(request.headers.cookie)+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800');
  });
  app.get('/api/health',async()=>({ok:true,version:APP_VERSION,instanceId:store.get('instanceId',null)}));
  app.get('/api/v2/auth/status',async request=>({configured:!!credential(),authenticated:!credential() || authenticated(request.headers.cookie)}));
  app.post('/api/v2/auth/setup',async (request,reply)=>{
    if (credential()) throw new AppError(409,'La protección local ya está configurada.');
    const {password} = z.object({password:z.string().min(12).max(200)}).strict().parse(request.body);
    store.set('password',hashPassword(password));
    const id=randomBytes(32).toString('hex'); sessions.set(id,Date.now()+30*60_000);
    reply.header('Set-Cookie','planb_session='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800');
    return {configured:true};
  });
  app.post('/api/v2/auth/login',async (request,reply)=>{
    const {password}=z.object({password:z.string().max(200)}).strict().parse(request.body);
    const key=request.ip, previous=attempts.get(key), now=Date.now();
    const attempt = previous && now-previous.at<60_000 ? previous : {at:now,count:0};
    if (++attempt.count>5) throw new AppError(429,'Demasiados intentos. Espera un minuto.'); attempts.set(key,attempt);
    const saved=credential();
    const check=verifyPassword(password,saved);
    if (!check.ok) throw new AppError(401,'Contraseña incorrecta.');
    // Una contraseña guardada con parámetros anteriores se vuelve a guardar con los actuales, ya verificada.
    if (check.upgrade) store.set('password',hashPassword(password));
    attempts.delete(key); const id=randomBytes(32).toString('hex'); sessions.set(id,now+30*60_000);
    reply.header('Set-Cookie','planb_session='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800'); return {authenticated:true};
  });
  app.post('/api/v2/auth/lock',async(request,reply)=>{sessions.delete(cookie(request.headers.cookie)); reply.header('Set-Cookie','planb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return {locked:true};});
  return { captureAuthorization };
}
