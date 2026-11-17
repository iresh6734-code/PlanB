import { randomUUID } from 'node:crypto';
import { Store, AppError } from './store.js';
import type { Job } from '../shared/operations.js';
export class Jobs {
  private controllers = new Map<string,AbortController>();
  constructor(private store:Store) {
    for (const job of this.list()) if (['running','queued'].includes(job.status)) this.write({...job,status:'interrupted',message:'El proceso se cerró. Los datos activos se conservaron.',updatedAt:new Date().toISOString()});
  }
  list():Job[] { return this.store.get<Job[]>('jobs',[]); }
  private write(job:Job) { this.store.set('jobs',[job,...this.list().filter(j=>j.id!==job.id)].slice(0,100)); }
  start(kind:Job['kind'],run:(progress:(message:string,percent:number)=>void,signal:AbortSignal)=>Promise<unknown>):Job {
    if (this.controllers.size) throw new AppError(409,'Espera a que termine el trabajo actual.');
    const now=new Date().toISOString(), job:Job={id:randomUUID(),kind,status:'queued',createdAt:now,updatedAt:now,message:'En cola',progress:0};
    const controller=new AbortController();
    this.write(job);
    this.controllers.set(job.id,controller);
    const update=(message:string,progress:number)=>{job.message=message;job.progress=progress;job.updatedAt=new Date().toISOString();this.write(job);};
    const progress=(message:string,percent:number)=>{
      if(job.status==='running'&&!controller.signal.aborted)update(message,percent);
    };
    setImmediate(async()=>{
      try {
        controller.signal.throwIfAborted();
        job.status='running';
        update('Preparando…',1);
        job.result=await run(progress,controller.signal);
        job.status=controller.signal.aborted?'cancelled':'succeeded';
        update(job.status==='cancelled'?'Cancelado':'Completado',100);
      }
      catch(error){
        job.status=controller.signal.aborted?'cancelled':'failed';
        const message=job.status==='cancelled'?'Cancelado':error instanceof AppError?error.message:'No se completó el trabajo. La copia activa se conserva.';
        update(message,job.progress);
      }
      finally {this.controllers.delete(job.id);}
    });
    return job;
  }
  cancel(id:string) {
    const controller=this.controllers.get(id); if (!controller) throw new AppError(409,'Este trabajo ya terminó.');
    controller.abort();return {cancelled:true};
  }
  async stop(){for(const c of this.controllers.values())c.abort();while(this.controllers.size)await new Promise(resolve=>setTimeout(resolve,10));}
}
