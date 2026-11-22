// Cobertura declarada frente a cobertura real (misión maestra A10-2, 22/11/2026). Lógica pura.
// Decir con claridad qué conserva la copia y qué NO es parte de la promesa: una copia completa de estos datos no equivale a
// reproducir todas las funciones del CRM. Todo sale de la especificación y de la captura, nunca de un texto fijo.
import type { AppSpec, EntityName } from '../../shared/model.js';

const READ_ONLY_PREFIX = 'Campo conservado como solo lectura:';

export interface CoverageStatement {
  /** Tipos de registro que la copia conserva, con su recuento en la captura (null si no se conoce) y sus campos. */
  copied: { entity: EntityName; label: string; records: number | null; fields: number }[];
  /** Lo que la copia no reproduce, tal como lo declaró la captura (sin la lista de campos de solo lectura). */
  notCopied: string[];
  /** Campos que se conservan pero no se pueden editar en la copia. */
  readOnlyFields: number;
  /** Procesos cubiertos que declara la especificación. */
  supported: string[];
}

export function coverageStatement(spec: Pick<AppSpec, 'entities' | 'coverage'>, counts: Partial<Record<EntityName, number>> | null): CoverageStatement {
  const unsupported = [...new Set(spec.coverage.unsupported.map(item => item.trim()).filter(Boolean))];
  return {
    copied: spec.entities.map(entity => ({ entity: entity.id, label: entity.label, records: counts?.[entity.id] ?? null, fields: entity.fields.length })),
    notCopied: unsupported.filter(item => !item.startsWith(READ_ONLY_PREFIX)),
    readOnlyFields: unsupported.filter(item => item.startsWith(READ_ONLY_PREFIX)).length,
    supported: [...spec.coverage.supported],
  };
}

/** Una línea para la portada: «No se copia: a, b y c.» (con «y N más» si son muchas). Vacía si no hay nada declarado. */
export function notCopiedLine(statement: CoverageStatement, max = 4): string {
  const items = statement.notCopied.map(item => item.charAt(0).toLowerCase() + item.slice(1));
  if (!items.length) return '';
  const shown = items.slice(0, max), rest = items.length - shown.length;
  const list = rest > 0 ? shown.join(', ') + ' y ' + rest + ' más' : shown.length > 1 ? shown.slice(0, -1).join(', ') + ' y ' + shown[shown.length - 1] : shown[0];
  return 'No se copia: ' + list + '.';
}
