import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const agents=new Set(['codex','claude']);
const states=new Set(['ready','working','review','blocked','done']);
function requireValue(ok,message){if(!ok)throw new Error(message);}
function text(value,label,max=2000){requireValue(typeof value==='string'&&value.trim().length>0&&value.length<=max,`${label} inválido.`);return value.trim();}
export function safePath(input){
  const value=text(input,'Ruta',240).replaceAll('\\','/');
  requireValue(!value.startsWith('/')&&!/[\u0000-\u001f<>:"|?*]/.test(value),'La ruta debe ser relativa, exacta y sin comodines.');
  const parts=value.split('/');
  requireValue(parts.every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&! /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)),'Ruta ambigua o fuera del proyecto.');
  requireValue(parts.every(p=>! /^(\.git|node_modules|data|build|dist|runtime|runtime-assets|test-results|\.playwright-mcp|\.env.*|\.claude|\.codex|\.planb.*|\.operator.*|\.instance|\.google.*|planb-local-.*|planb-hubspot-.*|planb-ensayo-.*)$/i.test(p)&&! /\.enc$/i.test(p)),'Ruta privada, de ejecución o credenciales excluida.');
  requireValue(!/^coordination\/(board\.json|\.board|outbox)/i.test(value),'El estado y la salida del tablón los gestiona su herramienta.');
  return value;
}
function validateSpec(raw){
  requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw),'Falta el encargo.');
  const id=text(raw.id,'ID',60);requireValue(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(id),'ID inválido.');
  requireValue(agents.has(raw.agent),'Agente no válido.');
  requireValue(Array.isArray(raw.files)&&raw.files.length>0&&raw.files.length<=60,'Declara entre uno y 60 archivos de escritura exactos.');
  const files=raw.files.map(safePath);requireValue(new Set(files.map(p=>p.toLowerCase())).size===files.length,'Archivos repetidos.');
  const readFiles=(raw.readFiles??[]).map(safePath);requireValue(readFiles.length<=60,'Demasiados archivos de lectura.');
  const dependencies=raw.dependencies??[];requireValue(Array.isArray(dependencies)&&dependencies.every(d=>typeof d==='string'&&/^[A-Z0-9-]+$/.test(d)&&d!==id),'Dependencias inválidas.');
  return {id,agent:raw.agent,title:text(raw.title,'Título',160),plan:text(raw.plan,'Plan',10000),acceptance:text(raw.acceptance,'Aceptación',5000),files,readFiles,dependencies};
}
export function createBoard(root){
  root=fs.realpathSync(root);
  const folder=path.join(root,'coordination'),file=path.join(folder,'board.json'),lock=path.join(folder,'.board-lock');
  function noLinks(target){
    const relative=path.relative(root,target);requireValue(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Ruta fuera del proyecto.');
    let current=root;for(const part of relative.split(path.sep)){current=path.join(current,part);try{requireValue(!fs.lstatSync(current).isSymbolicLink(),'No se aceptan enlaces o junctions en los archivos del tablón.');}catch(error){if(error.code==='ENOENT')break;throw error;}}
  }
  function load(){
    noLinks(file);if(!fs.existsSync(file))return {format:1,revision:0,updatedAt:null,tasks:[],events:[]};
    const board=JSON.parse(fs.readFileSync(file,'utf8'));requireValue(board.format===1&&Number.isInteger(board.revision)&&Array.isArray(board.tasks)&&Array.isArray(board.events),'Estado del tablón no válido. Conserva el archivo.');
    for(const task of board.tasks){validateSpec(task);requireValue(states.has(task.status),'Estado de tarea desconocido.');}
    return board;
  }
  function snapshot(files){return Object.fromEntries(files.map(name=>{
    const target=path.join(root,...safePath(name).split('/'));noLinks(target);
    try{const stat=fs.statSync(target);requireValue(stat.isFile()&&stat.size<=2_000_000,'Solo archivos de código o documentos de hasta 2 MB.');return [name,createHash('sha256').update(fs.readFileSync(target)).digest('hex')];}catch(error){if(error.code==='ENOENT')return [name,null];throw error;}
  }));}
  async function mutate(actor,action,id,run){
    requireValue(agents.has(actor),'Agente no válido.');noLinks(folder);fs.mkdirSync(folder,{recursive:true});
    const token=randomUUID();let acquired=false;
    for(let attempt=0;attempt<40;attempt++){
      try{fs.writeFileSync(lock,JSON.stringify({token,pid:process.pid,at:new Date().toISOString()}),{flag:'wx'});acquired=true;break;}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(resolve=>setTimeout(resolve,50));}
    }
    requireValue(acquired,'Tablón ocupado. Si un proceso terminó, revisa el bloqueo antes de retirarlo; nunca caduca automáticamente.');
    let temp;
    try{
      const board=load(),result=run(board);board.revision++;board.updatedAt=new Date().toISOString();board.events.push({at:board.updatedAt,actor,action,task:id});board.events=board.events.slice(-200);
      temp=path.join(folder,'.board-'+token+'.tmp');fs.writeFileSync(temp,JSON.stringify(board,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,file);temp=null;return result??board;
    }finally{
      if(temp&&fs.existsSync(temp))fs.unlinkSync(temp);
      if(JSON.parse(fs.readFileSync(lock,'utf8')).token===token)fs.unlinkSync(lock);
    }
  }
  function taskFor(board,id,actor){const task=board.tasks.find(t=>t.id===id);requireValue(task,'Tarea no encontrada.');requireValue(task.agent===actor,'La tarea pertenece a otro agente.');return task;}
  function guardTask(task,actor){requireValue(task.agent===actor&&task.status==='working'&&task.reserved,'Primero reserva la tarea con el agente correcto.');}
  return {
    load,snapshot,
    add:raw=>{const spec=validateSpec(raw);return mutate('codex','add',spec.id,board=>{
      requireValue(!board.tasks.some(t=>t.id===spec.id),'Ese ID ya existe.');requireValue(spec.dependencies.every(id=>board.tasks.some(t=>t.id===id)),'Dependencia todavía no registrada.');snapshot(spec.files);
      const task={...spec,status:'ready',reserved:false,baseline:null,submitted:null,note:'',createdAt:new Date().toISOString()};board.tasks.push(task);return task;
    });},
    claim:(id,actor)=>mutate(actor,'claim',id,board=>{
      const task=taskFor(board,id,actor);requireValue(task.status==='ready','La tarea no está pendiente.');requireValue(task.dependencies.every(id=>board.tasks.find(t=>t.id===id)?.status==='done'),'Esperando la aceptación de una dependencia.');
      const files=task.files.map(p=>p.toLowerCase());const collision=board.tasks.find(t=>t.id!==id&&t.reserved&&t.files.some(p=>files.some(q=>q===p.toLowerCase()||q.startsWith(p.toLowerCase()+'/')||p.toLowerCase().startsWith(q+'/'))));
      requireValue(!collision,`Archivos reservados por ${collision?.id}. No se asigna la tarea.`);
      task.baseline=snapshot(task.files);task.status='working';task.reserved=true;return task;
    }),
    checkPath:(id,actor,name)=>{const task=taskFor(load(),id,actor);guardTask(task,actor);name=safePath(name);requireValue(task.files.includes(name),'Archivo fuera del alcance reservado.');snapshot([name]);return {allowed:true,file:name};},
    takeOver:(id,actor,note)=>mutate(actor,'take-over',id,board=>{
      requireValue(actor==='codex','Solo Codex registra un traspaso autorizado por el usuario.');
      const task=board.tasks.find(t=>t.id===id);
      requireValue(task?.agent==='claude'&&task.reserved&&task.status==='working','El traspaso requiere una reserva de Claude en curso.');
      const reason=text(note,'Motivo del traspaso',2000);
      task.handoff={
        from:task.agent, to:actor, at:new Date().toISOString(),
        previousNote:task.note, received:snapshot(task.files), reason,
      };
      task.agent=actor;
      task.note=reason;
      return task;
    }),
    submit:(id,actor,note)=>mutate(actor,'submit',id,board=>{
      const task=taskFor(board,id,actor);guardTask(task,actor);const current=snapshot(task.files);
      requireValue(task.files.some(p=>current[p]!==task.baseline[p]),'No hay entrega modificada en los archivos asignados.');task.submitted=current;task.status='review';task.note=text(note,'Evidencia',2000);return task;
    }),
    accept:(id,actor)=>mutate(actor,'accept',id,board=>{
      requireValue(actor==='codex','La integración final corresponde a Codex.');const task=board.tasks.find(t=>t.id===id);requireValue(task?.status==='review','Falta una entrega para revisar.');const current=snapshot(task.files);
      requireValue(task.files.every(p=>current[p]===task.submitted[p]),'La entrega cambió después de presentarse. No se acepta la versión anterior.');task.status='done';task.reserved=false;return task;
    }),
    revise:(id,actor,note)=>mutate(actor,'revise',id,board=>{
      requireValue(actor==='codex','Codex solicita la corrección de una entrega.');const task=board.tasks.find(t=>t.id===id);requireValue(task?.reserved&&['review','blocked'].includes(task.status),'No hay una entrega reservada para corregir.');task.status='working';task.submitted=null;task.note=text(note,'Corrección',2000);return task;
    }),
    block:(id,actor,note)=>mutate(actor,'block',id,board=>{const task=taskFor(board,id,actor);requireValue(task.status!=='done','La tarea ya fue aceptada.');task.status='blocked';task.note=text(note,'Motivo',2000);return task;}),
    release:(id,actor)=>mutate(actor,'release',id,board=>{const task=taskFor(board,id,actor);requireValue(task.reserved,'No hay reserva.');const current=snapshot(task.files);requireValue(task.files.every(p=>current[p]===task.baseline[p]),'Hay cambios pendientes: conservar reserva y acordar la entrega, sin borrar trabajo.');task.status='ready';task.reserved=false;task.baseline=null;task.submitted=null;return task;}),
    brief:id=>{
      const task=load().tasks.find(t=>t.id===id);requireValue(task,'Tarea no encontrada.');
      return `# ${task.id} · ${task.title}\n\nAgente: ${task.agent}. Estado: ${task.status}.\n\n${task.plan}\n\n## Aceptación\n${task.acceptance}\n\n## Archivos de escritura exclusivos\n${task.files.map(p=>'- '+p).join('\n')}\n\n## Lectura de código prevista\n${task.readFiles.map(p=>'- '+p).join('\n')}\n\n## Protocolo obligatorio\nLee COORDINACION.md y AGENTS.md. Este encargo no concede acceso a cuentas, credenciales o datos de clientes. No uses navegador, MCP, DPAPI, perfiles, terminales corporativos ni servicios externos. No instales nada, no publiques y no desactives permisos.\nReserva antes de editar: node tools/coordination/board.mjs claim ${task.id} ${task.agent}\nAntes de cada archivo: node tools/coordination/board.mjs check-path ${task.id} ${task.agent} RUTA_EXACTA\nSi no puedes reservar o necesitas otro archivo, detente y plantea el cambio de alcance. No edites el JSON del tablón ni el contexto general.\nPresenta tu entrega: node tools/coordination/board.mjs submit ${task.id} ${task.agent} --note "Evidencia, verificaciones y límites"\nNo marques tu propia tarea como aceptada. No cambies archivos después de presentar la entrega. Los bloqueos son de coordinación, no una barrera del sistema operativo; respeta los límites aunque una herramienta permita saltarlos.\n`;
    }
  };
}
