import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectCandidate} from '../tools/releases/candidate-integrity.mjs';

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(!args.length||args.length===1&&args[0]==='--help')console.log('Plan B · comprobar integridad de candidata\nUso: node scripts/check-release-candidate.mjs --candidate tests/.tmp/release-candidates/candidate-UUID\nSolo lectura. Compara bytes e inventario; no compila, ejecuta, aprueba, instala o comprueba el checkout vivo.');
  else if(args.length===2&&args[0]==='--candidate'){
    const result=inspectCandidate({candidate:args[1]});console.log(JSON.stringify(result,null,2));process.exitCode=result.state==='matches-manifest'?0:result.state==='different'?1:2;
  }else{console.error('Argumentos no admitidos. Usa --help.');process.exitCode=2;}
}
