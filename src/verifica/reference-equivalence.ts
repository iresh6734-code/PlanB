// Plan B Verifica · el informe de equivalencia de ejemplo. Va aparte porque arrastra el verificador de migraciones (y zod):
// la página lo carga solo al pulsar «Migración», y quien abre un informe de un archivo no lo descarga nunca.
import { buildMigratedCompany } from '../../shared/verifica/empresa-migrada.js';
import type { EquivalenceReport } from '../../shared/verifica/equivalence.js';
import { buildEquivalence } from '../../shared/verifica/migration.js';
import type { Variant } from './Masthead.js';

export function referenceEquivalence(variant: Variant): EquivalenceReport {
  const m = buildMigratedCompany({ traps: variant === 'traps' });
  return buildEquivalence({ asOf: m.asOf, closing: m.closing, target: m.target, map: m.map, salt: m.salt, watch: m.watch }).report;
}
