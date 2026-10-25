import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, timeout: 60000,
  outputDir: './test-results',
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4337', channel: 'msedge', viewport: { width: 1536, height: 1024 }, headless: true, actionTimeout: 12000, trace: 'retain-on-failure' },
  webServer: { command: 'node --require ./scripts/block-external.cjs build/server.mjs', url: 'http://127.0.0.1:4337/api/health',
    env: { PLANB_PORT: '4337', PLANB_DATA_DIR: resolve('tests/.tmp/e2e-' + Date.now()) }, reuseExistingServer: false, timeout: 30000 }
});
