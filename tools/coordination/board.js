const columns=[['ready','Pendiente'],['working','En curso'],['review','Por revisar'],['blocked','Bloqueada'],['done','Aceptada']];
const container=document.querySelector('#board'),connection=document.querySelector('#connection'),error=document.querySelector('#error'),refresh=document.querySelector('#refresh');
let version=-1,loading=false;
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function taskCard(task){
  const card=element('article',undefined,'task'),header=element('header');header.append(element('span',task.id,'id'),element('span',task.agent==='claude'?'Claude':'Codex','agent'));card.append(header,element('h3',task.title));
  card.append(element('p',`${task.files.length} archivo${task.files.length===1?'':'s'} de escritura`));
  if(task.reserved)card.append(element('p','Reserva activa hasta revisión','reservation'));
  if(task.note)card.append(element('p',task.note,'note'));
  const details=element('details');details.append(element('summary','Encargo y archivos'),element('p',task.plan),element('strong','Criterio de aceptación'),element('p',task.acceptance));
  const files=element('ul');for(const file of task.files)files.append(element('li',file));details.append(element('strong','Escritura permitida'),files);
  if(task.dependencies.length)details.append(element('p','Depende de: '+task.dependencies.join(', ')));
  details.append(element('pre',`node tools/coordination/board.mjs claim ${task.id} ${task.agent}`));card.append(details);return card;
}
async function load(){
  if(loading)return;loading=true;refresh.disabled=true;
  try{
    const response=await fetch('/api/board',{cache:'no-store'});if(!response.ok)throw new Error('El tablón no responde. Las tareas guardadas se conservan.');const board=await response.json();
    error.hidden=true;connection.textContent='Tablón al día · '+new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Madrid'}).format(new Date());
    if(board.revision!==version){
      container.replaceChildren();const counts=document.querySelector('#counts');counts.replaceChildren();for(const [status,label] of columns){const tasks=board.tasks.filter(t=>t.status===status),count=element('span',label+' · '+tasks.length);count.setAttribute('role','listitem');counts.append(count);if(!tasks.length)continue;const column=element('section',undefined,'column');column.setAttribute('aria-label',label);column.append(element('h2',label));const body=element('div',undefined,'column-body');for(const task of tasks)body.append(taskCard(task));column.append(body);container.append(column);}
      if(!board.tasks.length)container.append(element('p','Prepara el primer encargo con add --file desde la terminal.','empty'));
      document.querySelector('#summary').textContent=`${board.tasks.length} encargos · ${board.tasks.filter(t=>t.reserved).length} reservas · revisión ${board.revision}`;version=board.revision;
    }
  }catch(failure){connection.textContent='Sin conexión';error.textContent=failure.message;error.hidden=false;}finally{loading=false;refresh.disabled=false;}
}
refresh.addEventListener('click',load);void load();setInterval(()=>{if(!document.hidden)void load();},2000);
