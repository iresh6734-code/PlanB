import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describeSourceStatus } from '../../shared/source-status.js';

// Independent probes: a new authorization changes the valid server-derived view
// while provider/account/action remain equal. No provider or installation is used.
const initial = describeSourceStatus({ provider: 'zendesk', label: 'Zendesk', accountId: 'test-a',
  observedAccount: null, authorization: { authorizedAt: '2026-11-09T08:00:00.000Z', scope: 'tickets:read' } }, null,
Date.parse('2026-11-09T10:00:00.000Z'));
const renewed = describeSourceStatus({ provider: 'zendesk', label: 'Zendesk', accountId: 'test-a',
  observedAccount: null, authorization: { authorizedAt: '2026-11-09T09:00:00.000Z', scope: 'tickets:read' } }, null,
Date.parse('2026-11-09T10:00:00.000Z'));
let server: http.Server, origin: string;
test.beforeAll(async () => {
  const repo = process.cwd().replaceAll('\\', '/');
  const result = await build({ stdin: { contents: `
    import { createRoot } from 'react-dom/client';
    import { useState } from 'react';
    import { SourceStatusRow } from '${repo}/src/SourceStatusRow';
    let finish;
    function Host() {
      const [view,setView] = useState(${JSON.stringify(initial)});
      window.probe = { renew: () => setView(${JSON.stringify(renewed)}), finish: () => finish() };
      return <SourceStatusRow view={view} actions={{'run-explicit-read': () => new Promise(resolve => { finish = resolve; })}}>Recibos de prueba</SourceStatusRow>;
    }
    createRoot(document.getElementById('root')).render(<Host/>);
  `, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'esm',
    jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'error' });
  const js = result.outputFiles[0]!.text;
  server = http.createServer((req, res) => {
    res.setHeader('content-type', req.url === '/entry.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/entry.js' ? js : '<!doctype html><html lang="es"><title>Independent source row</title><main id="root"></main><script type="module" src="/entry.js"></script></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

test('renewing the authorization retires the previous running action and its completion', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(origin);
  const action = page.getByTestId('status-action');
  await action.click();
  await expect(action).toBeDisabled();
  await page.evaluate(() => (window as any).probe.renew());
  await expect(action).toBeEnabled();
  await page.evaluate(() => (window as any).probe.finish());
  await expect(page.getByTestId('status-action-finished')).toHaveCount(0);
});

test('renewing the authorization closes details belonging to the previous state', async ({ page }) => {
  await page.goto(origin);
  const toggle = page.getByTestId('status-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => (window as any).probe.renew());
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Recibos de prueba', { exact: true })).toHaveCount(0);
});

test('completion from the old authorization does not appear in the renewed state', async ({ page }) => {
  await page.goto(origin);
  await page.getByTestId('status-action').click();
  await expect(page.getByTestId('status-action')).toBeDisabled();
  await page.evaluate(() => (window as any).probe.renew());
  await page.evaluate(() => (window as any).probe.finish());
  await expect(page.getByTestId('status-action')).toBeEnabled();
  await expect(page.getByTestId('status-action-finished')).toHaveCount(0);
});
