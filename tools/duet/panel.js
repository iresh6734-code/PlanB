const el=id=>document.getElementById(id);
const date=value=>new Date(value).toLocaleString('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',second:'2-digit'});
async function refresh(){
  try{
    const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error();const s=await r.json();
    el('connection').textContent='Estado local disponible';el('goal').textContent=s.goal;el('updated').textContent='Último evento: '+date(s.updatedAt)+' · Europe/Madrid';
    for(const name of ['codex','claude']){el(name+'-state').textContent=s[name].state;el(name+'-detail').textContent=s[name].detail;}
    el('task').textContent=s.task;el('response').textContent=s.response||'Aún no se ha recibido una respuesta del modelo.';el('response-status').textContent=s.response?'Respuesta recibida':'Pendiente de respuesta';
    el('files').replaceChildren(...s.files.map(file=>{const li=document.createElement('li');li.textContent=file;return li;}));
    el('events').replaceChildren(...s.events.map(event=>{const li=document.createElement('li'),time=document.createElement('time'),title=document.createElement('strong'),body=document.createElement('p');time.dateTime=event.at;time.textContent=date(event.at)+' · '+event.actor;title.textContent=event.title;body.textContent=event.detail;li.append(time,title,body);return li;}));
  }catch{el('connection').textContent='No se pudo actualizar · se conserva la última lectura';}
}
refresh();setInterval(refresh,2000);
