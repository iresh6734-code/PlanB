import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from './store.js';
import { SalesAgents } from './agents.js';
import { exportSummary } from './recovery-copy.js';
import { registerActivationReview } from './activation-review.js';

export function registerV4(app:FastifyInstance,store:Store,runtime:boolean) {
  registerActivationReview(app,store,runtime);
  const agents=new SalesAgents(store,runtime);
  const id=z.object({id:z.string().uuid()}).strict();
  const approval=z.object({mode:z.literal('simulation'),contentHash:z.string().regex(/^[a-f0-9]{64}$/),reviewed:z.literal(true)}).strict();
  app.get('/api/v4/today',async()=>agents.today());
  app.get('/api/v4/agents',async()=>agents.overview());
  app.get('/api/v4/integrations',async()=>({integrations:agents.integrations()}));
  app.post('/api/v4/agent-runs',async request=>{z.object({mode:z.literal('simulation')}).strict().parse(request.body);return agents.run();});
  app.post('/api/v4/proposals/:id/approve',async request=>{const body=approval.parse(request.body);return agents.approve(id.parse(request.params).id,body.contentHash);});
  app.post('/api/v4/proposals/:id/reject',async request=>{z.object({mode:z.literal('simulation')}).strict().parse(request.body);return agents.reject(id.parse(request.params).id);});
  app.post('/api/v4/proposals/:id/execute',async request=>{const body=approval.parse(request.body);return agents.execute(id.parse(request.params).id,body.contentHash);});
  app.get('/api/v4/export-summary',async()=>exportSummary(store));
  return agents;
}
