import type { CrmRecord, EntityName, FieldValue, AppSpec } from '../shared/model.js';
import type { Remote } from './recovery.js';
import { AppError } from './store.js';
import { readonlyFetch } from './connection.js';
export function hubspotRemote(token:string,accountId:string,spec:AppSpec,fetcher:typeof fetch=fetch,readOnly=false):Remote {
  if(readOnly)fetcher=readonlyFetch(fetcher);
  async function request(path:string,method='GET',body?:unknown):Promise<any> {
    let response:Response;
    try{response=await fetcher('https://api.hubapi.com'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30_000)});}
    catch(error){if(error instanceof AppError)throw error;throw new AppError(502,'No se confirmó la conexión con HubSpot.');}
    if(response.status===404&&method==='GET')return null;
    if(!response.ok||response.status===207)throw new AppError(response.status===401||response.status===403?response.status:502,'HubSpot no confirmó la operación ('+response.status+'). Comprueba permisos y estado del portal.');
    if(response.status===204)return {};
    const data=await response.json() as any;if(data.errors?.length)throw new AppError(502,'HubSpot devolvió errores parciales.');return data;
  }
  function values(entity:EntityName,raw:Record<string,string|null>) {
    const fields=spec.entities.find(e=>e.id===entity)!.fields;
    return Object.fromEntries(fields.filter(f=>f.type!=='reference').map(f=>{
      const value=raw[f.key];let normalized:FieldValue=value??null;
      if(value!==null&&value!==undefined&&value!==''){
        if(f.type==='number')normalized=Number(value);
        if(f.type==='boolean')normalized=value==='true';
        if(f.type==='datetime')normalized=new Date(/^\d+$/.test(value)?Number(value):value).toISOString();
        if(f.type==='date')normalized=new Date(/^\d+$/.test(value)?Number(value):value).toISOString().slice(0,10);
      }else normalized=null;return [f.key,normalized];
    }));
  }
  const encode=(entity:EntityName,input:CrmRecord['values'])=>{
    const fields=spec.entities.find(e=>e.id===entity)!.fields;
    return Object.fromEntries(Object.entries(input).map(([key,value])=>{
      const field=fields.find(f=>f.key===key);
      if(!field||field.readOnly||field.type==='reference')throw new AppError(422,'Campo remoto no editable: '+key);
      return [key,value===null?'':String(value)];
    }));
  };
  return {source:'hubspot',accountId,
    readOnly,
    async verify(){const account=await request('/account-info/v3/details');if(String(account?.portalId)!==accountId)throw new AppError(422,'Credencial de otro portal.');if(readOnly?account.accountType!=='STANDARD':!['DEVELOPER_TEST','SANDBOX'].includes(account.accountType))throw new AppError(403,'Devolución habilitada solo para cuentas de prueba; producción solo permite lectura.');},
    async read(entity,id){
      const fields=spec.entities.find(e=>e.id===entity)!.fields.filter(f=>f.type!=='reference').map(f=>f.key);
      const result=await request('/crm/v3/objects/'+entity+'/'+encodeURIComponent(id)+'?properties='+encodeURIComponent(fields.join(',')));
      return !result||result.archived?null:{id:String(result.id),entity,values:values(entity,result.properties)};
    },
    async create(entity,input,operationId){
      const result=await request('/crm/v3/objects/'+entity,'POST',{properties:encode(entity,input)});
      if(!result?.id)throw new AppError(502,'HubSpot no devolvió el identificador creado.');return String(result.id);
    },
    async update(entity,id,input){await request('/crm/v3/objects/'+entity+'/'+encodeURIComponent(id),'PATCH',{properties:encode(entity,input)});},
    async relate(entity,id,target,targetId){
      await request('/crm/v4/objects/'+entity+'/'+encodeURIComponent(id)+'/associations/default/'+target+'/'+encodeURIComponent(targetId),'PUT');
      let after='',confirmed=false;const seen=new Set<string>();
      do{
        const page=await request('/crm/v4/objects/'+entity+'/'+encodeURIComponent(id)+'/associations/'+target+'?limit=500'+(after?'&after='+encodeURIComponent(after):''));
        if(page?.results?.some((r:{toObjectId:number|string})=>String(r.toObjectId)===targetId))confirmed=true;
        after=page?.paging?.next?String(page.paging.next.after):'';
        if(after&&seen.has(after))throw new AppError(502,'HubSpot repitió un cursor al verificar la relación.');
        if(after)seen.add(after);
      }while(after&&!confirmed);
      if(!confirmed)throw new AppError(502,'HubSpot no confirmó la relación añadida.');
    },
    async hasRelation(entity,id,target,targetId){
      let after='';const seen=new Set<string>();
      do {
        const page=await request('/crm/v4/objects/'+entity+'/'+encodeURIComponent(id)+'/associations/'+target+'?limit=500'+(after?'&after='+encodeURIComponent(after):''));
        if(!Array.isArray(page?.results))throw new AppError(502,'No se pudo comprobar la relación.');
        if(page.results.some((r:{toObjectId:string|number})=>String(r.toObjectId)===targetId))return true;
        after=page.paging?.next?String(page.paging.next.after):'';
        if(after&&seen.has(after))throw new AppError(502,'HubSpot repitió un cursor.');
        if(after)seen.add(after);
      }while(after);
      return false;
    }
  };
}
