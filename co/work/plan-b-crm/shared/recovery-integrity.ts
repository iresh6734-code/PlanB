import {z} from 'zod';
import {RecoveryPlanSchema,BundleSchema} from './model.js';
import type {RecoveryPlan} from './operations.js';

export const INVALID_RECOVERY_MESSAGE='El plan de devolución guardado no se puede validar. Se conserva sin cambios. No edites, sustituyas ni devuelvas datos hasta revisarlo con la agencia. Puedes consultar y exportar el historial de cambios.';
export const RecoveryIntegritySchema=z.discriminatedUnion('state',[
  z.object({state:z.literal('none'),code:z.null(),message:z.null()}).strict(),
  z.object({state:z.literal('valid'),code:z.null(),message:z.null()}).strict(),
  z.object({state:z.literal('invalid'),code:z.literal('RECOVERY_PLAN_INVALID'),message:z.literal(INVALID_RECOVERY_MESSAGE)}).strict()
]);
export type RecoveryIntegrity=z.infer<typeof RecoveryIntegritySchema>;
export const SavedChangesSchema=BundleSchema.shape.changes;
export const RecoveryChangesSchema=z.object({changes:SavedChangesSchema,plan:RecoveryPlanSchema.nullable(),recoveryIntegrity:RecoveryIntegritySchema,revision:z.string(),pendingChanges:z.number().int().nonnegative(),watermark:z.number().int().nonnegative(),manualReport:z.object({verifiedAt:z.string().datetime()}).nullable()}).superRefine((r,c)=>{if(r.recoveryIntegrity.state==='valid'&&r.plan===null||r.recoveryIntegrity.state!=='valid'&&r.plan!==null)c.addIssue({code:'custom',message:'El plan no corresponde al estado declarado.'});});
/** Shape only: valid does not mean an operation succeeded remotely or has permission to run. */
export function inspectPersistedRecoveryPlan(raw:unknown):{integrity:RecoveryIntegrity;plan:RecoveryPlan|null}{
  if(raw===null)return {integrity:{state:'none',code:null,message:null},plan:null};
  const result=RecoveryPlanSchema.safeParse(raw);
  return result.success?{integrity:{state:'valid',code:null,message:null},plan:result.data}:{integrity:{state:'invalid',code:'RECOVERY_PLAN_INVALID',message:INVALID_RECOVERY_MESSAGE},plan:null};
}
