import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
export function pilotAlias(request:IncomingMessage,response:ServerResponse){
  if(!['127.0.0.1:4335','localhost:4335'].includes(request.headers.host??'')){response.writeHead(403);response.end();return;}
  if(!['GET','HEAD'].includes(request.method??'')){response.writeHead(405);response.end();return;}
  const url=new URL(request.url??'/','http://127.0.0.1:4335');
  if(url.pathname==='/api/team/health'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({mode:'pilot-alias',target:'http://localhost:4334/team'}));return;}
  if(url.pathname.startsWith('/api/')){response.writeHead(410,{'Cache-Control':'no-store'});response.end('Abre Plan B desde su entrada principal.');return;}
  const target=new URL('http://localhost:4334/team'),view=url.searchParams.get('view');
  if(view&&['records','jobs','devices','members','connections','commercial','agent'].includes(view))target.searchParams.set('view',view);
  response.writeHead(303,{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});response.end();
}
if(process.env.PLANB_PILOT_ALIAS==='1')createServer(pilotAlias).listen(4335,'127.0.0.1');
