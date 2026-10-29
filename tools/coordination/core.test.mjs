import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createBoard,safePath } from './core.mjs';

function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'planb-board-'));return {root,board:createBoard(root),cleanup(){const parent=fs.realpathSync(os.tmpdir());assert.ok(fs.realpathSync(root).startsWith(parent+path.sep));fs.rmSync(root,{recursive:true,force:true});}};}
const spec=(id,agent='claude',file='report.md')=>({id,agent,title:'Revisión de código',plan:'Inspeccionar el contrato y entregar hallazgos.',acceptance:'Informe comprobable.',files:[file],readFiles:[],dependencies:[]});

test('reservas: exclusión por archivo también en revisión; solo Codex acepta una entrega intacta',async()=>{
  const {root,board,cleanup}=setup();try{
    await board.add(spec('CLAUDE-1'));await board.add(spec('CODEX-1','codex'));
    await board.claim('CLAUDE-1','claude');await assert.rejects(board.claim('CODEX-1','codex'),/reservados/);
    assert.throws(()=>board.checkPath('CLAUDE-1','codex','report.md'),/otro agente/);assert.throws(()=>board.checkPath('CLAUDE-1','claude','other.md'),/fuera/);
    fs.writeFileSync(path.join(root,'report.md'),'Hallazgos');await board.submit('CLAUDE-1','claude','Inspección estática, sin aceptación remota.');
    await assert.rejects(board.claim('CODEX-1','codex'),/reservados/);await assert.rejects(board.accept('CLAUDE-1','claude'),/Codex/);
    fs.appendFileSync(path.join(root,'report.md'),' Cambio posterior');await assert.rejects(board.accept('CLAUDE-1','codex'),/cambió/);
    await board.revise('CLAUDE-1','codex','Revisar el cambio posterior y volver a presentar.');assert.equal(board.load().tasks[0].reserved,true);await board.submit('CLAUDE-1','claude','Nueva versión revisable');await board.accept('CLAUDE-1','codex');await board.claim('CODEX-1','codex');assert.equal(board.load().tasks[0].status,'done');
  }finally{cleanup();}
});

test('no libera trabajo pendiente ni acepta una entrega sin archivos cambiados',async()=>{
  const {root,board,cleanup}=setup();try{
    await board.add(spec('CLAUDE-1'));await board.claim('CLAUDE-1','claude');await assert.rejects(board.submit('CLAUDE-1','claude','Sin cambios'),/No hay entrega/);
    fs.writeFileSync(path.join(root,'report.md'),'En curso');await board.block('CLAUDE-1','claude','Necesita revisión');await assert.rejects(board.release('CLAUDE-1','claude'),/cambios pendientes/);assert.equal(board.load().tasks[0].reserved,true);
    fs.unlinkSync(path.join(root,'report.md'));await board.release('CLAUDE-1','claude');assert.equal(board.load().tasks[0].status,'ready');
  }finally{cleanup();}
});

test('rechaza rutas privadas, traversal, directorios, enlaces y colisiones de mayúsculas',async()=>{
  const {root,board,cleanup}=setup();try{
    for(const name of ['../x','C:/x','/x','src/../x','data/db','planb-local-pilot/key','.env','a/.planb-key','a/token.enc','a/CON.txt','coordination/board.json','a./x','a/*'])assert.throws(()=>safePath(name));
    fs.mkdirSync(path.join(root,'source'));await assert.rejects(board.add(spec('DIRECTORY','claude','source')),/Solo archivos/);
    fs.mkdirSync(path.join(root,'real'));fs.symlinkSync(path.join(root,'real'),path.join(root,'linked'),process.platform==='win32'?'junction':'dir');await assert.rejects(board.add(spec('LINK','claude','linked/out.md')),/enlaces/);
    await board.add(spec('UPPER','claude','Result.md'));await board.add(spec('LOWER','codex','result.md'));await board.claim('UPPER','claude');await assert.rejects(board.claim('LOWER','codex'),/reservados/);
  }finally{cleanup();}
});

test('dependencias esperan aceptación; encargos fuera de permisos y formatos no alteran estado',async()=>{
  const {root,board,cleanup}=setup();try{
    await board.add(spec('FIRST'));await board.add({...spec('NEXT','claude','next.md'),dependencies:['FIRST']});await assert.rejects(board.claim('NEXT','claude'),/dependencia/);
    const version=board.load().revision;await assert.rejects(board.claim('FIRST','codex'),/otro agente/);assert.equal(board.load().revision,version);
    await board.claim('FIRST','claude');fs.writeFileSync(path.join(root,'report.md'),'Revisado');await board.submit('FIRST','claude','Solo código');await board.accept('FIRST','codex');await board.claim('NEXT','claude');
    assert.match(board.brief('NEXT'),/sin|No uses navegador/);assert.match(board.brief('NEXT'),/check-path/);assert.equal(board.load().tasks[1].status,'working');
  }finally{cleanup();}
});

test('bloqueo abandonado no caduca ni se roba automáticamente',async()=>{
  const {root,board,cleanup}=setup();try{
    fs.mkdirSync(path.join(root,'coordination'));fs.writeFileSync(path.join(root,'coordination','.board-lock'),JSON.stringify({pid:0,token:'stale',at:'2000-01-01'}));
    await assert.rejects(board.add(spec('WAIT')),/Tablón ocupado/);assert.equal(board.load().tasks.length,0);assert.ok(fs.existsSync(path.join(root,'coordination','.board-lock')));
  }finally{cleanup();}
});

test('dos procesos reservan el mismo archivo: uno solo gana y el JSON queda íntegro',async()=>{
  const {root,board,cleanup}=setup();try{
    await board.add(spec('A'));await board.add(spec('B','codex'));
    const worker=`import {createBoard} from ${JSON.stringify(new URL('./core.mjs',import.meta.url).href)};const b=createBoard(process.argv[1]);try{await b.claim(process.argv[2],process.argv[3]);process.exitCode=0;}catch{process.exitCode=2;}`;
    function run(id,agent){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',worker,root,id,agent],{windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',code=>resolve(code));});}
    const exits=await Promise.all([run('A','claude'),run('B','codex')]);assert.deepEqual(exits.sort(),[0,2]);assert.equal(board.load().tasks.filter(t=>t.reserved).length,1);assert.equal(fs.existsSync(path.join(root,'coordination','.board-lock')),false);
  }finally{cleanup();}
});
