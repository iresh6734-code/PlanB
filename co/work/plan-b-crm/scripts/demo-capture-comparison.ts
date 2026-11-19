import { makeFixture } from '../shared/fixtures.js';
import { compareCaptures } from '../shared/capture-comparison.js';

const from = makeFixture(), to = structuredClone(from);
from.capturedAt = '2026-10-28T12:00:00.000Z'; to.capturedAt = '2026-10-29T12:00:00.000Z';
to.records.find(r => r.entity === 'contacts')!.values.phone = '600 000 040';
to.records.push({ entity: 'tasks', id: 'demo-diff-new-task', values: { subject: 'Seguimiento ficticio nuevo', due_date: '2026-10-30', status: 'pending' } });
to.manifest.expectedCounts.tasks++;
console.log(JSON.stringify({ synthetic: true, ...compareCaptures(from, to) }, null, 2));
