import test from 'node:test';
import assert from 'node:assert/strict';
import { queueWindow } from '../shared/work-queue.js';

test('the last row remains reachable across all pages, without duplicates or changing business ordering',()=>{
  const items=Array.from({length:63},(_,i)=>({id:'id-'+i,label:'Pendiente '+i})),before=JSON.stringify(items);
  const pages=[0,1,2,3].flatMap(page=>queueWindow(items,{page}).items.map(item=>item.id));assert.deepEqual(pages,items.map(item=>item.id));assert.equal(new Set(pages).size,63);assert.equal(JSON.stringify(items),before);
  const final=queueWindow(items,{page:3});assert.equal(final.start,61);assert.equal(final.end,63);assert.equal(final.hasMore,false);
});

test('accent/case and all-term matching combine the public label and exact ID, not hidden data',()=>{
  const items=[{id:'unique-059',label:'José Pérez',hidden:'private-needle'},{id:'different',label:'Josefina Pérez',hidden:''}];
  assert.deepEqual(queueWindow(items,{query:' JOSE  pe\u0301rez UNIQUE-059 '}).items,[items[0]]);assert.equal(queueWindow(items,{query:'private-needle'}).total,0);assert.equal(queueWindow(items,{query:'sin coincidencia'}).total,0);
});

test('a shortened result clamps an old page to valid rows and empty lists have honest zero ranges',()=>{
  const items=Array.from({length:45},(_,i)=>({id:'r'+i,label:'Registro '+i}));
  const found=queueWindow(items,{query:'r44',page:20});assert.equal(found.page,0);assert.equal(found.total,1);assert.equal(found.items[0].id,'r44');
  const empty=queueWindow([],{page:200});assert.deepEqual([empty.page,empty.start,empty.end,empty.total,empty.hasMore],[0,0,0,0,false]);
});

test('five-row preview and twenty-row exploration share the same source and preserve homonyms by ID',()=>{
  const items=Array.from({length:41},(_,i)=>({id:'homonym-'+i,label:'Mismo nombre'}));
  assert.equal(queueWindow(items,{size:5}).items.length,5);assert.equal(queueWindow(items,{size:20}).items.length,20);assert.equal(queueWindow(items,{query:'homonym-40'}).items[0].id,'homonym-40');
});

test('ten-thousand rows can be filtered to a final ID without truncating the total',()=>{
  const items=Array.from({length:10000},(_,i)=>({id:'id-'+String(i).padStart(5,'0'),label:'Registro común'}));
  assert.equal(queueWindow(items).total,10000);assert.equal(queueWindow(items,{query:'id-09999'}).items[0].id,'id-09999');assert.equal(queueWindow(items,{page:499}).items.at(-1)!.id,'id-09999');
});

test('invalid pagination and excessive queries are rejected, literal punctuation does not become a regular expression',()=>{
  for(const options of [{page:-1},{page:NaN},{page:1.2},{size:0},{size:51},{query:'x'.repeat(161)}])assert.throws(()=>queueWindow([],options));
  assert.equal(queueWindow([{id:'one',label:'Literal [ab]+'},{id:'two',label:'aaaa'}],{query:'[ab]+'}).total,1);
});
