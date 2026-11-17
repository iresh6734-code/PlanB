import test from 'node:test';
import assert from 'node:assert/strict';
import { authParentFixtureState as STATE, mountLockedAuthParent as locked } from './helpers/auth-parent-harness.js';
// AUTH_PARENT072 · contrato del padre: el `done` que App entrega a Protection debe esperar la carga confirmada del estado antes de abrir la copia,
// devolver esa promesa a Protection (que solo reintenta la apertura, nunca otra autenticación) y conservar el bloqueo ante un 401.
// Se transpila src/App.tsx (PLANB_APP_SRC apunta a otra copia, p. ej. la versión anterior, para demostrar que los controles fallan por su causa),
// con hooks simulados, hijos sustituidos y un transporte controlado por la prueba. No es un DOM real: el recorrido real está en tests/e2e/auth-parent.spec.ts.
const quiet=()=>new Promise<void>(r=>setTimeout(r,25));
function watchUnhandled(){const seen:unknown[]=[],on=(e:unknown)=>{seen.push(e);};process.on('unhandledRejection',on);return {seen,stop:()=>process.off('unhandledRejection',on)};}

test('done devuelve la promesa de apertura y no abre la app hasta que el estado confirma la carga',async()=>{
 const h=await locked(),done=h.protection().props.done,result=done();
 assert.ok(result&&typeof result.then==='function','done debe devolver la promesa de la carga para que Protection pueda esperar y reintentar');
 await h.flush();
 assert.equal(h.count('/v2/state'),1,'una sola lectura de estado');
 assert.ok(h.protection(),'Protection sigue en pantalla mientras el estado no se ha confirmado');
 assert.equal(h.openedApp(),false,'la app no se abre con una carga pendiente');
 h.respond('/v2/state',STATE);await result;await h.flush();
 assert.equal(h.protection(),null);assert.equal(h.openedApp(),true,'con el estado confirmado la copia se abre');
});

test('una carga fallida rechaza done, mantiene Protection y no deja un rechazo sin atender',async()=>{
 const watch=watchUnhandled();
 try{
  const h=await locked(),result=h.protection().props.done();await h.flush();
  h.fail('/v2/state',Error('Fixture 500'));
  await assert.rejects(Promise.resolve(result),/Fixture 500/,'el fallo llega a Protection, que mostrará «Reintentar apertura»');
  await h.flush();await quiet();
  assert.ok(h.protection(),'Protection permanece');assert.equal(h.openedApp(),false,'la app no se abrió sobre un estado ausente');
  assert.deepEqual(watch.seen,[],'ningún rechazo sin atender');
 }finally{watch.stop();}
});

test('reintentar tras el fallo solo vuelve a pedir el estado, nunca otra autenticación, y entonces abre',async()=>{
 const h=await locked(),first=h.protection().props.done();await h.flush();h.fail('/v2/state',Error('Fixture 500'));await assert.rejects(Promise.resolve(first));await h.flush();
 const before=h.requests.length,again=h.protection().props.done();await h.flush();
 assert.deepEqual(h.requests.slice(before).map(r=>r.path),['/v2/state'],'el reintento es una lectura de estado y nada más');
 assert.ok(h.protection(),'sigue bloqueado hasta la respuesta');h.respond('/v2/state',STATE);await again;await h.flush();
 assert.equal(h.openedApp(),true);assert.equal(h.requests.filter(r=>/auth\/(login|setup)/.test(r.path)).length,0,'App nunca autentica por su cuenta');
});

test('un 401 al cargar conserva el bloqueo: App vuelve a consultar la puerta y no se abre',async()=>{
 const watch=watchUnhandled();
 try{
  const h=await locked(),before=h.protection().key,result=h.protection().props.done();await h.flush();
  h.fail401('/v2/state');await assert.rejects(Promise.resolve(result),/Desbloquea/);
  await h.flush();
  assert.equal(h.count('/v2/auth/status'),2,'el aviso planb:locked hace que App consulte de nuevo la puerta');
  h.respond('/v2/auth/status',{configured:true,authenticated:false});await h.flush();await quiet();
  assert.ok(h.protection(),'sigue la pantalla de protección');assert.equal(h.openedApp(),false);
  assert.notEqual(h.protection().key,before,'el bloqueo remonta Protection: formulario nuevo, no el modo «acuse confirmado» sin campos');
  assert.deepEqual(watch.seen,[]);
 }finally{watch.stop();}
});
