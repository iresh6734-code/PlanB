import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {Runtime,View,Transport,setupGlobals} from './helpers/independent-interface-harness.js';
// Reuses the accepted hook utility; expectations are this test's own. This is not React DOM.
const root=path.resolve(process.env.PLANB_SEARCH_CTX_ROOT??'.');
test('search context refresh on page2 immediately restarts at0 and exposes the shortened positive result (F3)',async()=>{
 const restore=setupGlobals(),previous=globalThis.fetch;(globalThis.document as any).body={style:{overflow:''}};const transport=new Transport();globalThis.fetch=transport.fetch;let total=43,tag='old';
 const expectedContext={instanceId:'00000000-0000-4000-8000-000000000078',captureId:'fixture-search078',accountId:'fixture078',capturedAt:'2026-10-31T10:00:00Z',isTestData:true,contextRevision:'c'.repeat(64)};
 const source={...expectedContext,revision:'a'.repeat(64)};
 transport.on(/^\/v2\/search\?/,call=>{const offset=Number(new URL(call.path,'http://fixture.invalid').searchParams.get('offset')),items=Array.from({length:total},(_,i)=>({entity:'contacts',id:tag+'-'+i,label:tag+' record '+i,matchedId:false,totalMatchedFields:0,matches:[]}));return {json:{source,query:'fixture',offset,limit:20,total,hasMore:offset+20<total,counts:{contacts:total,companies:0,deals:0,tasks:0},items:items.slice(offset,offset+20)}};});
 const runtime=new Runtime(root),{WorkspaceSearch}=runtime.load('src/WorkspaceSearch.tsx'),view=new View(runtime,WorkspaceSearch,{captureId:source.captureId,expectedContext,localRevision:1,close(){},openRecord(){}});
 try{view.type(view.find({tag:'input',type:'search'}),'fixture');view.advance(201);await view.settle();view.click(view.find({tag:'button',text:'Siguiente'}));view.advance(201);await view.settle();assert.match(view.text(),/21–40 de 43 resultados/);
  total=3;tag='new';view.update({localRevision:2});view.advance(201);await view.settle();assert.match(transport.calls.at(-1)!.path,/offset=0(?:&|$)/);assert.match(view.text(),/1–3 de 3 resultados/);assert.match(view.text(),/new record 2/);assert.doesNotMatch(view.text(),/21–3/);
  view.update({localRevision:1});view.advance(201);await view.settle();assert.match(transport.calls.at(-1)!.path,/offset=0(?:&|$)/);assert.match(view.text(),/1–3 de 3 resultados/);
 }finally{view.unmount();globalThis.fetch=previous;restore();}
});
