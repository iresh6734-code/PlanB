import { parentPort,workerData } from 'node:worker_threads';
import { CopilotStudioClient,ConnectionSettings } from '@microsoft/agents-copilotstudio-client';
import { Activity } from '@microsoft/agents-activity';
void(async()=>{
  try{
    const {config,token,prompt,id}=workerData;
    const client=new CopilotStudioClient(new ConnectionSettings({environmentId:config.environmentId,schemaName:config.schemaName,enableDiagnostics:false}),token);
    const start=await client.startConversationWithResponse({emitStartConversationEvent:false,locale:'es-ES'});if(!start.conversationId)throw new Error('Sin conversación');
    let text='';for await(const activity of client.sendActivityStreaming(Activity.fromObject({type:'message',id,text:prompt,locale:'es-ES'}),start.conversationId)){
      if(activity.type==='message'&&activity.text)text+=activity.text+'\n';if(text.length>16000)throw new Error('Respuesta excesiva');
    }
    parentPort!.postMessage({text:text.trim()});
  }catch{parentPort!.postMessage({error:'No se confirmó una respuesta válida de Copilot Studio.'});}
})();
