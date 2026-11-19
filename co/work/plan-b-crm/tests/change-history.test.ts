import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFields, historyPage } from '../shared/change-history.js';
import type { Change, EntityName } from '../shared/model.js';

function change(id:number,entity:EntityName='contacts',operation:'create'|'update'='update'):Change {
  const after={entity,id:'record-'+id,values:{name:'José '+id,text:'new-'+id}},before=operation==='create'?null:{...after,values:{name:'José '+id,text:'old-'+id}};
  return {id,entity,recordId:after.id,operation,at:'2026-10-30T10:00:00Z',before,after};
}
test('all historical operations stay reachable, including the first before the former last-hundred cutoff',()=>{
  const data=Array.from({length:137},(_,i)=>change(i+1)),before=JSON.stringify(data);
  const found=Array.from({length:7},(_,page)=>historyPage(data,{page}).items).flat().map(c=>c.id);
  assert.deepEqual(found,Array.from({length:137},(_,i)=>137-i));assert.equal(new Set(found).size,137);assert.equal(found.at(-1),1);assert.equal(JSON.stringify(data),before);
  const final=historyPage(data,{page:6});assert.deepEqual([final.start,final.end,final.hasMore],[121,137,false]);
});
test('global counts remain complete before filtering, and watermark is inclusive without changing input',()=>{
  const changes=[change(1,'contacts','create'),change(3,'tasks'),change(5,'companies','create'),change(9,'deals')];
  const pending=historyPage(changes,{watermark:5,scope:'pending',entity:'deals'});assert.deepEqual(pending.items.map(c=>c.id),[9]);assert.deepEqual(pending.counts,{all:4,pending:1,marked:3,create:2,update:2});
  assert.deepEqual(historyPage(changes,{watermark:5,scope:'marked'}).items.map(c=>c.id),[5,3,1]);assert.equal(historyPage(changes,{operation:'create'}).total,2);assert.equal(historyPage(changes,{entity:'tasks',operation:'create'}).total,0);
});
test('all normalized literal terms match across IDs, field names, old and new values; no regex interpretation',()=>{
  const first=change(1),second=change(2);first.before!.values.text='Anterior único';first.after.values.text='Posterior único [ab]+';
  assert.deepEqual(historyPage([first,second],{query:' JOSE   anterior   POSTERIOR  record-1 '}).items,[first]);
  assert.deepEqual(historyPage([first,second],{query:'text [ab]+'}).items,[first]);assert.equal(historyPage([first,second],{query:'sin coincidencias'}).total,0);
});
test('pagination clamps a removed or filtered page and empty results carry an honest zero range',()=>{
  const data=Array.from({length:40},(_,i)=>change(i+1));assert.equal(historyPage(data,{page:100}).page,1);
  const filtered=historyPage(data,{page:100,query:'old-1 new-1 record-1'});assert.equal(filtered.page,0);assert.ok(filtered.items.some(c=>c.id===1));
  const empty=historyPage([],{page:99});assert.deepEqual([empty.total,empty.page,empty.start,empty.end,empty.hasMore],[0,0,0,0,false]);
});
test('typed field differences distinguish missing, null, empty string, zero, false and type changes',()=>{
  const c=change(1);c.before!.values={same:'same',removed:'old',nullToEmpty:null,zero:0,flag:false,numeric:1};c.after.values={same:'same',added:null,nullToEmpty:'',zero:0,flag:false,numeric:'1'};
  const fields=changedFields(c);assert.deepEqual(fields.map(f=>f.key),['added','nullToEmpty','numeric','removed']);
  assert.deepEqual(fields.find(f=>f.key==='added'),{key:'added',before:{present:false},after:{present:true,value:null}});
  assert.deepEqual(fields.find(f=>f.key==='nullToEmpty'),{key:'nullToEmpty',before:{present:true,value:null},after:{present:true,value:''}});
  assert.deepEqual(fields.find(f=>f.key==='removed')!.after,{present:false});assert.equal(fields.find(f=>f.key==='numeric')!.before.present,true);
});
test('a creation exposes all present values, including false/zero, while a no-op has no invented changes',()=>{
  const c=change(1,'tasks','create');c.after.values={empty:'',flag:false,zero:0,nil:null};const fields=changedFields(c);assert.equal(fields.length,4);assert.ok(fields.every(f=>!f.before.present&&f.after.present));
  const update=change(2);update.after=structuredClone(update.before!);assert.deepEqual(changedFields(update),[]);
});
test('history queries can locate boolean and null values without treating them as absent or mutating records',()=>{
  const c=change(1);c.before!.values={flag:true,n:2};c.after.values={flag:false,n:0,nil:null};const before=JSON.stringify(c);
  assert.equal(historyPage([c],{query:'false 0 null'}).total,1);assert.equal(JSON.stringify(c),before);assert.deepEqual(changedFields(c).find(f=>f.key==='flag')!.after,{present:true,value:false});
});
test('five thousand operations have complete totals while rendering windows are bounded to twenty',()=>{
  const data=Array.from({length:5000},(_,i)=>change(i+1));assert.equal(historyPage(data).total,5000);assert.equal(historyPage(data).items.length,20);assert.equal(historyPage(data,{page:249}).items.at(-1)!.id,1);assert.equal(historyPage(data,{query:'old-1',operation:'update'}).counts.all,5000);
});
test('order follows operation IDs rather than timestamp text and stays stable across shuffled unique IDs',()=>{
  const a=change(1),b=change(2);a.at='2099-01-01T00:00:00Z';b.at='2000-01-01T00:00:00Z';assert.deepEqual(historyPage([a,b]).items,[b,a]);assert.deepEqual(historyPage([b,a]).items,[b,a]);
});
test('malformed filters and bounds fail explicitly',()=>{
  for(const options of [{page:-1},{page:NaN},{size:0},{size:51},{query:'x'.repeat(201)},{watermark:-1},{watermark:1.5},{entity:'invalid'},{operation:'delete'},{scope:'verified'}])assert.throws(()=>historyPage([],options as any));
});

test('search does not index hidden ISO timestamps when an operation ID is requested (QA073H1)',()=>{
 const make=(id:number,at:string):import('../shared/model.js').Change=>({id,at,entity:'contacts',recordId:'record-x',operation:'update',before:{id:'record-x',entity:'contacts',values:{phone:'old'}},after:{id:'record-x',entity:'contacts',values:{phone:'new'}}});
 const input=[make(33,'2026-10-31T12:00:00Z'),make(44,'2026-10-31T12:00:33Z')];
 assert.deepEqual(historyPage(input,{query:'33'}).items.map(c=>c.id),[33]);
 assert.equal(historyPage(input,{query:'2026-10-31'}).total,0);
});
