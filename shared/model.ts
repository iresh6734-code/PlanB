import { z } from 'zod';

export const entityNames = ['contacts', 'companies', 'deals', 'tasks'] as const;
export const MAX_RECORDS = 10000;
export const ConnectionModeSchema = z.enum(['test', 'production_readonly']);
export type ConnectionMode = z.infer<typeof ConnectionModeSchema>;
export const CaptureSelectionSchema = z.record(z.enum(['contacts','companies','deals','tasks']), z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/)).max(60)).optional();
export const EntityNameSchema = z.enum(entityNames);
export type EntityName = z.infer<typeof EntityNameSchema>;
export type FieldValue = string | number | boolean | null;
const valueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
export const FieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'email', 'number', 'date', 'datetime', 'multiselect', 'enum', 'reference', 'boolean']),
  required: z.boolean(),
  readOnly: z.boolean(),
  options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
  referenceEntity: EntityNameSchema.nullable()
}).strict();
export type Field = z.infer<typeof FieldSchema>;
export const RuleSchema = z.object({
  id: z.string().min(1).max(100),
  entity: EntityNameSchema,
  kind: z.enum(['required', 'email', 'min', 'conditional_required', 'allowed_transition']),
  field: z.string(),
  value: z.string().nullable(),
  whenField: z.string().nullable(),
  whenValue: z.string().nullable(),
  origin: z.enum(['configuration', 'user']),
  description: z.string().min(1).max(500),
  evidence: z.string().min(1).max(1000)
}).strict();
export type Rule = z.infer<typeof RuleSchema>;
export const EntitySchema = z.object({
  id: EntityNameSchema,
  label: z.string().min(1),
  singular: z.string().min(1),
  displayField: z.string(),
  columns: z.array(z.string()).min(1),
  fields: z.array(FieldSchema).min(1)
}).strict();
export type Entity = z.infer<typeof EntitySchema>;
export const RecordSchema = z.object({
  id: z.string().min(1),
  entity: EntityNameSchema,
  values: z.record(valueSchema)
}).strict();
export type CrmRecord = z.infer<typeof RecordSchema>;
export const StageSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  pipelineId: z.string().optional()
}).strict();
export const LinkSchema = z.object({
  fromEntity: EntityNameSchema, fromId: z.string(),
  toEntity: EntityNameSchema, toId: z.string(), label: z.string()
}).strict();
export type Link = z.infer<typeof LinkSchema>;
export const SnapshotSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  captureStartedAt: z.string().datetime().optional(),
  pipelines: z.array(z.object({ id: z.string(), label: z.string() }).strict()).optional(),
  id: z.string(),
  name: z.string().min(1),
  capturedAt: z.string().datetime(),
  source: z.object({
    kind: z.enum(['fixture', 'hubspot', 'archive']),
    accountId: z.string(),
    isTestData: z.boolean(),
    environment: z.enum(['test','production']).optional(),
    accountType: z.string().optional(),
    description: z.string()
  }).strict(),
  entities: z.array(EntitySchema).length(4),
  records: z.array(RecordSchema).max(MAX_RECORDS),
  links: z.array(LinkSchema).max(200000),
  stages: z.array(StageSchema).min(1),
  rules: z.array(RuleSchema),
  unsupported: z.array(z.string()),
  manifest: z.object({
    complete: z.boolean(),
    expectedCounts: z.record(z.number().int().nonnegative()),
    expectedLinks: z.number().int().nonnegative()
  }).strict()
}).strict().superRefine((snapshot, ctx) => {
  const production = !snapshot.source.isTestData;
  if (production && (snapshot.version !== 3 || snapshot.source.environment !== 'production' || snapshot.source.kind !== 'hubspot' || snapshot.source.accountType !== 'STANDARD')) {
    ctx.addIssue({code:'custom',message:'Los datos de producción requieren formato v3 y una cuenta STANDARD verificada.'});
  }
  if (!production && snapshot.source.environment === 'production') ctx.addIssue({code:'custom',message:'Clasificación de datos incoherente.'});
});
export type CrmSnapshot = z.infer<typeof SnapshotSchema>;
export const AppSpecSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  roles: z.object({ stage: z.string(), amount: z.string(), pipeline: z.string().nullable(), dueDate: z.string(), taskStatus: z.string() }).strict().optional(),
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  entities: z.array(EntitySchema).length(4),
  stages: z.array(StageSchema).min(1),
  rules: z.array(RuleSchema),
  coverage: z.object({
    supported: z.array(z.string()),
    unsupported: z.array(z.string())
  }).strict()
}).strict();
export type AppSpec = z.infer<typeof AppSpecSchema>;
export const GenerationSchema = z.object({
  provider: z.enum(['demo', 'ai']),
  model: z.string().nullable(),
  generatedAt: z.string().datetime(),
  prompt: z.string(),
  approved: z.boolean()
}).strict();
export type Generation = z.infer<typeof GenerationSchema>;
export interface Change {
  id: number; at: string; entity: EntityName; recordId: string;
  operation: 'create' | 'update';
  before: CrmRecord | null; after: CrmRecord;
}
export interface Reconciliation {
  complete: boolean;
  counts: Record<string, { expected: number; actual: number }>;
  expectedLinks: number;
  actualLinks: number;
  errors: string[];
}
export interface AppState {
  snapshot: CrmSnapshot | null;
  spec: AppSpec | null;
  generation: Generation | null;
  reconciliation: Reconciliation | null;
  disconnected: boolean;
  runtime: boolean;
  ready: boolean;
  changes: number;
  aiConfigured: boolean;
  hubspotConfigured: boolean;
  usage: { usedUsd: number; reservedUsd: number; limitUsd: number; requests: number };
  lastError: string | null;
  aiSettings: {
    preset: string; baseUrl: string; model: string; hasKey: boolean;
    inputUsdPerMillion: number | null; outputUsdPerMillion: number | null;
    outputMode: 'json_schema' | 'json_object'; maxOutputTokens: number;
  } | null;
  candidate?: { snapshot: CrmSnapshot; spec: AppSpec | null; generation: Generation | null; reconciliation: Reconciliation; error: string | null } | null;
}
export const RecoveryPlanSchema=z.object({
  id:z.string(),accountId:z.string(),createdAt:z.string().datetime(),revision:z.string(),
  status:z.enum(['review','approved','applying','complete','partial']),source:z.enum(['hubspot','simulation']),warning:z.string(),approvedAt:z.string().nullable(),
  operations:z.array(z.object({
    id:z.string(),entity:EntityNameSchema,localId:z.string(),remoteId:z.string().nullable(),kind:z.enum(['create','update']),label:z.string(),
    fields:z.array(z.object({field:z.string(),label:z.string(),base:valueSchema,local:valueSchema,remote:valueSchema,conflict:z.boolean(),decision:z.enum(['local','remote']).nullable()}).strict()),
    references:z.array(z.object({field:z.string(),entity:EntityNameSchema,id:z.string().nullable()}).strict()),
    remoteVersion:z.string().nullable(),status:z.enum(['pending','sending','applied','failed','uncertain','skipped']),error:z.string().nullable()
  }).strict())
}).strict();
export const BundleSchema = z.object({
  format: z.enum(['planb-continuity-v1', 'planb-continuity-v2', 'planb-continuity-v3']),
  sessionId: z.string().optional(),
  returnState:z.object({accountId:z.string(),watermark:z.number().int().min(0),mapping:z.record(z.string().min(1)),plan:RecoveryPlanSchema.nullable(),manualReport:z.object({id:z.string(),sessionId:z.string(),captureId:z.string(),revision:z.string(),watermark:z.number().int().min(0),verifiedAt:z.string().datetime(),method:z.literal('manual_verified'),records:z.number().int().min(0)}).strict().optional()}).strict().optional(),
  exportedAt: z.string().datetime(),
  snapshot: SnapshotSchema,
  spec: AppSpecSchema,
  generation: GenerationSchema,
  records: z.array(RecordSchema).max(MAX_RECORDS),
  changes: z.array(z.object({
    id: z.number().int(), at: z.string().datetime(), entity: EntityNameSchema,
    recordId: z.string(), operation: z.enum(['create', 'update']),
    before: RecordSchema.nullable(), after: RecordSchema
  }).strict())
}).strict().superRefine((bundle,ctx)=>{
  if(!bundle.snapshot.source.isTestData && bundle.format!=='planb-continuity-v3')ctx.addIssue({code:'custom',message:'Un paquete con datos reales requiere formato v3.'});
});
export type ContinuityBundle = z.infer<typeof BundleSchema>;

export function reconcile(snapshot: CrmSnapshot): Reconciliation {
  const errors: string[] = [];
  const names = snapshot.entities.map(e => e.id);
  if (new Set(names).size !== 4 || entityNames.some(e => !names.includes(e))) {
    errors.push('La captura debe contener las cuatro entidades, sin duplicados.');
  }
  const ids = new Set<string>();
  const availableIds = new Set(snapshot.records.map(r => r.entity + ':' + r.id));
  for (const record of snapshot.records) {
    const id = record.entity + ':' + record.id;
    if (ids.has(id)) errors.push('Registro duplicado: ' + id);
    ids.add(id);
    const entity = snapshot.entities.find(e => e.id === record.entity);
    if (!entity) continue;
    const fields = new Map(entity.fields.map(f => [f.key, f]));
    for (const [key, value] of Object.entries(record.values)) {
      const field = fields.get(key);
      if (!field) errors.push('Campo sin definición: ' + record.entity + '.' + key);
      if (field?.type === 'reference' && value && field.referenceEntity &&
          !availableIds.has(field.referenceEntity + ':' + String(value))) {
        errors.push('Referencia sin destino: ' + id + '.' + key);
      }
    }
  }
  for (const entity of snapshot.entities) {
    if (new Set(entity.fields.map(f => f.key)).size !== entity.fields.length) errors.push('Campos duplicados: ' + entity.id);
    if (!entity.fields.some(f => f.key === entity.displayField)) errors.push('Nombre principal no válido: ' + entity.id);
    if (entity.columns.some(k => !entity.fields.some(f => f.key === k))) errors.push('Columna desconocida: ' + entity.id);
  }
  const counts = Object.fromEntries(entityNames.map(name => {
    const actual = snapshot.records.filter(r => r.entity === name).length;
    const expected = snapshot.manifest.expectedCounts[name];
    if (expected === undefined || actual !== expected) errors.push('Recuento incompleto: ' + name);
    return [name, { expected: expected ?? 0, actual }];
  }));
  for (const link of snapshot.links) {
    if (!ids.has(link.fromEntity + ':' + link.fromId) || !ids.has(link.toEntity + ':' + link.toId)) {
      errors.push('Relación sin registro de origen o destino.');
    }
  }
  if (snapshot.links.length !== snapshot.manifest.expectedLinks) errors.push('Recuento incompleto de relaciones.');
  if (!snapshot.manifest.complete) errors.push('El origen no confirmó una captura completa.');
  return {
    complete: errors.length === 0, counts,
    expectedLinks: snapshot.manifest.expectedLinks, actualLinks: snapshot.links.length,
    errors: [...new Set(errors)]
  };
}

export function validateSpec(spec: AppSpec, snapshot: CrmSnapshot, userPrompt = ''): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entity of spec.entities) {
    if (seen.has(entity.id)) errors.push('Entidad duplicada: ' + entity.id);
    seen.add(entity.id);
    const source = snapshot.entities.find(e => e.id === entity.id);
    if (!source) { errors.push('Entidad ajena al origen.'); continue; }
    const fields = new Map(source.fields.map(f => [f.key, f]));
    if (entity.fields.length !== source.fields.length) errors.push('Faltan campos importados: ' + entity.id);
    if (new Set(entity.fields.map(f => f.key)).size !== entity.fields.length) errors.push('Campos duplicados.');
    for (const field of entity.fields) {
      const original = fields.get(field.key);
      if (!original || field.type !== original.type || field.readOnly !== original.readOnly ||
          field.required !== original.required || field.referenceEntity !== original.referenceEntity ||
          JSON.stringify(field.options) !== JSON.stringify(original.options)) {
        errors.push('Se alteró la definición del campo: ' + entity.id + '.' + field.key);
      }
    }
    if (!fields.has(entity.displayField) || entity.columns.some(k => !fields.has(k))) errors.push('Vista con campos desconocidos.');
  }
  if (seen.size !== 4) errors.push('Faltan entidades.');
  if (JSON.stringify(spec.stages) !== JSON.stringify(snapshot.stages)) errors.push('Se alteraron las etapas del origen.');
  const ruleIds = new Set<string>();
  for (const rule of spec.rules) {
    if (ruleIds.has(rule.id)) errors.push('Regla duplicada.');
    ruleIds.add(rule.id);
    const entity = snapshot.entities.find(e => e.id === rule.entity);
    const field = entity?.fields.find(f => f.key === rule.field);
    if (!field || field.readOnly) errors.push('Regla sobre un campo no editable.');
    if (rule.whenField && !entity?.fields.some(f => f.key === rule.whenField)) errors.push('Condición sobre un campo desconocido.');
    if (rule.kind === 'conditional_required' && (!rule.whenField || rule.whenValue === null)) errors.push('Regla condicional incompleta.');
    if (rule.kind === 'conditional_required') {
      const condition = entity?.fields.find(f => f.key === rule.whenField);
      if (condition?.type === 'enum' && !condition.options.some(o => o.id === rule.whenValue)) errors.push('La condición usa una opción desconocida.');
    }
    if (rule.kind === 'min' && (field?.type !== 'number' || rule.value === null || !Number.isFinite(Number(rule.value)))) errors.push('Límite numérico no válido.');
    if (rule.kind === 'email' && field?.type !== 'email' && field?.type !== 'text') errors.push('Validación de correo no compatible.');
    if (rule.kind === 'allowed_transition') {
      const valid = new Set(snapshot.stages.map(s => s.id));
      if (rule.entity !== 'deals' || rule.field !== 'dealstage') errors.push('Las transiciones solo se aplican a la etapa de una oportunidad.');
      if (!rule.whenValue || !rule.value || !valid.has(rule.whenValue) || rule.value.split(',').some(v => !valid.has(v))) errors.push('Transición comercial desconocida.');
    }
    if (rule.origin === 'configuration' && !snapshot.rules.some(r => JSON.stringify(r) === JSON.stringify(rule))) {
      errors.push('Regla importada sin evidencia en la captura.');
    }
    if (rule.origin === 'user' && (!userPrompt.trim() || !userPrompt.includes(rule.evidence))) {
      errors.push('Regla de usuario sin una cita exacta de su instrucción.');
    }
  }
  for (const rule of snapshot.rules) {
    if (!spec.rules.some(r => JSON.stringify(r) === JSON.stringify(rule))) errors.push('Falta una regla del origen: ' + rule.id);
  }
  if (spec.coverage.supported.length === 0) errors.push('La aplicación debe declarar procesos cubiertos.');
  for (const limitation of snapshot.unsupported) {
    if (!spec.coverage.unsupported.includes(limitation)) errors.push('Falta declarar una limitación del origen.');
  }
  return [...new Set(errors)];
}

export function validateRecord(spec: AppSpec, record: CrmRecord, previous?: CrmRecord | null): Record<string, string> {
  const errors: Record<string, string> = {};
  const entity = spec.entities.find(e => e.id === record.entity);
  if (!entity) return { _form: 'Entidad desconocida.' };
  for (const key of Object.keys(record.values)) if (!entity.fields.some(f => f.key === key)) errors[key] = 'Campo desconocido.';
  for (const field of entity.fields) {
    const value = record.values[field.key];
    const empty = value === null || value === undefined || value === '';
    if (field.readOnly && previous && value !== previous.values[field.key]) errors[field.key] = 'Este campo es de solo lectura.';
    if (field.required && empty) errors[field.key] = 'Completa este campo.';
    if (empty) continue;
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) errors[field.key] = 'Introduce un número válido.';
    if (field.type === 'boolean' && typeof value !== 'boolean') errors[field.key] = 'Introduce un valor verdadero o falso.';
    if (['text', 'email', 'date', 'datetime', 'multiselect', 'enum', 'reference'].includes(field.type) && typeof value !== 'string') errors[field.key] = 'Introduce un texto válido.';
    if (field.type === 'datetime' && (!/^\d{4}-\d{2}-\d{2}T/.test(String(value)) || Number.isNaN(Date.parse(String(value))))) errors[field.key] = 'Introduce fecha y hora válidas.';
    if (field.type === 'multiselect' && String(value).split(';').some(v => !field.options.some(o => o.id === v))) errors[field.key] = 'Hay opciones desconocidas.';
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors[field.key] = 'Introduce un correo válido.';
    if (field.type === 'date') {
      const text = String(value), parsed = Date.parse(text);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== text) errors[field.key] = 'Introduce una fecha válida.';
    }
    if (field.type === 'enum' && !field.options.some(o => o.id === value)) errors[field.key] = 'Selecciona una opción válida.';
    if (typeof value === 'string' && value.length > 10000) errors[field.key] = 'El texto es demasiado largo.';
  }
  for (const rule of spec.rules.filter(r => r.entity === record.entity)) {
    const value = record.values[rule.field];
    const empty = value === null || value === undefined || value === '';
    if (rule.kind === 'required' && empty) errors[rule.field] = rule.description;
    if (rule.kind === 'email' && !empty && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors[rule.field] = rule.description;
    if (rule.kind === 'min' && !empty && Number(value) < Number(rule.value)) errors[rule.field] = rule.description;
    if (rule.kind === 'conditional_required' && String(record.values[rule.whenField!]) === rule.whenValue && empty) errors[rule.field] = rule.description;
    if (rule.kind === 'allowed_transition' && previous && previous.values[rule.field] !== value &&
        String(previous.values[rule.field]) === rule.whenValue && !rule.value!.split(',').includes(String(value))) errors[rule.field] = rule.description;
  }
  const pipeline = record.values.pipeline;
  if (record.entity === 'deals' && pipeline) {
    const stage = spec.stages.find(s => s.id === record.values.dealstage);
    if (stage?.pipelineId && stage.pipelineId !== pipeline) errors.dealstage = 'La etapa no pertenece a este proceso comercial.';
  }
  return errors;
}
