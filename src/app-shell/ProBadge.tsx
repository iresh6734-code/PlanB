import type { FeatureId } from '../../shared/plans.js';
import { useFeatureAccess } from './plan-access.js';

/** N1 · Insignia «Pro» de una función. Informa, no bloquea. Dentro de un botón va como decorativa (el botón ya tiene su nombre). */
export function ProBadge({ feature, decorative = false }: { feature: FeatureId; decorative?: boolean }) {
  const access = useFeatureAccess(feature);
  return <span className="pro-badge" data-via={access.via} title={access.hint} aria-hidden={decorative ? 'true' : undefined}>
    {access.badge}{decorative ? null : <span className="oc-sr"> · {access.hint}</span>}
  </span>;
}
