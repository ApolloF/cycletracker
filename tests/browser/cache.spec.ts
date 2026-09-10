import { test, expect } from '@playwright/test';

test('a changed account cannot read or populate another account cache', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: null }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/src/api.ts'; const { readCached, local } = await import(path);
    const switchUser = (id: string) => localStorage.setItem('cycletracker-active-user', JSON.stringify({ id, name: id, email: `${id}@example.test` }));
    switchUser('alice');
    let foreignBlocked = false;
    try { await readCached('bob', 'workspace', async () => ({ private: 'bob' })); } catch { foreignBlocked = true; }
    let lateResponseBlocked = false;
    try { await readCached('alice', 'workspace', async () => { switchUser('bob'); return { private: 'alice' }; }); } catch { lateResponseBlocked = true; }
    return { foreignBlocked, lateResponseBlocked, caches: await local.cache.toArray() };
  });
  expect(result).toEqual({ foreignBlocked: true, lateResponseBlocked: true, caches: [] });
});
