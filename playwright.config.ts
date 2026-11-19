import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { RELEASE_TAG } from './shared/version.js';
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE;
const evidenceDir = process.env.PLANB_EVIDENCE_DIR;
export default defineConfig({
  testDir: './tests/e2e', workers: 1, timeout: 60000,
  outputDir: evidenceDir ? resolve(evidenceDir,'traces') : './test-results',
  reporter: [['list'], ['json', { outputFile: evidenceDir ? resolve(evidenceDir, 'pruebas-navegador-'+RELEASE_TAG+'.json') : 'test-results/e2e-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4337', channel: executablePath ? undefined : 'msedge',
    launchOptions: executablePath ? { executablePath } : undefined,
    viewport: { width: 1536, height: 1024 }, headless: true, actionTimeout: 12000, trace: 'retain-on-failure' },
  webServer: [{ command: 'node --require ./scripts/block-external.cjs build/server.mjs', url: 'http://127.0.0.1:4337/api/health',
    env: { NODE_ENV: 'test', PLANB_PORT: '4337', PLANB_DATA_DIR: resolve('tests/.tmp/e2e-' + Date.now()),PLANB_TEAM_ORIGIN:'http://127.0.0.1:4341',PLANB_TEAM_DEMO:'1' }, reuseExistingServer: false, timeout: 60000 },
    {command:'node --require ./scripts/block-external.cjs build/team.mjs',url:'http://127.0.0.1:4341/api/team/health',env:{PLANB_TEAM_DEMO:'1',PLANB_TEAM_PORT:'4341',PLANB_TEAM_DATA_DIR:resolve('tests/.tmp/team-e2e-'+Date.now())},reuseExistingServer:false,timeout:60000}]
});
