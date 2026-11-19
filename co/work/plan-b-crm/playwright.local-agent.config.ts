import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Team-only test server: no local vault, Windows DPAPI, existing installation or credentials.
const evidence=resolve(process.env.PLANB_EVIDENCE_DIR||'test-results/local-agent');
export default defineConfig({
  testDir:'./tests/e2e',testMatch:['local-agent.spec.ts','customers.spec.ts','files.spec.ts'],workers:1,timeout:60000,
  outputDir:resolve(evidence,'traces'),reporter:[['list'],['json',{outputFile:resolve(evidence,'browser-results.json')}]],
  use:{baseURL:'http://127.0.0.1:4341',launchOptions:{executablePath:process.env.PLANB_PLAYWRIGHT_EXECUTABLE},headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure'},
  webServer:{command:'node --require ./scripts/block-external.cjs build/team.mjs',url:'http://127.0.0.1:4341/api/team/health',env:{NODE_ENV:'test',PLANB_TEAM_LOCAL_PILOT:'0',PLANB_TEAM_ROLE:'',PLANB_TEAM_ENCRYPTION_KEY:'',DATABASE_URL:'',PLANB_TEAM_DEMO:'1',PLANB_TEAM_PORT:'4341',PLANB_TEAM_DATA_DIR:resolve('tests/.tmp/local-agent-ui-'+Date.now())},reuseExistingServer:false,timeout:60000}
});
