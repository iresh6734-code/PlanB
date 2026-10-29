import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { OAuth2Client } from 'google-auth-library';
import type { TeamPrincipal } from '../../shared/team.js';
import { AppError } from '../store.js';
export type VerifyIdentity=(token:string)=>Promise<TeamPrincipal>;
export function managedIdentity(projectId:string):VerifyIdentity {
  if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId))throw new Error('Configura el proyecto de Identity Platform.');
  const app=getApps().find(a=>a.name==='planb-team')??initializeApp({projectId},'planb-team');
  return async token=>{try{const value=await getAuth(app).verifyIdToken(token,true);if(!value.email_verified||!value.email)throw new Error('Correo sin verificar');return {uid:value.uid,email:value.email.toLowerCase()};}catch{throw new AppError(401,'Inicia sesión con una cuenta verificada del equipo.');}};
}
export function workerIdentity(audience:string,email:string) {
  const client=new OAuth2Client();
  return async(token:string)=>{try{const ticket=await client.verifyIdToken({idToken:token,audience});const value=ticket.getPayload();if(value?.email!==email||!value.email_verified)throw new Error();return true;}catch{throw new AppError(403,'Solo el ejecutor autorizado puede procesar trabajos.');}};
}
