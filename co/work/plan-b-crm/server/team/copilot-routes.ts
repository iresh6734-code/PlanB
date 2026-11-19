import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TeamPrincipal } from '../../shared/team.js';
import type { TeamRepository } from './repository.js';
import type { CommercialService } from './commercial.js';
import { CopilotAuth,type CopilotConfig } from './copilot-auth.js';
import { TeamCopilotAgent } from './copilot-agent.js';
import { LocalDraftModel } from './local-draft-model.js';
export function registerCopilot(app:FastifyInstance,repo:TeamRepository,commercial:CommercialService,config:CopilotConfig|null,principal:(r:FastifyRequest)=>Promise<TeamPrincipal>,allowLocalAI=false){
  const auth=new CopilotAuth(repo,config),local=new LocalDraftModel(repo,allowLocalAI),agent=new TeamCopilotAgent(repo,auth,commercial,undefined,local),root='/api/team/spaces/:tenant/v6/copilot';
  const p=(r:FastifyRequest)=>z.object({tenant:z.string().uuid(),id:z.string().uuid().optional(),opportunity:z.string().min(1).max(100).optional()}).parse(r.params);
  const reviewed=(r:FastifyRequest)=>z.object({reviewed:z.literal(true)}).strict().parse(r.body);
  app.get(root,async r=>agent.overview(p(r).tenant,await principal(r)));
  app.post(root+'/local-settings',async r=>local.configure(p(r).tenant,await principal(r),r.body));
  app.get(root+'/preview/:opportunity',async r=>agent.preview(p(r).tenant,await principal(r),p(r).opportunity!));
  app.post(root+'/begin',async r=>{reviewed(r);return auth.begin(p(r).tenant,await principal(r));});
  app.post(root+'/complete',async r=>{const body=z.object({state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(1).max(5000)}).strict().parse(r.body);return auth.complete(p(r).tenant,await principal(r),body.state,body.code);});
  app.post(root+'/disconnect',async r=>{reviewed(r);return auth.disconnect(p(r).tenant,await principal(r));});
  app.post(root+'/runs',async r=>{const body=z.object({reviewed:z.literal(true),id:z.string().uuid(),opportunityId:z.string().min(1).max(100),revision:z.string().regex(/^[a-f0-9]{64}$/),provider:z.enum(['copilot','ollama']).optional(),engineRevision:z.string().uuid().optional()}).strict().parse(r.body);return agent.run(p(r).tenant,await principal(r),body);});
  app.post(root+'/runs/:id/apply',async r=>{reviewed(r);return agent.apply(p(r).tenant,await principal(r),p(r).id!);});
}
