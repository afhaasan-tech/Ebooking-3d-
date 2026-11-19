import { expect, type Page } from '@playwright/test';

export const DEMO_PW = 'Demo-Pass-2026';

export async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|favicon|fonts\.g/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function firstPerformanceId(page: Page, slug = 'mubarakiya-nights'): Promise<string> {
  const r = await page.request.get(`/api/events/${slug}`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).performances[0].id;
}

export async function waitForVenue(page: Page) {
  const v = page.getByTestId('venue-3d');
  await expect(v).toBeVisible({ timeout: 60_000 }); // cold dev server may need to optimise the 3D deps first
  await expect.poll(async () => (await v.getAttribute('data-camera')) ?? '', { timeout: 20_000 }).not.toBe('');
  return v;
}

export async function cameraPos(page: Page) {
  const s = (await page.getByTestId('venue-3d').getAttribute('data-camera')) ?? '';
  const [x, y, z] = s.split(',').map(Number);
  return { x, y, z };
}

export async function loginDemo(page: Page, email: string) {
  const details = page.locator('details', { hasText: /حسابات تجريبية|Demo accounts/ }).first();
  await details.waitFor();
  // open the demo-account list only if it is collapsed (clicking an open <summary> would close it)
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await details.getByRole('button', { name: new RegExp(email.replace(/[.@]/g, '\\$&')) }).click();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
