import { test, expect } from '@playwright/test';
import { DEMO_PW, collectErrors, loginDemo } from './helpers';

async function signIn(page: import('@playwright/test').Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await loginDemo(page, email);
  await expect(page).toHaveURL(new RegExp(next.split('?')[0].replace(/\//g, '\\/')));
}
async function apiToken(page: import('@playwright/test').Page, email: string) {
  return (await (await page.request.post('/api/auth/login', { data: { email, password: DEMO_PW } })).json()).token as string;
}

test('exhibition: simulated notice, booth request, organizer approval → booked', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await collectErrors(page);
  await signIn(page, 'customer@demo.ebooking.test', '/exhibitions/small-business-expo');
  await expect(page.getByText(/مخطط محاكى/).first()).toBeVisible();
  const ex = await (await page.request.get('/api/exhibitions/small-business-expo')).json();
  const booth = ex.booths.find((b: any) => b.status === 'available');
  await page.getByRole('button', { name: `عرض البوث ${booth.code}`, exact: true }).first().click();
  await expect(page.getByText('السعر عند الطلب').first()).toBeVisible(); // never a hard-coded booth price
  await page.screenshot({ path: 'docs/evidence/11-exhibition.png' });
  await page.getByRole('button', { name: 'طلب حجز هذا البوث' }).first().click();
  await page.getByLabel('اسم الشركة / المشروع').fill('E2E Crafts');
  await page.getByLabel('اسم المسؤول').fill('Sara');
  await page.getByLabel('البريد الإلكتروني').fill('sara@demo.test');
  await page.getByLabel('رقم الجوال (الكويت)').fill('55551234');
  await page.getByLabel('فئة المنتجات').fill('Handmade crafts');
  await page.getByRole('button', { name: 'إرسال الطلب للمنظّم' }).click();
  await expect.poll(async () => {
    const r = await page.request.get('/api/exhibitions/requests/mine', { headers: { authorization: `Bearer ${await apiToken(page, 'customer@demo.ebooking.test')}` } });
    return (await r.json()).filter((x: any) => x.booth_code === booth.code && x.status === 'pending').length;
  }).toBe(1);

  // organizer approves in the portal
  await page.goto('/');
  await page.getByRole('button', { name: 'خروج' }).click();
  await signIn(page, 'owner@gulfstage.demo.test', '/org');
  await page.getByRole('tab', { name: 'العارضون' }).click();
  const row = page.locator('tr, article, .card').filter({ hasText: 'E2E Crafts' }).first();
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: /قبول|موافقة|اعتماد/ }).first().click();
  await expect.poll(async () => (await (await page.request.get('/api/exhibitions/small-business-expo')).json()).booths.find((b: any) => b.code === booth.code).status).toBe('booked');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('quick event: form submit with validation; customer accepts an admin quote', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'customer@demo.ebooking.test', '/quick-event');
  await page.getByLabel('اسم الشركة / الجهة *').fill('E2E Mall Ops');
  await page.getByLabel('اسم المسؤول *').fill('Fahad');
  await page.getByLabel('البريد الإلكتروني *').fill('fahad@demo.test');
  await page.getByLabel('رقم الجوال (الكويت) *').fill('+965 9555 1234');
  await page.getByLabel('اسم المكان *').fill('Demo Mall Atrium');
  await page.getByLabel('نوع الفعالية *').fill('Pop-up market');
  await page.getByLabel('التواريخ المقترحة *').fill('12–14 Dec 2026');
  await page.getByLabel('العدد المتوقع للحضور *').fill('500');
  await page.getByRole('radio', { name: 'مجاني' }).check();
  await page.getByRole('radio', { name: /^دخول عام/ }).check();
  await page.getByRole('button', { name: 'إرسال الطلب', exact: true }).click();
  await expect(page.getByText(/QE-[A-Z0-9]{8}/).first()).toBeVisible();
  const ref = (await page.getByText(/QE-[A-Z0-9]{8}/).first().textContent())!.match(/QE-[A-Z0-9]{8}/)![0];

  // admin reviews + quotes via API
  const admin = { authorization: `Bearer ${await apiToken(page, 'admin@ebooking.demo.test')}` };
  const list = await (await page.request.get('/api/admin/quick-events', { headers: admin })).json();
  const id = list.find((x: any) => x.reference === ref).id;
  await page.request.post(`/api/admin/quick-events/${id}/status`, { headers: admin, data: { status: 'under_review' } });
  const q = await (await page.request.post(`/api/admin/quick-events/${id}/quotes`, { headers: admin, data: { items: [{ description: 'Ticketing setup (demo)', amountFils: 95000, quantity: 1 }] } })).json();
  expect(q.totalFils).toBe(95000);

  await page.reload();
  await page.getByRole('button', { name: 'قبول العرض' }).first().click();
  await page.getByRole('button', { name: 'نعم، أقبل العرض' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/admin/quick-events', { headers: admin })).json()).find((x: any) => x.reference === ref).status).toBe('quote_accepted');
  await page.screenshot({ path: 'docs/evidence/12-quick-event.png', fullPage: true });
});

test('support assistant works with AI disabled and explains a verified order', async ({ page }) => {
  await signIn(page, 'customer@demo.ebooking.test', '/support');
  const health = await (await page.request.get('/api/health')).json();
  expect(health.ai).toBe('none'); // AI provider disabled
  await page.getByRole('textbox').filter({ hasNot: page.getByLabel('رقم الحجز (اختياري)') }).first().fill('وين تذاكري؟ ما وصلتني');
  await page.getByRole('button', { name: 'إرسال', exact: true }).click();
  await expect(page.getByRole('log').or(page.locator('[aria-live]')).last()).toContainText(/حجز|حساب|EBK-/);
  await page.screenshot({ path: 'docs/evidence/13-support.png', fullPage: true });
});

test('my bookings tabs render for a signed-in customer', async ({ page }) => {
  await signIn(page, 'customer@demo.ebooking.test', '/bookings');
  await expect(page.getByRole('tab', { name: 'القادمة' })).toBeVisible();
  await page.getByRole('tab', { name: 'طلبات البوثات' }).click();
  await expect(page.getByRole('tab', { name: 'طلبات البوثات' })).toHaveAttribute('aria-selected', 'true');
});
