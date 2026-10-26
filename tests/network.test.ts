import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
test('el arnés de independencia bloquea fetch y sockets externos antes de conectar', () => {
  const result = execFileSync(process.execPath, ['--require', resolve('scripts/block-external.cjs'), '-e',
    "let blocked=0;try{fetch('https://example.com')}catch(e){if(e.message==='EXTERNAL_FETCH_BLOCKED')blocked++}try{require('node:net').connect(443,'1.1.1.1')}catch(e){if(e.message.startsWith('EXTERNAL_NETWORK_BLOCKED'))blocked++}console.log(blocked)"], { encoding: 'utf8' });
  assert.equal(result.trim(), '2');
});
