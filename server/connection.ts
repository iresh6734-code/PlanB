import { z } from 'zod';
import { CaptureSelectionSchema, ConnectionModeSchema, entityNames } from '../shared/model.js';
import { AppError } from './store.js';

export const ConnectionSchema=z.object({
  token:z.string().min(10).max(4096),accountId:z.string().regex(/^\d+$/),
  mode:ConnectionModeSchema.default('test'),confirmedTestAccount:z.boolean().optional(),
  confirmedProduction:z.boolean().optional(),selectedFields:CaptureSelectionSchema
}).strict().superRefine((value,ctx)=>{
  if(value.mode==='test'&&!value.confirmedTestAccount)ctx.addIssue({code:'custom',message:'Confirma la cuenta de ensayo.'});
  if(value.mode==='production_readonly'&&!value.confirmedProduction)ctx.addIssue({code:'custom',message:'Confirma la autorización y el alcance del portal real.'});
});
export type SavedConnection=z.infer<typeof ConnectionSchema>;

/** Read-only transport shared by preflight, capture and production verification. */
export function readonlyFetch(fetcher:typeof fetch):typeof fetch {
  return async(input,init)=>{
    const url=new URL(String(input)),method=(init?.method??'GET').toUpperCase();
    const allowedPost=/^\/crm\/((objects\/2026-09|v3\/objects)\/(contacts|companies|deals|tasks)\/search|(associations\/2026-09|v4\/associations)\/(contacts|companies|deals|tasks)\/(contacts|companies|deals|tasks)\/batch\/read)$/.test(url.pathname);
    if(url.origin!=='https://api.hubapi.com'||!(method==='GET'||method==='POST'&&allowedPost))throw new AppError(403,'Esta conexión solo permite lecturas de HubSpot.');
    return fetcher(input,{...init,redirect:'error'});
  };
}

export async function inspectConnection(connection:SavedConnection,fetcher:typeof fetch=fetch){
  const safe=readonlyFetch(fetcher);
  async function get(path:string){
    const response=await safe('https://api.hubapi.com'+path,{headers:{Authorization:'Bearer '+connection.token},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new AppError(response.status===403?403:502,response.status===401?'HubSpot no aceptó la credencial. Vuelve a copiarla.':response.status===403?'Faltan permisos de lectura. Revisa el alcance de la clave.':'HubSpot no confirmó la lectura. Reintenta conservando tu copia.');
    return response.json();
  }
  const account=await get('/account-info/2026-09/details');
  if(String(account.portalId)!==connection.accountId)throw new AppError(422,'La clave pertenece a otro portal.');
  if(connection.mode==='production_readonly'?account.accountType!=='STANDARD':!['DEVELOPER_TEST','SANDBOX'].includes(account.accountType))throw new AppError(403,'El tipo de cuenta no coincide con el modo seleccionado.');
  const fields:Record<string,{key:string;label:string}[]>={};
  for(const entity of entityNames){
    const data=await get('/crm/properties/2026-09/'+entity);
    if(!Array.isArray(data.results))throw new AppError(502,'No se pudo revisar el esquema.');
    fields[entity]=data.results.filter((p:any)=>!p.archived&&!p.hidden&&p.hubspotDefined!==true).map((p:any)=>({key:String(p.name),label:String(p.label)}));
    if(connection.selectedFields?.[entity]?.some(key=>!data.results.some((p:any)=>p.name===key&&!p.hidden&&!p.archived)))throw new AppError(422,'Un campo seleccionado ya no está disponible.');
  }
  return {accountId:connection.accountId,accountType:String(account.accountType),mode:connection.mode,fields,verifiedAt:new Date().toISOString()};
}
