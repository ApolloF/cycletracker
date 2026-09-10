import { test, expect } from '@playwright/test';

test('offline queue preserves revision order through reload and stops at conflicts', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/api.ts'; const { enqueue } = await import(path);
    // Reverse lexical IDs reproduce the original queue-order bug.
    for (const [operationId, expectedVersion] of [['z-create', 0], ['a-edit', 1], ['b-undo', 2]] as const)
      await enqueue('alice', { id: 'record', operationId, expectedVersion, kind: 'health', data: { title: `Revision ${expectedVersion + 1}` } });
  });
  await page.reload();
  const sent: number[] = [];
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'alice' } } }));
  await page.route('**/api/v1/sync', async route => {
    const op = route.request().postDataJSON().operations[0]; sent.push(op.expectedVersion);
    await route.fulfill({ json: { results: [{ ok: op.expectedVersion === 0, error: 'Record changed on another device' }] } });
  });
  const result = await page.evaluate(async () => {
    const path = '/src/api.ts'; const { synchronize, pendingChanges } = await import(path);
    let error = ''; try { await synchronize('alice'); } catch (e: any) { error = e.message; }
    return { error, queue: await pendingChanges('alice') };
  });
  expect(sent).toEqual([0, 1]);
  expect(result.error).toContain('Record changed');
  expect(result.queue.map((row: any) => row.operation.expectedVersion)).toEqual([1, 2]);
  expect(result.queue[0].operation.data.title).toBe('Revision 2');
  const discarded = await page.evaluate(async () => {
    const path = '/src/api.ts'; const { enqueue, discardRecordDraft, pendingChanges } = await import(path);
    await enqueue('alice', { id: 'unrelated', operationId: 'unrelated-op', expectedVersion: 0, kind: 'health', data: {} });
    let blocked = false; try { await discardRecordDraft('bob', 'a-edit'); } catch { blocked = true; }
    await discardRecordDraft('alice', 'a-edit');
    return { blocked, queue: await pendingChanges('alice') };
  });
  expect(discarded.blocked).toBe(true);
  expect(discarded.queue.map((row: any) => row.operation.id)).toEqual(['unrelated']);
});

test('sync drains edits added in flight and retains another account queue', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/');
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'alice' } } }));
  const sent: number[] = [];
  await page.route('**/api/v1/sync', async route => {
    const op = route.request().postDataJSON().operations[0]; sent.push(op.expectedVersion);
    if (op.expectedVersion === 0) await page.evaluate(async () => {
      const path = '/src/api.ts'; const { enqueue } = await import(path);
      await enqueue('alice', { id: 'record', operationId: 'later', expectedVersion: 1, kind: 'health', data: {} });
    });
    await route.fulfill({ json: { results: [{ ok: true }] } });
  });
  const remaining = await page.evaluate(async () => {
    const path = '/src/api.ts'; const { enqueue, synchronize, pendingChanges } = await import(path);
    await enqueue('alice', { id: 'record', operationId: 'first', expectedVersion: 0, kind: 'health', data: {} });
    await enqueue('bob', { id: 'other', operationId: 'foreign', expectedVersion: 0, kind: 'health', data: {} });
    await Promise.all([synchronize('alice'), synchronize('alice')]);
    let error = ''; try { await synchronize('bob'); } catch (e: any) { error = e.message; }
    return { alice: await pendingChanges('alice'), bob: await pendingChanges('bob'), error };
  });
  expect(sent).toEqual([0, 1]);
  expect(remaining.alice).toEqual([]);
  expect(remaining.bob).toHaveLength(1);
  expect(remaining.error).toContain('account');
});
