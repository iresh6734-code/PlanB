import { makeDemoSpec, makeFixture } from '../shared/fixtures.js';
import { buildResponseQueue } from '../shared/response-queue.js';

const snapshot = makeFixture(), spec = makeDemoSpec(snapshot);
const records = snapshot.records.filter(r => r.entity !== 'tasks');
records.push(
  { id: 'demo-overdue', entity: 'tasks', values: { subject: 'Llamada pendiente', status: 'pending', due_date: '2026-10-28', contact_id: 'contact-1' } },
  { id: 'demo-today', entity: 'tasks', values: { subject: 'Preparar propuesta', status: 'pending', due_date: '2026-10-29' } },
  { id: 'demo-review', entity: 'tasks', values: { subject: 'Confirmar próxima acción', status: 'custom', due_date: null } },
  { id: 'demo-done', entity: 'tasks', values: { subject: 'Seguimiento cerrado', status: 'completed', due_date: '2026-10-27' } },
);
console.log(JSON.stringify({ synthetic: true, ...buildResponseQueue({ spec, records, evaluatedAt: Date.UTC(2026, 9, 29, 12), horizonHours: 8 }) }, null, 2));
