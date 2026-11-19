import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {packet,approvedFiles,claudeArgs,consult} from './consult.mjs';
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'planb-duet-'));for(const name of approvedFiles){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),'// contract fixture '+name);}return root;}
function cleanup(root){assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
test('envío: exactamente seis fuentes, hashes y ensayo sin arrancar modelos',async()=>{
  const root=setup();try{fs.writeFileSync(path.join(root,'secret.env'),'not-for-provider');const p=packet(root);assert.deepEqual(p.sources.map(s=>s.file),[...approvedFiles]);assert.ok(p.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));assert.ok(!p.prompt.includes('not-for-provider'));const result=await consult({folder:root});assert.equal(result.executed,false);assert.equal(result.files.length,6);}finally{cleanup(root);}
});
test('envío: rechaza fuentes desaparecidas o mayores del límite',()=>{
  const root=setup();try{fs.writeFileSync(path.join(root,approvedFiles[0]),'x'.repeat(100001));assert.throws(()=>packet(root),/límites/);fs.unlinkSync(path.join(root,approvedFiles[0]));assert.throws(()=>packet(root));}finally{cleanup(root);}
});
test('ejecución: detiene fuentes diferentes antes de iniciar CLI o red',async()=>{
  const root=setup();try{await assert.rejects(consult({folder:root,execute:true}),/envío autorizado/);}finally{cleanup(root);}
});
test('CLI: prompts por stdin, sin herramientas, hooks, conectores o modos que eludan controles',()=>{
  const args=claudeArgs('official-cli.js');assert.equal(args[args.indexOf('--tools')+1],'');assert.equal(args[args.indexOf('--permission-mode')+1],'dontAsk');assert.ok(args.includes('--strict-mcp-config'));assert.ok(args.includes('--no-chrome'));assert.equal(args[args.indexOf('--max-budget-usd')+1],'1');assert.ok(!args.some(arg=>/dangerously|bypassPermissions/.test(arg)));assert.equal(JSON.parse(args[args.indexOf('--settings')+1]).disableAllHooks,true);
});
