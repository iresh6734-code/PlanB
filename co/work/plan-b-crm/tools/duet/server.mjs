import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const assets=new Map([['/',['index.html','text/html']],['/panel.js',['panel.js','text/javascript']],['/panel.css',['panel.css','text/css']]]);
export function createPanel({root=path.resolve(here,'../..'),port=4347}={}){
  return http.createServer((req,res)=>{
    const origin='http://127.0.0.1:'+port;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if(req.headers.host!=='127.0.0.1:'+port||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    try{
      const url=new URL(req.url,origin);let body,type;
      if(url.pathname==='/api/state'){
        const stateFile=path.join(root,'coordination/reports/duet-live.json');
        body=fs.readFileSync(stateFile,'utf8');JSON.parse(body);type='application/json';
      }else if(assets.has(url.pathname)){
        const [name,mime]=assets.get(url.pathname);body=fs.readFileSync(path.join(here,name));type=mime;
      }else{res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Estado no disponible; conserva la última lectura.');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createPanel();server.on('error',()=>{console.error('No se pudo abrir4347. No se ha detenido otro servicio.');process.exitCode=1;});
  server.listen(4347,'127.0.0.1',()=>console.log('Codex + Claude · http://127.0.0.1:4347/'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
