import { test, expect, type Page } from '@playwright/test';

const KEY = 'mass-weight-tracker-v1';

function seed(records: Array<{ id: string; date: string; weightGrams: number }>, unit = 'kg') {
  return `localStorage.setItem('${KEY}', JSON.stringify({schemaVersion:1,preferences:{unit:'${unit}',onboardingComplete:true},records:${JSON.stringify(records)}}))`;
}

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'no horizontal overflow').toBeLessThanOrEqual(1);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}

test.describe('MVP journeys', () => {
  test('onboarding blank start → empty overview (390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /start tracking/i })).toBeVisible();
    await shot(page, 'onboarding');
    await page.getByRole('button', { name: /^start tracking$/i }).click();
    await expect(page.getByText(/no measurements yet/i)).toBeVisible();
    await noOverflow(page);
    await shot(page, 'overview-empty');
    // return visit skips onboarding
    await page.reload();
    await expect(page.getByRole('heading', { name: /your progress/i })).toBeVisible();
  });

  test('log weight → latest + history delta; duplicate date replaces', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'mass-weight-tracker-v1',
        JSON.stringify({ schemaVersion: 1, preferences: { unit: 'kg', onboardingComplete: true }, records: [] }),
      ),
    );
    await page.reload();
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // add first entry
    await page.getByRole('button', { name: /log weight/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/weight \(kg\)/i).fill('70.5');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/last recorded on/i)).toBeVisible();
    await noOverflow(page);
    // same date → confirm replace
    await page.getByRole('button', { name: /log weight/i }).click();
    await page.getByLabel(/weight \(kg\)/i).fill('71');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
    await page.getByRole('button', { name: /^replace$/i }).click();
    await expect(page.getByText(/71\.0 kg/).first()).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mass-weight-tracker-v1')!));
    expect(stored.records.filter((r: { date: string }) => r.date === iso(today))).toHaveLength(1);
    expect(stored.records[0].weightGrams).toBe(71000);
    await shot(page, 'overview-1-entry');
  });

  test('history groups + deltas; row opens edit sheet; settings unit/CSV/delete', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'SEED',
        JSON.stringify([
          { id: 'a', date: '2026-09-20', weightGrams: 70000 },
          { id: 'b', date: '2026-10-20', weightGrams: 72000 },
        ]),
      ),
    );
    await page.evaluate(() => {
      const recs = JSON.parse(localStorage.getItem('SEED')!);
      localStorage.setItem(
        'mass-weight-tracker-v1',
        JSON.stringify({ schemaVersion: 1, preferences: { unit: 'kg', onboardingComplete: true }, records: recs }),
      );
    });
    await page.reload();
    // history
    await page.getByRole('button', { name: /^history$/i }).click();
    await expect(page.getByText(/october 2026/i)).toBeVisible();
    await expect(page.getByText(/september 2026/i)).toBeVisible();
    await expect(page.getByText(/first entry/i)).toBeVisible();
    await expect(page.getByText(/\+2\.0 kg/).first()).toBeVisible();
    await noOverflow(page);
    await shot(page, 'history');
    // edit via row
    await page.getByRole('button', { name: /edit entry 2026-10-20/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape'); // dirty? weight prefilled but unchanged → date unchanged → closes? just ensure no crash
    // settings: unit toggle preserves grams
    await page.getByRole('button', { name: /open settings/i }).click();
    await page.getByRole('group', { name: /units/i }).getByRole('button', { name: /^lb$/i }).click();
    const grams = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mass-weight-tracker-v1')!).records[0].weightGrams,
    );
    expect(grams).toBe(70000);
    // CSV export
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /export csv/i }).click();
    const path = await (await dl).path();
    expect(path).toBeTruthy();
    // delete all keeps prefs
    await page.getByRole('button', { name: /delete all entries/i }).click();
    await page.getByRole('button', { name: /delete everything/i }).click();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mass-weight-tracker-v1')!));
    expect(after.records).toEqual([]);
    expect(after.preferences.unit).toBe('lb');
    await noOverflow(page);
    await shot(page, 'settings');
  });

  test('chart renders with 2+ points; periods toggle; keyboard point detail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const days: Array<{ id: string; date: string; weightGrams: number }> = [];
    const d = new Date();
    for (let i = 9; i >= 0; i--) {
      const t = new Date(d);
      t.setDate(d.getDate() - i * 3);
      days.push({
        id: `p${i}`,
        date: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
        weightGrams: 70000 + (9 - i) * 200,
      });
    }
    await page.evaluate((recs) => {
      localStorage.setItem(
        'mass-weight-tracker-v1',
        JSON.stringify({ schemaVersion: 1, preferences: { unit: 'kg', onboardingComplete: true }, records: recs }),
      );
    }, days);
    await page.reload();
    await expect(page.getByRole('img', { name: /weight trend/i })).toBeVisible();
    await page.getByRole('button', { name: /^7d$/i }).click();
    await expect(page.getByRole('button', { name: /^7d$/i })).toHaveAttribute('aria-pressed', 'true');
    // keyboard-focus a chart point → live detail
    const points = page.locator('.chart-point[role="button"]');
    expect(await points.count()).toBeGreaterThan(0);
    await points.first().focus();
    await expect(page.locator('.chart-wrap div[aria-live]')).toContainText(/^\d{4}-\d{2}-\d{2}:/);
    await noOverflow(page);
    await shot(page, 'overview-chart');
  });

  test('offline reload serves the app shell from the service worker', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'mass-weight-tracker-v1',
        JSON.stringify({
          schemaVersion: 1,
          preferences: { unit: 'kg', onboardingComplete: true },
          records: [{ id: 'a', date: '2026-10-20', weightGrams: 70000 }],
        }),
      ),
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: /your progress/i })).toBeVisible();
    // let the service worker install and cache the shell
    await page.waitForFunction(
      () => navigator.serviceWorker?.controller?.state === 'activated',
      { timeout: 15000 },
    );
    await context.setOffline(true);
    await page.reload();
    // generous timeout: under parallel workers the offline navigation can be slow
    await expect(page.getByRole('heading', { name: /your progress/i })).toBeVisible({
      timeout: 15000,
    });
    await noOverflow(page);
    await context.setOffline(false);
  });

  for (const width of [320, 375, 430, 768]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.evaluate(() =>
        localStorage.setItem(
          'mass-weight-tracker-v1',
          JSON.stringify({
            schemaVersion: 1,
            preferences: { unit: 'kg', onboardingComplete: true },
            records: [{ id: 'a', date: '2026-10-20', weightGrams: 70000 }],
          }),
        ),
      );
      await page.reload();
      await noOverflow(page);
      // sheet open also fits
      await page.getByRole('button', { name: /log weight/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await noOverflow(page);
      const clipped = await page.evaluate(() => {
        const el = document.querySelector('.sheet') as HTMLElement;
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= window.innerWidth + 1;
      });
      expect(clipped, 'sheet fully visible').toBe(true);
    });
  }
});

export { seed };
