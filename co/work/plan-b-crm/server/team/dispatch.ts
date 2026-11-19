import { CloudTasksClient } from '@google-cloud/tasks';
import type { TeamJobs } from './jobs.js';
export function cloudDispatcher(jobs:TeamJobs,config:{project:string;region:string;queue:string;workerUrl:string;serviceAccount:string}) {
  const client=new CloudTasksClient();
  return async()=>{
    const parent=client.queuePath(config.project,config.region,config.queue);let dispatched=0;
    for(const job of await jobs.pending()){
      try{await client.createTask({parent,task:{name:parent+'/tasks/job-'+job.id+'-'+job.attempts+'-'+Math.floor(Date.now()/60000),httpRequest:{httpMethod:'POST',url:config.workerUrl+'/internal/jobs/'+job.tenant+'/'+job.id,oidcToken:{serviceAccountEmail:config.serviceAccount,audience:config.workerUrl},headers:{'Content-Type':'application/json'},body:Buffer.from('{}').toString('base64')}}});dispatched++;}
      catch(error){if((error as {code?:number}).code!==6)throw error;}
    }return {dispatched};
  };
}
