import { test, expect } from '@playwright/test';
import { collectErrors, expectNoHorizontalOverflow, firstPerformanceId, waitForVenue } from './helpers';

// Runs in the "mobile" project (Pixel 7, touch) — also exercised at tablet width below.
test('mobile: home, menu, booking page and 2D/3D toggle fit the screen', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'docs/evidence/m01-home-mobile.png', fullPage: true });

  // hamburger menu
  const menu = page.getByRole('button', { name: 'القائمة', exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'القائمة الرئيسية' }).getByRole('link', { name: 'الفعاليات' })).toBeVisible();
  await page.keyboard.press('Escape');

  const perf = await firstPerformanceId(page);
  await page.goto(`/book/${perf}`);
  await waitForVenue(page);
  await expectNoHorizontalOverflow(page);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/evidence/m02-venue-mobile.png' });

  // touch: tap a section label in the 3D overlay
  await page.locator('.venue-label', { hasText: 'عادي وسط' }).tap();
  await expect(page.getByTestId('venue-3d')).toHaveAttribute('data-mode', 'section');

  await page.getByRole('button', { name: 'عرض ثنائي الأبعاد' }).first().tap();
  await expect(page.getByRole('group', { name: 'اختر القسم' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'docs/evidence/m03-2d-mobile.png', fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('tablet: event discovery and checkout layout', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'اكتشف الفعاليات' })).toBeVisible();
  await page.getByRole('button', { name: /كوميديا/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'docs/evidence/t01-events-tablet.png', fullPage: true });
});

test('keyboard: skip link and focusable controls', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'تخطَّ إلى المحتوى' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('small phone (375 px): header and key pages have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  for (const path of ['/', '/events', '/quick-event', '/support', '/exhibitions/small-business-expo', '/does-not-exist']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
  }
  await page.goto('/');
  await page.screenshot({ path: 'docs/evidence/m04-home-375.png' });
});
