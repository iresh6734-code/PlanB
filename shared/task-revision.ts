import { z } from 'zod';
import { RecordSchema } from './model.js';

const token = z.string().regex(/^[a-f0-9]{64}$/);
const value = z.union([z.string().max(20_000), z.number().finite(), z.boolean(), z.null()]);
export const TaskRevisionParams = z.object({ id: z.string().min(1).max(500) }).strict();
export const TaskRevisionWrite = z.object({
  expectedRevision: token,
  values: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/), value)
    .refine(values => Object.keys(values).length > 0 && Object.keys(values).length <= 60, 'Selecciona entre uno y 60 campos.'),
}).strict();
export const TaskRevisionView = z.object({
  format: z.literal('planb-task-revision-v1'),
  revision: token,
  instanceId: z.string().uuid(),
  captureId: z.string(),
  capturedAt: z.string().datetime(),
  record: RecordSchema.refine(record => record.entity === 'tasks'),
}).strict();
export const TaskRevisionResult = z.object({
  ok: z.literal(true), changed: z.boolean(), current: TaskRevisionView,
}).strict();
export type TaskRevisionView = z.infer<typeof TaskRevisionView>;
