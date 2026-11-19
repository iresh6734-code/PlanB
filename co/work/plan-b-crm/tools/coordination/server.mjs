import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoard } from './core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const board=createBoard(root),port=4346;
const assets=new Map([['/',['board.html','text/html; charset=utf-8']],['/board.js',['board.js','text/javascript; charset=utf-8']],['/board.css',['board.css','text/css; charset=utf-8']]]);
const server=http.createServer((request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if(request.headers.host!==`127.0.0.1:${port}`||request.headers.origin&&request.headers.origin!==`http://127.0.0.1:${port}`){response.writeHead(403);response.end('Origen no autorizado');return;}
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{Allow:'GET, HEAD'});response.end();return;}
  try{
    const url=new URL(request.url,`http://127.0.0.1:${port}`);let body,type;
    if(url.pathname==='/api/board'){body=JSON.stringify(board.load());type='application/json; charset=utf-8';}
    else if(assets.has(url.pathname)){const [file,mime]=assets.get(url.pathname);body=fs.readFileSync(path.join(here,file));type=mime;}
    else{response.writeHead(404);response.end('No disponible');return;}
    response.writeHead(200,{'Content-Type':type});response.end(request.method==='HEAD'?undefined:body);
  }catch{response.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});response.end('No se puede leer el tablón. Conserva su estado y revisa la terminal.');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Puerto4346 ocupado; no se ha detenido otro proceso.':'No se pudo abrir el tablón local.');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Tablón Codex + Claude · http://127.0.0.1:${port}/ · Solo lectura web, sin llamadas de IA`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
