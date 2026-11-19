import test from 'node:test';
import assert from 'node:assert/strict';
import { CommercialContentSchema } from '../shared/commercial.js';
import { renderCommercialEmail,meetingLabel } from '../shared/commercial-email.js';
import { commercialMime } from '../server/team/email-mime.js';
import { followupDraft } from '../shared/followup-draft.js';
import { makeFixture,makeDemoSpec } from '../shared/fixtures.js';

const content=()=>CommercialContentSchema.parse({recipient:'test@example.com',subject:'Siguiente paso · Diseño web',body:'Hola Lucía,\n\nRevisamos el alcance y acordamos una próxima acción.\n\nGracias,',emailFormat:'html',signature:'Equipo Norte\nDesarrollo comercial',email:true,meeting:true,start:'2026-10-28T15:30:00Z',end:'2026-10-28T16:00:00Z',timeZone:'Europe/Madrid',document:false,spreadsheet:false,documentTitle:'Propuesta',documentBody:'Contenido de prueba'});

test('correo: HTML seguro, sin recursos remotos, y alternativa de texto con la misma firma y horario',()=>{
  const value=content();value.body='Hola <script>alert(1)</script>\n\n<img src="https://evil.example/x"> & dudas';value.signature='<a href="javascript:alert(2)">Nombre</a>';
  const result=renderCommercialEmail(value);assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<img'));assert.ok(!result.html.includes('<a href='));assert.ok(result.html.includes('&lt;script&gt;'));assert.ok(result.html.includes('&amp; dudas'));assert.ok(result.plain.includes(value.body));assert.ok(result.plain.includes(value.signature));
  assert.match(result.plain,/16:30–17:00 \(hora de Madrid\)/);assert.ok(result.html.includes(result.fragment));
  const withoutMeeting=renderCommercialEmail({...value,meeting:false});assert.ok(!withoutMeeting.html.includes('Propuesta de reunión'));assert.ok(!withoutMeeting.plain.includes('Propuesta de reunión'));
});

test('correo: MIME multipart preserva UTF-8, cuerpo revisado, formato y versión antigua de texto simple',()=>{
  const value=content(),mime=commercialMime('synthetic-id',value),boundary=/boundary="([^"]+)"/.exec(mime)![1];
  const parts=mime.split('--'+boundary).slice(1,3).map(part=>{const [header,...body]=part.trim().split('\r\n\r\n');return {header,body:Buffer.from(body.join('\r\n\r\n'),'base64').toString('utf8')};});
  assert.match(mime,/Content-Type: multipart\/alternative/);assert.match(parts[0].header,/text\/plain/);assert.match(parts[1].header,/text\/html/);
  const rendered=renderCommercialEmail(value);assert.equal(parts[0].body,rendered.plain);assert.equal(parts[1].body,rendered.html);
  const old={...value};delete old.emailFormat;delete old.signature;const legacy=commercialMime('legacy',old);assert.ok(!legacy.includes('multipart/alternative'));assert.equal(Buffer.from(legacy.split('\r\n\r\n')[1].replaceAll('\r\n',''),'base64').toString('utf8'),old.body);
  const plain=renderCommercialEmail({...value,emailFormat:'plain'});assert.ok(plain.plain.includes('Propuesta de reunión'));assert.ok(plain.plain.includes('Equipo Norte'));
  assert.match(meetingLabel({...value,start:'2026-07-01T14:30:00Z',end:'2026-07-01T15:00:00Z'}),/16:30–17:00/);
});

test('seguimiento: usa relaciones y etiquetas reales; evita acuerdos inventados y oportunidades cerradas',()=>{
  const snapshot=makeFixture(),spec=makeDemoSpec(snapshot),contact=snapshot.records.find(r=>r.id==='contact-1')!;
  const draft=followupDraft(contact,snapshot.records,spec,snapshot.links);
  assert.ok(draft.body.includes('Estudio Arce'));assert.equal(draft.body.split('Estudio Arce').length-1,1);assert.ok(draft.subject.includes('Rediseño web'));assert.ok(draft.context.some(item=>item.label==='Servicio'&&item.value==='Diseño web'));assert.ok(!draft.body.includes('como acordamos'));
  const deal=snapshot.records.find(r=>r.id==='deal-1')!;deal.values.dealstage='won';
  const closed=followupDraft(contact,snapshot.records,spec,snapshot.links);assert.ok(!closed.context.some(item=>item.label==='Oportunidad'));assert.ok(closed.subject.includes('Diseño web'));
  const absent=followupDraft({...contact,values:{firstname:'Ana'}},[],spec,[]);assert.ok(!absent.context.some(item=>item.label==='Empresa'||item.label==='Oportunidad'));assert.ok(!absent.body.includes('undefined'));
  const association=followupDraft(contact,snapshot.records.filter(r=>r.entity!=='deals').map(r=>r.id===contact.id?{...r,values:{...r.values,company_id:null}}:r),spec,snapshot.links);assert.ok(association.context.some(item=>item.label==='Empresa'));
});
