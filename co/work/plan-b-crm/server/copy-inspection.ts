import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {AppError,type Store} from './store.js';
import {inspectRecoveryCopy} from './recovery-preflight.js';
import {compareBackupCoverage} from './backup-coverage.js';
import {bundleRevision} from './recovery-copy.js';
import {encodePortable} from './crypto.js';
import {MAX_COPY_REVIEW_BYTES,type CopyReference,type CopyReview} from '../shared/copy-inspection.js';

function reference(store:Store){
 const empty=(reason:CopyReference['reason'])=>({bundle:null,raw:null,context:{available:false,revision:null,captureId:null,accountId:null,isTestData:null,records:null,changes:null,pendingChanges:null,reason} satisfies CopyReference});
 if(store.recoveryIntegrity().state==='invalid')return empty('RECOVERY_STATE_INVALID');
 if(!store.ready)return empty('NO_ACTIVE_COPY');
 const bundle=store.bundleOrNull();if(!bundle)return empty('NO_ACTIVE_COPY');
 const raw=JSON.stringify(bundle);if(Buffer.byteLength(raw,'utf8')>MAX_COPY_REVIEW_BYTES)return empty('REFERENCE_TOO_LARGE');
 return {bundle,raw,context:{available:true,revision:bundleRevision(bundle),captureId:bundle.snapshot.id+':'+bundle.snapshot.capturedAt,accountId:bundle.snapshot.source.accountId,isTestData:bundle.snapshot.source.isTestData,records:bundle.records.length,changes:bundle.changes.length,pendingChanges:store.pendingChangesCount,reason:null} satisfies CopyReference};
}
const inputSchema=z.object({encoded:z.string().max(Math.ceil(MAX_COPY_REVIEW_BYTES/3)*4),password:z.string().max(200).optional(),referenceRevision:z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict();
export function registerCopyInspection(app:FastifyInstance,store:Store){
 app.get('/api/v7/copy-review/context',()=>reference(store).context);
 app.post('/api/v7/copy-review/inspect',{bodyLimit:48*1024*1024},request=>{
  const input=inputSchema.parse(request.body),active=reference(store);
  if(input.referenceRevision!==active.context.revision)throw new AppError(409,'La referencia local cambió. Actualiza su contexto y revisa el archivo de nuevo.');
  const bytes=Buffer.from(input.encoded,'base64');
  if(bytes.length>MAX_COPY_REVIEW_BYTES)throw new AppError(413,'El archivo supera el límite de 32 MiB.');
  if(bytes.toString('base64')!==input.encoded)throw new AppError(422,'La transferencia del archivo está incompleta o no es canónica.');
  const raw=bytes.toString('utf8');if(!Buffer.from(raw,'utf8').equals(bytes))throw new AppError(422,'El archivo debe ser JSON portátil en UTF-8 válido.');
  const inspection=inspectRecoveryCopy(raw,{password:input.password,...(active.context.available?{target:{accountId:active.context.accountId!,isTestData:active.context.isTestData!}}:{})});
  const artifactHash=createHash('sha256').update(bytes).digest('hex');
  if(inspection.artifactHash!==artifactHash)throw new AppError(500,'No se pudo vincular el resultado al archivo recibido.');
  const checkedInspection={...inspection,artifactHash};
  let coverage:CopyReview['coverage']=null;
  if(active.bundle&&active.raw&&inspection.status!=='invalid'){
   // The comparison engine requires encryption for production artifacts. This reference never leaves memory.
   const referencePassword=active.bundle.snapshot.source.isTestData?undefined:randomBytes(24).toString('hex');
   const compared=compareBackupCoverage({reference:referencePassword?encodePortable(active.bundle,referencePassword):active.raw,referencePassword,backup:raw,backupPassword:input.password});
   if(compared.reference.revision&&compared.reference.revision!==active.context.revision)throw new AppError(500,'No se pudo vincular la cobertura a la referencia local.');
   coverage={status:compared.status,referenceRevision:active.context.revision,backupRevision:compared.backup.revision,sameSource:compared.sameSource,sameCapture:compared.sameCapture,missingLocalChanges:compared.missingLocalChanges,differences:compared.differences,nextAction:compared.reference.validity==='valid'?compared.nextAction:'El archivo se ha revisado, pero la referencia no pudo validarse dentro de los límites de comparación. Conserva el archivo y realiza un ensayo independiente.'};
  }
  if(reference(store).context.revision!==active.context.revision)throw new AppError(409,'La referencia local cambió durante la comprobación. Actualiza el contexto y vuelve a revisarlo.');
  return {artifact:{sha256:artifactHash,bytes:bytes.length},reference:active.context,inspection:checkedInspection,coverage,inspectedAt:new Date().toISOString(),limitations:[
   'El archivo se verifica en este servidor local mediante restauraciones de prueba solo en memoria. No se restaura la instalación ni se envían datos a proveedores.',
   'La cobertura se compara con la revisión local indicada en este resultado, no con el estado actual del portal ni con cambios posteriores.',
   'Integridad y coincidencia no demuestran custodia fuera del ordenador, contraseña guardada por separado o recuperación en otro equipo.',
   'No se persisten el archivo, la contraseña o este resultado y no se confirma custodia. No se inspeccionan ZIP ni claves de Windows.'
  ]} satisfies CopyReview;
 });
}
