import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Store } from './store.js';
export function publishEndpoint(app:FastifyInstance,store:Store,port:number){
  const file=join(dirname(store.filename),'.endpoint.json');
  writeFileSync(file,JSON.stringify({pid:process.pid,url:'http://127.0.0.1:'+port,instanceId:store.get('instanceId',null)}));
  const clear=()=>{try{if(JSON.parse(readFileSync(file,'utf8')).pid===process.pid)unlinkSync(file);}catch{}};
  process.on('exit',clear);
}
