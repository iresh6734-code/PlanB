import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localKey, open, seal } from './crypto.js';
import type { RecoveryPlan } from '../shared/operations.js';
import {inspectPersistedRecoveryPlan,INVALID_RECOVERY_MESSAGE} from '../shared/recovery-integrity.js';
import {
  AppSpecSchema, BundleSchema, RecordSchema, SnapshotSchema, reconcile, validateRecord, validateSpec,
  type AppSpec, type Change, type ContinuityBundle, type CrmRecord, type CrmSnapshot,
  MAX_RECORDS, type EntityName, type Generation, type Reconciliation
} from '../shared/model.js';

export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export class Store {
  db: DatabaseSync;
  private key: Buffer | null;
  private recoveryCache:{encoded:string|null;state:ReturnType<typeof inspectPersistedRecoveryPlan>}|null=null;
  /**
   * Texto descifrado indexado por el texto cifrado exacto (LRU con tope de entradas y de caracteres).
   * Cada escritura sella con un IV nuevo, así que cualquier cambio —de esta conexión, de otra o de otro
   * proceso— produce otra clave: nunca se sirve contenido antiguo y no hace falta invalidar. decode()
   * sigue analizando el JSON en cada llamada, de modo que quien llama recibe siempre objetos nuevos.
   * No amplía la exposición: la clave local ya permanece en memoria mientras el proceso vive.
   */
  private plainCache=new Map<string,string>();
  private plainCacheChars=0;
  // entry: una captura de 10.000 registros ocupa ~5 M (cifrado + claro) y se lee en cada «ready»; un paquete
  // mucho mayor (archivos, copias) no se guarda, para no expulsar de golpe todo lo demás.
  private plainCacheLimit={entries:4*MAX_RECORDS,chars:48*1024*1024,entry:16*1024*1024};
  constructor(public filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.key = filename === ':memory:' ? null : localKey(dirname(filename));
    this.db = new DatabaseSync(filename);
    this.db.exec(
      'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;' +
      'CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS records(entity TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(entity,id));' +
      'CREATE TABLE IF NOT EXISTS changes(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,entity TEXT NOT NULL,record_id TEXT NOT NULL,operation TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS archives(id TEXT PRIMARY KEY,at TEXT NOT NULL,bundle TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,month TEXT NOT NULL,reserved_usd REAL NOT NULL,used_usd REAL NOT NULL DEFAULT 0,status TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,at TEXT NOT NULL,bytes INTEGER NOT NULL,payload TEXT NOT NULL);'
    );
    this.migrateEncryption();
    // A killed generation must not silently release its worst-case reservation.
    this.db.prepare("UPDATE usage SET status='interrupted' WHERE status='pending'").run();
  }
  close() { this.forgetPlain(); this.db.close(); }
  /** Olvida todo el texto descifrado; se llama al vaciar la tabla de registros (coherente con secure_delete). */
  private forgetPlain() { this.plainCache.clear(); this.plainCacheChars = 0; }
  encode(value: unknown) { const text = JSON.stringify(value); return this.key ? seal(text, this.key) : text; }
  decode<T>(value: string): T { return JSON.parse(this.key ? this.plain(value) : value) as T; }
  private plain(value: string): string {
    if (!value.startsWith('enc1:')) return open(value, this.key!);
    const cached = this.plainCache.get(value);
    if (cached !== undefined) { this.plainCache.delete(value); this.plainCache.set(value, cached); return cached; }
    const text = open(value, this.key!), size = value.length + text.length, limit = this.plainCacheLimit;
    if (size > limit.entry || size > limit.chars) return text;
    this.plainCache.set(value, text); this.plainCacheChars += size;
    for (const [oldest, old] of this.plainCache) {
      if (this.plainCache.size <= limit.entries && this.plainCacheChars <= limit.chars) break;
      this.plainCache.delete(oldest); this.plainCacheChars -= oldest.length + old.length;
    }
    return text;
  }
  private migrateEncryption() {
    if (!this.key) return;
    let changed = false;
    this.transaction(() => {
      for (const [table, columns] of Object.entries({ meta: ['value'], records: ['value'], changes: ['before_json','after_json'], archives: ['bundle'], captures: ['payload'] })) {
        const rows = this.db.prepare('SELECT rowid AS rid,' + (table === 'meta' ? 'key,' : '') + columns.join(',') + ' FROM ' + table).all() as Record<string, string | number | null>[];
        for (const row of rows) for (const column of columns) {
          const value = row[column];
          if (typeof value === 'string' && !value.startsWith('enc1:')) {
            const recoveryPlanRow = table === 'meta' && row.key === 'recoveryPlan';
            let parsed: unknown;
            try { parsed = JSON.parse(value); }
            catch (error) {
              // The journal reader quarantines unreadable entries individually. Leave the original bytes available to it.
              const journalRow = table === 'meta' && typeof row.key === 'string' && row.key.startsWith('task-intent:');
              if (recoveryPlanRow || journalRow) continue;
              throw error;
            }
            // Preserve invalid recovery evidence exactly; its reader exposes the fixed R1 diagnostic.
            if (recoveryPlanRow && inspectPersistedRecoveryPlan(parsed).integrity.state === 'invalid') continue;
            this.db.prepare('UPDATE ' + table + ' SET ' + column + '=? WHERE rowid=?').run(seal(value,this.key!),row.rid);
            changed = true;
          }
        }
      }
    });
    if (changed) this.db.exec('VACUUM');
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string } | undefined;
    return row ? this.decode<T>(row.value) : fallback;
  }
  set(key: string, value: unknown) {
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, this.encode(value));
  }
  private checkedRecoveryState(){
    const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get('recoveryPlan') as {value:string}|undefined,encoded=row?.value??null;
    if(!this.recoveryCache||this.recoveryCache.encoded!==encoded){
      let raw:unknown=null;try{if(encoded!==null)raw=this.decode<unknown>(encoded);}catch{raw=undefined;}
      this.recoveryCache={encoded,state:inspectPersistedRecoveryPlan(raw)};
    }
    return this.recoveryCache.state;
  }
  recoveryIntegrity(){return {...this.checkedRecoveryState().integrity};}
  recoveryState(){const state=this.checkedRecoveryState();return {integrity:{...state.integrity},plan:state.plan?structuredClone(state.plan):null};}
  assertRecoveryIntegrity(){if(this.checkedRecoveryState().integrity.state==='invalid')throw new AppError(409,INVALID_RECOVERY_MESSAGE,{code:'RECOVERY_PLAN_INVALID'});}
  validatedRecoveryPlan(){const state=this.checkedRecoveryState();if(state.integrity.state==='invalid')throw new AppError(409,INVALID_RECOVERY_MESSAGE,{code:'RECOVERY_PLAN_INVALID'});return state.plan?structuredClone(state.plan):null;}
  get snapshot() { return this.get<CrmSnapshot | null>('snapshot', null); }
  get spec() { return this.get<AppSpec | null>('spec', null); }
  get generation() { return this.get<Generation | null>('generation', null); }
  get reconciliation() { return this.get<Reconciliation | null>('reconciliation', null); }
  get disconnected() { return this.get('disconnected', false); }
  get ready() {
    return !!(this.snapshot && this.spec && this.generation?.approved &&
      this.reconciliation?.complete);
  }
  get changesCount() {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n);
  }
  get pendingChangesCount() {
    const watermark=this.get<number>('returnWatermark:hubspot',0);
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM changes WHERE id>?').get(watermark) as {n:number}).n);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  importSnapshot(raw: unknown, replace = false): Reconciliation {
    this.assertRecoveryIntegrity();
    if(this.get('returnBusy',false))throw new AppError(409,'Hay una devolución en curso.');
    if(this.get('continuitySession',null))throw new AppError(409,'Cierra la sesión de continuidad antes de importar otra captura.');
    const parsed = SnapshotSchema.safeParse(raw);
    if (!parsed.success) throw new AppError(422, 'La captura tiene un formato no válido.', parsed.error.flatten());
    const snapshot = parsed.data;
    const report = reconcile(snapshot);
    const ruleErrors = validateSpec({
      version: 1, title: snapshot.name, description: '', entities: snapshot.entities,
      stages: snapshot.stages, rules: snapshot.rules,
      coverage: { supported: ['Datos del origen'], unsupported: snapshot.unsupported }
    }, snapshot);
    report.errors.push(...ruleErrors);
    report.complete = report.errors.length === 0;
    if (!report.complete) {
      this.set('lastImportError', report);
      throw new AppError(422, 'Importación incompleta. Se conserva la última captura válida.', report);
    }
    if (this.changesCount && !replace) throw new AppError(409, 'Hay cambios locales. Exporta una copia antes de cambiar el origen.');
    this.addCapture(snapshot);
    if (this.ready) {
      this.set('candidate', { snapshot, reconciliation: report, spec: null, generation: null, error: null, replaceRecords: true, replaceApproved: replace, baselineChanges: this.changesCount });
      return report;
    }
    this.transaction(() => {
      this.assertRecoveryIntegrity();
      const existing = this.bundleOrNull();
      if (existing) this.db.prepare('INSERT INTO archives(id,at,bundle) VALUES(?,?,?)').run(randomUUID(), new Date().toISOString(), this.encode(existing));
      this.db.exec('DELETE FROM records; DELETE FROM changes;'); this.forgetPlain();
      for (const record of snapshot.records) this.insertRecord(record);
      this.set('snapshot', snapshot); this.set('reconciliation', report);
      this.set('spec', null); this.set('generation', null); this.set('lastError', null);
      this.set('lastImportError', null); this.set('disconnected', false);
      this.set('candidate', null);
      this.resetReturnState();
    });
    return report;
  }
  saveGeneration(raw: unknown, generation: Generation) {
    this.assertRecoveryIntegrity();
    if(this.get('returnBusy',false))throw new AppError(409,'Hay una devolución en curso.');
    if(this.get('continuitySession',null))throw new AppError(409,'La generación queda pausada durante una sesión de continuidad.');
    const candidate = this.candidate;
    const snapshot = candidate?.snapshot ?? this.snapshot;
    if (!snapshot) throw new AppError(409, 'Importa primero una captura.');
    const parsed = AppSpecSchema.safeParse(raw);
    const errors = parsed.success ? validateSpec(parsed.data, snapshot, generation.prompt)
      : ['La especificación no cumple el contrato de la aplicación.'];
    if (errors.length || !parsed.success) {
      this.failGeneration('La generación no superó la validación.');
      throw new AppError(422, 'La aplicación no está preparada. Revisa la generación.', errors);
    }
    if (this.ready) this.transaction(()=>{this.assertRecoveryIntegrity();this.set('candidate', { ...(candidate ?? { snapshot, reconciliation: this.reconciliation!, replaceRecords: false, replaceApproved: false, baselineChanges: this.changesCount }), spec: parsed.data, generation: { ...generation, approved: false }, error: null });});
    else this.transaction(() => { this.assertRecoveryIntegrity();this.set('spec', parsed.data); this.set('generation', { ...generation, approved: false }); this.set('lastError', null); });
  }
  get candidate() { return this.get<{ snapshot: CrmSnapshot; reconciliation: Reconciliation; spec: AppSpec | null; generation: Generation | null; error: string | null; replaceRecords: boolean; replaceApproved: boolean; baselineChanges: number } | null>('candidate',null); }
  failGeneration(message: string) {
    if(this.get('continuitySession',null))return;
    if (this.ready) {
      const candidate = this.candidate ?? { snapshot: this.snapshot!, reconciliation: this.reconciliation!, spec: null, generation: null, replaceRecords: false, replaceApproved: false, baselineChanges: this.changesCount };
      this.set('candidate', { ...candidate, error: message });
    } else this.set('lastError', message);
  }
  activate() {
    this.assertRecoveryIntegrity();
    if(this.get('continuitySession',null))throw new AppError(409,'Cierra la sesión de continuidad antes de activar otra versión.');
    const candidate = this.candidate;
    const spec = candidate?.spec ?? (!candidate ? this.spec : null), snapshot = candidate?.snapshot ?? this.snapshot, generation = candidate?.generation ?? (!candidate ? this.generation : null);
    if (!spec || !snapshot || !generation) throw new AppError(409, 'Genera primero una especificación.');
    if (candidate?.error || !this.ready && this.get('lastError', null)) throw new AppError(409, 'La última generación falló. Vuelve a generarla.');
    if (candidate?.replaceRecords && this.changesCount && (!candidate.replaceApproved || candidate.baselineChanges !== this.changesCount)) throw new AppError(409, 'Hay cambios locales nuevos. Exporta y revisa otra vez la sustitución.');
    const errors = validateSpec(spec, snapshot, generation.prompt);
    for (const record of candidate?.replaceRecords ? snapshot.records : this.records()) {
      const issues = validateRecord(spec, record);
      for (const [key, message] of Object.entries(issues)) errors.push(record.entity + '/' + record.id + '/' + key + ': ' + message);
    }
    if (!this.reconciliation?.complete || errors.length) {
      this.failGeneration('Hay datos o reglas que necesitan revisión.');
      throw new AppError(422, 'No se puede activar todavía.', errors.slice(0, 50));
    }
    this.transaction(() => {
      this.assertRecoveryIntegrity();
      if (candidate) {
        const old = this.bundleOrNull();
        if (old) this.db.prepare('INSERT INTO archives(id,at,bundle) VALUES(?,?,?)').run(randomUUID(),new Date().toISOString(),this.encode(old));
        if (candidate.replaceRecords) { this.db.exec('DELETE FROM records; DELETE FROM changes;'); this.forgetPlain(); for (const record of snapshot.records) this.insertRecord(record);this.resetReturnState(); }
        this.set('snapshot',snapshot); this.set('spec',spec); this.set('reconciliation',candidate.reconciliation);
      }
      this.set('generation', { ...generation, approved: true }); this.set('candidate',null); this.set('lastError',null);
    });
  }
  insertRecord(record: CrmRecord) {
    this.db.prepare('INSERT INTO records(entity,id,value) VALUES(?,?,?) ON CONFLICT(entity,id) DO UPDATE SET value=excluded.value')
      .run(record.entity, record.id, this.encode(record));
  }
  records(entity?: EntityName): CrmRecord[] {
    const rows = entity ? this.db.prepare('SELECT value FROM records WHERE entity=? ORDER BY rowid').all(entity)
      : this.db.prepare('SELECT value FROM records ORDER BY rowid').all();
    return (rows as { value: string }[]).map(r => this.decode<CrmRecord>(r.value));
  }
  record(entity: EntityName, id: string): CrmRecord | null {
    const row = this.db.prepare('SELECT value FROM records WHERE entity=? AND id=?').get(entity, id) as { value: string } | undefined;
    return row ? this.decode<CrmRecord>(row.value) : null;
  }
  saveRecord(entity: EntityName, values: CrmRecord['values'], id?: string): CrmRecord {
    this.assertRecoveryIntegrity();
    if(!id&&Number((this.db.prepare('SELECT COUNT(*) AS n FROM records').get() as {n:number}).n)>=MAX_RECORDS)throw new AppError(413,'El piloto admite hasta 10.000 registros totales.');
    if(this.get('returnBusy',false))throw new AppError(409,'Espera a que termine la devolución revisada.');
    const plan=this.validatedRecoveryPlan();
    if(plan&&plan.status!=='complete'&&plan.operations.some(o=>['applied','sending','uncertain'].includes(o.status)))throw new AppError(409,'Resuelve la devolución parcial antes de seguir editando. Tus cambios actuales se conservan.');
    if (!this.ready || !this.spec) throw new AppError(409, 'Revisa y activa primero la aplicación.');
    const previous = id ? this.record(entity, id) : null;
    if (id && !previous) throw new AppError(404, 'No se encontró el registro.');
    const record = RecordSchema.parse({ entity, id: id ?? 'local-' + randomUUID(), values: previous ? { ...previous.values, ...values } : values });
    const errors = validateRecord(this.spec, record, previous);
    const definition = this.spec.entities.find(e => e.id === entity)!;
    for (const field of definition.fields) {
      const value = record.values[field.key];
      if (field.type === 'reference' && value && field.referenceEntity && !this.record(field.referenceEntity, String(value))) {
        errors[field.key] = 'El registro relacionado no existe.';
      }
      if (!previous && field.readOnly && value !== undefined && value !== null && value !== '') errors[field.key] = 'Este campo no se puede crear manualmente.';
    }
    if (Object.keys(errors).length) throw new AppError(422, 'Revisa los campos señalados.', errors);
    this.transaction(() => {
      this.assertRecoveryIntegrity();
      this.insertRecord(record);
      this.db.prepare('INSERT INTO changes(at,entity,record_id,operation,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .run(new Date().toISOString(), entity, record.id, previous ? 'update' : 'create', previous ? this.encode(previous) : null, this.encode(record));
      this.set('returnComplete',false);
    });
    return record;
  }
  changes(): Change[] {
    return (this.db.prepare('SELECT * FROM changes ORDER BY id').all() as unknown as {
      id: number; at: string; entity: EntityName; record_id: string;
      operation: Change['operation']; before_json: string | null; after_json: string
    }[]).map(r => ({
      id: r.id, at: r.at, entity: r.entity, recordId: r.record_id, operation: r.operation,
      before: r.before_json ? this.decode<CrmRecord>(r.before_json) : null, after: this.decode<CrmRecord>(r.after_json)
    }));
  }
  bundleOrNull(): ContinuityBundle | null {
    this.assertRecoveryIntegrity();
    const snapshot = this.snapshot, spec = this.spec, generation = this.generation;
    if (!snapshot || !spec || !generation) return null;
    const plan=this.validatedRecoveryPlan();
    const manualReport=this.get<NonNullable<ContinuityBundle['returnState']>['manualReport']|null>('manualRecoveryReport',null);
    return { format: snapshot.version===3?'planb-continuity-v3':'planb-continuity-v2', exportedAt: new Date().toISOString(), sessionId: this.get('sessionId',''),
      returnState:{accountId:snapshot.source.accountId,watermark:this.get('returnWatermark:hubspot',0),mapping:this.get('remoteMapping:hubspot',{}),plan:plan?.source==='hubspot'?plan:null,...(manualReport?{manualReport}:{})},
      snapshot, spec, generation, records: this.records(), changes: this.changes() };
  }
  bundle(): ContinuityBundle {
    if (!this.ready) throw new AppError(409, 'Activa una aplicación verificada antes de exportar.');
    return this.bundleOrNull()!;
  }
  restoreBundle(raw: unknown) {
    this.assertRecoveryIntegrity();
    if(this.get('returnBusy',false))throw new AppError(409,'Espera a que termine la revisión de cambios.');
    const parsed = BundleSchema.safeParse(raw);
    if (!parsed.success) throw new AppError(422, 'El paquete de continuidad no es válido.');
    const bundle = parsed.data;
    this.assertPortal(bundle.snapshot);
    const report = reconcile(bundle.snapshot);
    const errors = validateSpec(bundle.spec, bundle.snapshot, bundle.generation.prompt);
    const ids = new Set(bundle.records.map(r => r.entity + ':' + r.id));
    const replay=new Map(bundle.snapshot.records.map(r=>[r.entity+':'+r.id,r]));
    let previousChangeId=0;
    for(const change of bundle.changes){
      const key=change.entity+':'+change.recordId,prior=replay.get(key)??null;
      if(change.id<=previousChangeId||change.after.entity!==change.entity||change.after.id!==change.recordId||
        JSON.stringify(prior)!==JSON.stringify(change.before)||change.operation!==(prior?'update':'create'))errors.push('El historial no corresponde a la captura original.');
      previousChangeId=change.id;replay.set(key,change.after);
    }
    for(const record of bundle.records)if(JSON.stringify(replay.get(record.entity+':'+record.id))!==JSON.stringify(record))errors.push('Hay registros activos sin una operación coherente.');
    if(replay.size!==bundle.records.length)errors.push('El paquete perdió registros del historial.');
    const returned=bundle.returnState;
    if(returned){
      if(returned.accountId!==bundle.snapshot.source.accountId||returned.watermark>previousChangeId)errors.push('Estado de devolución incompatible con el historial.');
      if(returned.manualReport&&(returned.manualReport.watermark!==returned.watermark||returned.manualReport.sessionId!==(bundle.sessionId??'')||returned.manualReport.captureId!==bundle.snapshot.id+':'+bundle.snapshot.capturedAt))errors.push('Comprobación manual incompatible con la sesión.');
      const created=new Set(bundle.changes.filter(c=>c.operation==='create').map(c=>c.entity+':'+c.recordId));
      if(Object.keys(returned.mapping).some(key=>!created.has(key)))errors.push('Correspondencia de IDs sin alta local.');
      if(returned.plan){
        if(returned.plan.source!=='hubspot'||returned.plan.accountId!==returned.accountId)errors.push('Plan de devolución de otro destino.');
        for(const op of returned.plan.operations){
          const definition=bundle.spec.entities.find(e=>e.id===op.entity);
          if(!ids.has(op.entity+':'+op.localId)||op.fields.some(f=>!definition?.fields.some(d=>d.key===f.field&&!d.readOnly&&d.type!=='reference'))||
            op.references.some(r=>!ids.has(r.entity+':'+r.id)||!definition?.fields.some(f=>f.key===r.field&&f.referenceEntity===r.entity)))errors.push('Operación de devolución incompatible con la copia.');
        }
      }
    }
    if (ids.size !== bundle.records.length) errors.push('Registros activos duplicados.');
    for (const baseline of bundle.snapshot.records) {
      if (!ids.has(baseline.entity + ':' + baseline.id)) errors.push('El paquete perdió un registro de la captura.');
    }
    for (const record of bundle.records) {
      for (const [field, message] of Object.entries(validateRecord(bundle.spec, record))) errors.push(record.id + '/' + field + ': ' + message);
      const entity = bundle.spec.entities.find(e => e.id === record.entity);
      for (const field of entity?.fields ?? []) if (field.type === 'reference' && record.values[field.key] &&
        !ids.has(field.referenceEntity + ':' + String(record.values[field.key]))) errors.push('Referencia inválida en el paquete.');
    }
    if (!report.complete || errors.length || !bundle.generation.approved) throw new AppError(422, 'El paquete no superó la comprobación de integridad.', [...report.errors, ...errors]);
    this.transaction(() => {
      this.assertRecoveryIntegrity();
      this.db.exec('DELETE FROM records; DELETE FROM changes;'); this.forgetPlain();
      for (const record of bundle.records) this.insertRecord(record);
      for (const change of bundle.changes) this.db.prepare('INSERT INTO changes(id,at,entity,record_id,operation,before_json,after_json) VALUES(?,?,?,?,?,?,?)')
        .run(change.id, change.at, change.entity, change.recordId, change.operation, change.before ? this.encode(change.before) : null, this.encode(change.after));
      this.set('snapshot', bundle.snapshot); this.set('spec', bundle.spec); this.set('generation', bundle.generation);
      this.set('reconciliation', report); this.set('lastError', null); this.set('disconnected', true);
      this.set('candidate',null); this.set('sessionId',bundle.sessionId ?? randomUUID());
      this.resetReturnState();
      if(returned){
        this.set('returnWatermark:hubspot',returned.watermark);this.set('remoteMapping:hubspot',returned.mapping);
        if(returned.manualReport)this.set('manualRecoveryReport',returned.manualReport);
        const plan=returned.plan;
        if(plan){
          // No sender survives a restore. Treat every outstanding send as unknown even if the saved plan status is inconsistent.
          for(const op of plan.operations)if(op.status==='sending'){op.status='uncertain';op.error='La copia se exportó durante un envío. Verifica el resultado remoto antes de repetir.';}
          if(plan.status==='applying'||plan.operations.some(op=>op.status==='uncertain')){plan.status='partial';plan.approvedAt=null;}
          else if(plan.status==='approved'){plan.status='review';plan.approvedAt=null;}
          this.set('recoveryPlan',plan);
        }
      }
    });
    this.addCapture(bundle.snapshot);
  }
  addCapture(snapshot: CrmSnapshot) {
    const validated=SnapshotSchema.safeParse(snapshot);
    if(!validated.success)throw new AppError(422,'Captura incompatible con el formato o el límite de 10.000 registros.');
    this.assertPortal(snapshot);
    const report = reconcile(snapshot);
    if (!report.complete) throw new AppError(422,'La captura no está conciliada.',report.errors);
    const id = snapshot.id + ':' + snapshot.capturedAt, payload = this.encode(snapshot);
    if(this.db.prepare('SELECT id FROM captures WHERE id=?').get(id))return id;
    this.pruneCaptures();
    const used=this.storageBytes();
    if (used + Buffer.byteLength(payload) > 2 * 1024 ** 3) throw new AppError(507,'Se alcanzó el límite local de 2 GB. Conserva los cambios pendientes y revisa el historial.');
    this.db.prepare('INSERT OR IGNORE INTO captures(id,at,bytes,payload) VALUES(?,?,?,?)').run(id,snapshot.capturedAt,Buffer.byteLength(payload),payload);
    this.pruneCaptures();
    return id;
  }
  storageBytes(){
    let total=0;
    for(const [table,columns] of Object.entries({meta:['value'],records:['value'],changes:['before_json','after_json'],archives:['bundle'],captures:['payload']})){
      const expression=columns.map(c=>'COALESCE(length(CAST('+c+' AS BLOB)),0)').join('+');
      total+=Number((this.db.prepare('SELECT COALESCE(SUM('+expression+'),0) AS n FROM '+table).get() as {n:number}).n);
    }
    return total;
  }
  private resetReturnState() {
    this.assertRecoveryIntegrity();
    this.set('agentState',{runs:[],proposals:[],artifacts:[]});
    this.set('manualRecoveryReport',null);
    for(const key of ['recoveryPlan','continuitySession','simulatedRemote'])this.set(key,null);
    for(const kind of ['simulation','hubspot']){this.set('returnWatermark:'+kind,0);this.set('remoteMapping:'+kind,{});}
    this.set('returnComplete',false);this.set('sessionCapture','');
  }
  captures() { return (this.db.prepare('SELECT id,at,bytes FROM captures ORDER BY at DESC,rowid DESC').all() as unknown as {id:string;at:string;bytes:number}[]); }
  private assertPortal(snapshot:CrmSnapshot){
    const bound=this.get<{accountId:string}|null>('connectionPublic',null);
    if(bound&&snapshot.source.accountId!==bound.accountId)throw new AppError(409,'Esta carpeta pertenece a otro portal. Crea una instalación separada.');
  }
  capture(id: string): CrmSnapshot {
    const row = this.db.prepare('SELECT payload FROM captures WHERE id=?').get(id) as {payload:string} | undefined;
    if (!row) throw new AppError(404,'No se encontró la captura.');
    return this.decode<CrmSnapshot>(row.payload);
  }
  pruneCaptures(now = Date.now()) {
    const archives=this.db.prepare('SELECT id,at,bundle FROM archives ORDER BY at DESC,rowid DESC').all() as {id:string;at:string;bundle:string}[];
    for(const [index,item] of archives.entries()){
      if(index<3&&now-Date.parse(item.at)<30*86400_000)continue;
      const bundle=this.decode<ContinuityBundle>(item.bundle),watermark=bundle.returnState?.watermark??0;
      if(!bundle.changes.some(change=>change.id>watermark))this.db.prepare('DELETE FROM archives WHERE id=?').run(item.id);
    }
    const all = this.captures(), protectedId = this.snapshot ? this.snapshot.id + ':' + this.snapshot.capturedAt : '';
    const days = new Set<string>(); let hours = 0;
    for (const item of all) {
      const recent = now - Date.parse(item.at) < 24 * 3600_000 && hours++ < 24;
      const day = item.at.slice(0,10);
      const daily = !days.has(day) && days.size < 30;
      if (daily) days.add(day);
      if (!recent && !daily && item.id !== protectedId && item.id !== this.get('sessionCapture','')) this.db.prepare('DELETE FROM captures WHERE id=?').run(item.id);
    }
  }
  page(entity: EntityName, query = '', offset = 0, limit = 50, pipeline = '') {
    const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const all = this.records(), names = new Map(all.map(r => [r.entity+':'+r.id, Object.values(r.values).join(' ')]));
    const fields = this.spec?.entities.find(e => e.id === entity)?.fields ?? [];
    const needle = normalize(query);
    const matching = all.filter(r => r.entity === entity && (!pipeline || r.values.pipeline === pipeline) && (!needle || normalize(Object.values(r.values).join(' ') + ' ' + fields.filter(f=>f.type==='reference').map(f=>names.get(f.referenceEntity+':'+r.values[f.key]) ?? '').join(' ')).includes(needle)));
    const records = matching.slice(offset,offset+limit), related = new Map<string,CrmRecord>();
    const byKey = new Map<string,CrmRecord>();
    for (const r of all) if (!byKey.has(r.entity+':'+r.id)) byKey.set(r.entity+':'+r.id, r);
    for (const record of records) for (const field of fields) if (field.type === 'reference' && record.values[field.key]) {
      const target = record.values[field.key]; // Igual que la búsqueda anterior: solo un ID de texto idéntico.
      const item = typeof target === 'string' ? byKey.get(field.referenceEntity+':'+target) : undefined;
      if (item) related.set(item.entity+':'+item.id,item);
    }
    return { records, related: [...related.values()], total: matching.length, offset, limit };
  }
  usage() {
    const month = new Date().toISOString().slice(0, 7);
    const row = this.db.prepare("SELECT COALESCE(SUM(used_usd),0) AS used,COALESCE(SUM(CASE WHEN status IN ('pending','interrupted') THEN reserved_usd ELSE 0 END),0) AS reserved,COUNT(*) AS requests FROM usage WHERE month=?").get(month) as { used: number; reserved: number; requests: number };
    return { usedUsd: row.used, reservedUsd: row.reserved, limitUsd: 25, requests: row.requests };
  }
  reserveUsage(worstCaseUsd: number): string {
    this.assertRecoveryIntegrity();
    if (!Number.isFinite(worstCaseUsd) || worstCaseUsd < 0) throw new AppError(422, 'La reserva de presupuesto no es válida.');
    const id = randomUUID(), month = new Date().toISOString().slice(0, 7);
    this.transaction(() => {
      this.assertRecoveryIntegrity();
      const used = this.usage();
      if (used.usedUsd + used.reservedUsd + worstCaseUsd > used.limitUsd) throw new AppError(429, 'Se alcanzó el límite local de 25 USD para pruebas de IA.');
      this.db.prepare("INSERT INTO usage(id,month,reserved_usd,used_usd,status) VALUES(?,?,?,0,'pending')").run(id, month, worstCaseUsd);
    });
    return id;
  }
  settleUsage(id: string, usd: number) {
    if (!Number.isFinite(usd) || usd < 0) throw new AppError(422, 'El coste comunicado por el proveedor no es válido.');
    this.db.prepare("UPDATE usage SET used_usd=?,reserved_usd=0,status='complete' WHERE id=?").run(usd, id);
  }
}
