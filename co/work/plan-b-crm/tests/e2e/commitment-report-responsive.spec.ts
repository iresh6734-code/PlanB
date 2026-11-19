import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import { createCommitmentReport } from '../../shared/commitment-report.js';
import type { CommitmentDetail } from '../../shared/commitments.js';

function fixture(): CommitmentDetail {
  const ref = (kind: 'sale' | 'delivery' | 'support') => ({ provider: 'demo', accountId: 'cuenta-ficticia-' + 'a'.repeat(80), remoteId: kind + '-42', kind });
  return {
    format: 'planb-commitments-detail-v1', mode: 'fiction', contextRevision: 'c'.repeat(64),
    item: { id: 'pedido-ficticio-42', title: 'Instalación pendiente <script>window.reportExecuted=true</script>', dueAt: '2026-11-12T12:00:00Z', revision: 'a'.repeat(64), status: 'at-risk', cause: 'source-blocked', affectedRole: 'delivery', action: null, closure: null },
    evidence: [
      { role: 'sale', state: 'observed', linked: { reference: ref('sale'), basis: 'explicit' }, observation: { reference: ref('sale'), observedAt: '2026-11-09T09:00:00Z', coverage: 'complete', condition: 'clear', label: 'Pedido confirmado' }, candidates: [] },
      { role: 'delivery', state: 'partial', linked: { reference: ref('delivery'), basis: 'confirmed' }, observation: { reference: ref('delivery'), observedAt: '2026-11-09T09:00:00Z', coverage: 'partial', condition: 'blocked', label: 'Falta material <img src="https://invalid.example/report"> & revisar' }, candidates: [] },
      { role: 'support', state: 'ambiguous', linked: null, observation: null, candidates: [ref('support')] },
    ], events: [], canCloseObserved: false,
  };
}

for (const width of [320, 390, 1440]) {
  test(`informe autónomo a ${width}px: evidencia legible, asociada a su rol y sin red`, async ({ page }, info) => {
    const detail = fixture(), { html, json } = createCommitmentReport(detail);
    const file = info.outputPath('informe.html');
    fs.mkdirSync(info.outputDir, { recursive: true }); fs.writeFileSync(file, html);
    fs.writeFileSync(info.outputPath('informe.json'), json);
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pathToFileURL(file).href);
    await expect(page).toHaveTitle('Película del incidente: ' + detail.item.title);
    await expect(page.getByRole('heading', { name: 'Evidencia por rol', exact: true })).toBeVisible();
    await expect(page.getByText('Datos ficticios de demostración.', { exact: true })).toBeVisible();
    const table = page.getByRole('region', { name: 'Evidencia por rol', exact: true }).getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveCount(5);
    await expect(table.getByRole('rowheader')).toHaveCount(3);
    const delivery = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Entrega', exact: true }) });
    await expect(delivery.getByRole('cell')).toHaveCount(4);
    const cells = delivery.getByRole('cell');
    await expect(cells.nth(0)).toContainText('Parcial');
    await expect(cells.nth(1)).toContainText('Vínculo confirmado');
    await expect(cells.nth(2)).toContainText('cobertura parcial');
    await expect(cells.nth(3)).toContainText('Ninguno');
    const label = cells.nth(2).locator('.report-cell-label');
    const rect = await cells.nth(2).boundingBox(); expect(rect).not.toBeNull();
    if (width < 672) {
      expect(rect!.width).toBeGreaterThanOrEqual(width - 36);
      await expect(label).toBeVisible(); await expect(label).toHaveText('Observación y cobertura');
      const state = await cells.nth(0).boundingBox();
      expect(rect!.y).toBeGreaterThan(state!.y + state!.height);
    } else {
      await expect(label).toBeHidden();
      expect(rect!.width).toBeLessThan(width / 3);
      const state = await cells.nth(0).boundingBox(); expect(rect!.y).toBeCloseTo(state!.y, 0);
    }
    await expect(table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Soporte', exact: true }) })).toContainText('Ambigua: solo candidatos sin confirmar');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('heading', { name: 'Cronología', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText('La cercanía temporal no implica causalidad.')).toBeVisible();
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`informe-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => (window as unknown as { reportExecuted?: boolean }).reportExecuted)).toBeUndefined();
    expect(await page.locator('script,img,iframe,object,embed,link').count()).toBe(0);
    expect(errors).toEqual([]); expect(requests).toEqual([]);
    expect(JSON.parse(json).detail).toEqual(detail);
    await page.emulateMedia({ media: 'print' });
    await expect(table.getByRole('columnheader', { name: 'Observación y cobertura' })).toBeVisible();
    expect(await table.evaluate(el => getComputedStyle(el).display)).toBe('table');
    fs.writeFileSync(info.outputPath('observed.json'), JSON.stringify({ width, cellWidth: rect!.width, errors, requests, url: page.url(), jsonDetailUnchanged: true, printTable: true }, null, 2));
  });
}
