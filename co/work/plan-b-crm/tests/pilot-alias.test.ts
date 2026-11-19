import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { pilotAlias } from '../server/team/pilot-alias.js';
test('entrada única: el alias no reenvía secretos, credenciales, destinos arbitrarios ni peticiones de escritura',()=>{
  const request=(url:string,method='GET',host='127.0.0.1:4335')=>{let status=0;let headers:Record<string,string>={};let body='';pilotAlias({url,method,headers:{host}} as IncomingMessage,{writeHead:(code:number,h?:Record<string,string>)=>{status=code;headers=h??{};},end:(value?:string)=>{body=value??'';}} as unknown as ServerResponse);return {status,headers,body};};
  const redirect=request('/team?view=agent&code=secret&token=secret&redirect=https://attacker.example');assert.equal(redirect.status,303);assert.equal(redirect.headers.Location,'http://localhost:4334/team?view=agent');assert.ok(!JSON.stringify(redirect).includes('secret'));
  assert.equal(request('/','POST').status,405);assert.equal(request('/','GET','attacker.example').status,403);assert.equal(request('/api/team/spaces').status,410);assert.equal(JSON.parse(request('/api/team/health').body).mode,'pilot-alias');
});
