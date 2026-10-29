import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoard } from './core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const board=createBoard(root),[command,...args]=process.argv.slice(2);
function value(flag){const i=args.indexOf(flag);if(i<0||!args[i+1])throw new Error('Falta '+flag);return args[i+1];}
try{
  let result;
  switch(command){
    case 'list':result=board.load();break;
    case 'add':result=await board.add(JSON.parse(fs.readFileSync(path.resolve(root,value('--file')),'utf8')));break;
    case 'claim':result=await board.claim(args[0],args[1]);break;
    case 'check-path':result=board.checkPath(args[0],args[1],args[2]);break;
    case 'submit':result=await board.submit(args[0],args[1],value('--note'));break;
    case 'accept':if(!args.includes('--reviewed'))throw new Error('Revisa la entrega y usa --reviewed.');result=await board.accept(args[0],args[1]);break;
    case 'block':result=await board.block(args[0],args[1],value('--note'));break;
    case 'revise':result=await board.revise(args[0],args[1],value('--note'));break;
    case 'release':result=await board.release(args[0],args[1]);break;
    case 'brief':process.stdout.write(board.brief(args[0]));break;
    case 'export':{
      const brief=board.brief(args[0]),folder=path.join(root,'coordination','outbox');
      // Destination is fixed; no arbitrary write path or model invocation.
      if(fs.existsSync(folder)&&fs.lstatSync(folder).isSymbolicLink())throw new Error('Salida enlazada no permitida.');fs.mkdirSync(folder,{recursive:true});
      const target=path.join(folder,args[0]+'.md');fs.writeFileSync(target,brief,{flag:'wx'});result={exported:path.relative(root,target),sentToClaude:false};break;
    }
    default:throw new Error('Comandos: list, add --file, claim ID AGENTE, check-path ID AGENTE RUTA, submit ID AGENTE --note, accept ID codex --reviewed, block ID AGENTE --note, revise ID codex --note, release ID AGENTE, brief ID, export ID.');
  }
  if(result!==undefined)process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){console.error(error.message);process.exitCode=1;}
