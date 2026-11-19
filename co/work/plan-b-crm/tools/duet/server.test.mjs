import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPanel} from './server.mjs';
test('panel: estado/activos fijos, Host/Origin y HTTP solo lectura',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'planb-duet-ui-'));fs.mkdirSync(path.join(root,'coordination/reports'),{recursive:true});fs.writeFileSync(path.join(root,'coordination/reports/duet-live.json'),'{"response":"<script>untrusted</script>"}');
  const server=createPanel({root,port:4347});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  const get=(url,headers={},method='GET')=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:url,method,headers:{host:'127.0.0.1:4347',...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});r.on('error',reject);r.end();});
  try{
    assert.equal((await get('/')).status,200);const state=await get('/api/state');assert.equal(state.status,200);assert.equal(JSON.parse(state.text).response,'<script>untrusted</script>');assert.ok(state.headers['content-security-policy'].includes("default-src 'self'"));
    for(const method of ['POST','DELETE','PUT'])assert.equal((await get('/api/state',{},method)).status,405);
    assert.equal((await get('/api/state',{host:'evil.example'})).status,403);assert.equal((await get('/api/state',{origin:'https://evil.example'})).status,403);assert.equal((await get('/coordination/board.json')).status,404);assert.equal((await get('/api/state',{},'HEAD')).text,'');
    const js=await get('/panel.js');assert.ok(js.text.includes('.textContent='));assert.ok(!js.text.includes('innerHTML'));
  }finally{await new Promise(resolve=>server.close(resolve));assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
