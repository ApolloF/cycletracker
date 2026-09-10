import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
test('verified account, custom routine, logging, scenario comparison and responsive layout', async ({ page, context }, info) => {
  const email = `synthetic-${Date.now()}-${info.project.name}@example.test`;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Display name').fill('Test Reader');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: false }).fill('synthetic-testing-passphrase-2026');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Check your email to verify your account, then sign in.')).toBeVisible();
  let verification = '';
  await expect.poll(async () => {
    for (const filename of await readdir('.local/mail')) { const message = JSON.parse(await readFile(`.local/mail/${filename}`, 'utf8')); if (message.to === email) verification = message.url; }
    return !!verification;
  }).toBe(true);
  await page.goto(verification);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByLabel('Your time zone').fill('Europe/Amsterdam');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'New routine' }).click();
  await page.getByLabel('Routine name').fill('Synthetic routine');
  await page.getByRole('button', { name: 'Create routine', exact: true }).click();
  await page.getByRole('button', { name: 'Add an item', exact: true }).click();
  await page.getByLabel('Item name').fill('Synthetic supplement');
  await page.getByLabel('Amount per administration (mg)').fill('10');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic supplement' })).toBeVisible();
  await page.getByRole('button', { name: 'Activate routine' }).click();
  await expect(page.getByText('Active routine', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Log an entry', exact: true }).click();
  await page.getByRole('button', { name: 'Save administration' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('10 mg · taken')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Plotter', exact: true }).click();
  await page.getByRole('button', { name: 'Add scenario', exact: true }).click();
  await page.getByLabel('Scenario name').fill('Synthetic comparison A');
  await page.getByLabel('Amount per administration (mg)').fill('10');
  await page.getByLabel('Fixed normalization reference dose (mg)').fill('10');
  await page.getByRole('button', { name: 'Plot scenario', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Within the selected interval' })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate Synthetic comparison A', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Synthetic comparison A copy' })).toBeVisible();
  await expect(page.getByText('Scenario edits do not change your routine.')).toBeVisible();
  await page.screenshot({ path: `.local/plotter-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  if (info.project.name.startsWith('production-')) {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat();
    });
    expect(cached.some(path => path.startsWith('/api/'))).toBe(false);
    expect(cached.some(path => path.includes('simulation.worker'))).toBe(true);
  }
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Log an entry', exact: true }).click();
  await page.getByLabel('Actual amount (mg)').fill('15');
  await page.getByRole('button', { name: 'Save administration' }).click();
  await page.getByRole('button', { name: 'Review 1 pending changes', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Synthetic supplement' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export pending changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('15 mg · taken')).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  if (info.project.name.startsWith('production-')) {
    if (info.project.name.includes('chromium')) {
      await page.close();
      page = await context.newPage();
      await page.goto('/');
    } else {
      // Reopening a new offline tab is tracked separately for Firefox/WebKit.
      test.fail(process.platform === 'win32' && info.project.name === 'production-webkit', 'Windows WebKit offline reload currently reports an internal error; offline release gate remains open.');
      await page.reload();
    }
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review 1 pending changes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByText('15 mg · taken')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Plotter', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add scenario', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
  }
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(page.getByRole('button', { name: 'Review 1 pending changes', exact: true })).toHaveCount(0);
  await expect(page.getByText('15 mg · taken')).toBeVisible();
  const saved = await page.evaluate(async () => (await (await fetch('/api/v1/records?limit=100')).json()).items);
  expect(saved.filter((record: any) => record.kind === 'administration' && record.data.amount.value === 15)).toHaveLength(1);
  await page.locator('.profile:visible, .mobile-settings:visible').first().click();
  const legacy = { user: 'synthetic-import-profile', logs: [{ id: 1, type: 'note', created_at: '2026-01-01T12:00:00Z', data: { notes: 'Synthetic imported note' } }] };
  await page.getByLabel('Cycle Dashboard or CycleTracker JSON export').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.getByText('1 mapped · 0 duplicates · 0 unresolved')).toBeVisible();
  await page.getByRole('button', { name: 'Import reviewed records', exact: true }).click();
  await expect(page.getByText('Imported 1 records; 0 duplicates skipped')).toBeVisible();
  await page.getByLabel('Cycle Dashboard or CycleTracker JSON export').setInputFiles({ name: 'synthetic-again.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.getByText('1 mapped · 1 duplicates · 0 unresolved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import reviewed records', exact: true })).toBeDisabled();
  await page.getByRole('dialog', { name: 'Import preview', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  const phases = { format: 'cycletracker-1', sourceWorkspace: 'synthetic-phase-source', records: [], workspace: { protocol: { phases: [{ id: 'source-phase', name: 'Imported draft', entries: [] }] } } };
  await page.getByLabel('Cycle Dashboard or CycleTracker JSON export').setInputFiles({ name: 'phases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(phases)) });
  await page.getByLabel('Add 1 phases as drafts').check();
  await page.getByRole('button', { name: 'Import reviewed records', exact: true }).click();
  await expect(page.getByText('Imported 0 records; 0 duplicates skipped; 1 draft phases added')).toBeVisible();
  await page.getByLabel('Cycle Dashboard or CycleTracker JSON export').setInputFiles({ name: 'phases-again.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(phases)) });
  await expect(page.getByText('1 phases already imported', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import reviewed records', exact: true })).toBeDisabled();
  const workspace = await page.evaluate(async () => (await (await fetch('/api/v1/workspace')).json()));
  expect(workspace.protocol.phases).toHaveLength(2);
  expect(workspace.protocol.phases.find((phase: any) => phase.id === workspace.protocol.activePhaseId).name).toBe('Synthetic routine');
});
