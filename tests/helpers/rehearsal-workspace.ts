import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
/** A private source-only fixture per test file. No live data, keys, settings, dependencies or cleanup. */
export function rehearsalWorkspace(label:'cli'|'unit'){
 const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),scratch=path.join(project,'tests/.tmp');fs.mkdirSync(scratch,{recursive:true});
 const root=fs.mkdtempSync(path.join(scratch,'rehearsal-'+label+'-'));
 function copy(relative:string){const from=path.join(project,relative),stat=fs.lstatSync(from);if(stat.isSymbolicLink())throw Error('Linked fixture source');const to=path.join(root,relative);if(stat.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.name.startsWith('.')||['node_modules','dist','build'].includes(e.name))continue;copy(relative+'/'+e.name);}}else if(stat.isFile()&&/\.(ts|mjs|cjs)$/.test(relative)){if(stat.size>2000000)throw Error('Oversize fixture source');fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}}
 copy('server');copy('shared');copy('scripts/block-external.cjs');copy('scripts/rehearse-portable-recovery.ts');
 fs.writeFileSync(path.join(root,'package.json'),'{"private":true,"type":"module"}');
 fs.mkdirSync(path.join(root,'tests/.tmp'),{recursive:true});return root;
}
