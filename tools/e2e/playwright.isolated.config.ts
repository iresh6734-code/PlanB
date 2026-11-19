// Playwright contra una compilación aislada (CLAUDE-E2E-ADAPT, 18/11/2026). Igual que playwright.config.ts (mismos
// puertos, variables y servidores), pero los servidores arrancan desde tests/.tmp/e2e-build, donde tools/e2e/isolated.mjs
// deja dist/ y build/. Así nunca se compila sobre dist/ ni build/ del piloto, y los servidores no leen .env.local ni
// .ai.local.json del repositorio (su raíz es esa carpeta). Red exterior bloqueada y carpetas de datos nuevas.
import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), work = resolve(repo, 'tests/.tmp/e2e-build');
const block = resolve(repo, 'scripts/block-external.cjs');
const executablePath = process.env.PLANB_PLAYWRIGHT_EXECUTABLE ?? 'C:/Users/iresh/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const stamp = Date.now();

export default defineConfig({
  testDir: resolve(repo, 'tests/e2e'), workers: 1, timeout: 60000,
  outputDir: resolve(work, 'results'),
  reporter: [['list'], ['json', { outputFile: resolve(work, 'results.json') }]],
  use: { baseURL: 'http://127.0.0.1:4337', launchOptions: { executablePath }, viewport: { width: 1536, height: 1024 }, headless: true, actionTimeout: 12000, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node --require "' + block + '" build/server.mjs', cwd: work, url: 'http://127.0.0.1:4337/api/health', reuseExistingServer: false, timeout: 180000,
      env: { PLANB_PORT: '4337', PLANB_DATA_DIR: resolve(work, 'data-' + stamp), PLANB_TEAM_ORIGIN: 'http://127.0.0.1:4341', PLANB_TEAM_DEMO: '1' } },
    { command: 'node --require "' + block + '" build/team.mjs', cwd: work, url: 'http://127.0.0.1:4341/api/team/health', reuseExistingServer: false, timeout: 180000,
      env: { PLANB_TEAM_DEMO: '1', PLANB_TEAM_PORT: '4341', PLANB_TEAM_DATA_DIR: resolve(work, 'team-' + stamp) } },
  ],
});
