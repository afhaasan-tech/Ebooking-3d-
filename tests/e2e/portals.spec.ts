import { test, expect, type APIRequestContext } from '@playwright/test';
import { DEMO_PW, collectErrors, loginDemo } from './helpers';

/** Book one seat through the real API and return the order (with signed ticket codes). */
async function apiBooking(request: APIRequestContext, section = 'STR') {
  const login = await request.post('/api/auth/login', { data: { email: 'customer@demo.ebooking.test', password: DEMO_PW } });
  const token = (await login.json()).token;
  const session = 'e2e' + Math.random().toString(36).slice(2).padEnd(30, 'x');
  const r = await request.get('/api/events/mubarakiya-nights');
  const perf = (await r.json()).performances[1].id;
  const map = await (await request.get(`/api/performances/${perf}/seatmap`)).json();
  const seat = map.seats.find((s: any) => s.status === 'available' && s.section === section).id;
  const hold = await (await request.post('/api/holds/seats', { headers: { 'x-session-id': session }, data: { performanceId: perf, seatIds: [seat] } })).json();
  const order = await (
    await request.post('/api/checkout', {
      headers: { 'x-session-id': session, authorization: `Bearer ${token}` },
      data: { holdId: hold.id, contact: { name: 'E2E Customer', email: 'customer@demo.ebooking.test', mobile: '99887766' }, method: 'knet', idempotencyKey: 'e2e-' + Math.random().toString(36).slice(2).padEnd(24, 'y') },
    })
  ).json();
  expect(order.status).toBe('confirmed');
  return order;
}

async function signIn(page: import('@playwright/test').Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await loginDemo(page, email);
  await expect(page).toHaveURL(new RegExp(next.replace(/\//g, '\\/')));
}

test.describe('organizer portal (real API)', () => {
  test('owner: dashboard, bookings and check-in of a real signed ticket', async ({ page }) => {
    const errors = await collectErrors(page);
    const order = await apiBooking(page.request);
    const code = order.tickets[0].qr as string;

    await signIn(page, 'owner@gulfstage.demo.test', '/org');
    await expect(page.getByRole('tablist', { name: /./ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'نظرة عامة' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/بيانات تجريبية|Demo data/).first()).toBeVisible();
    await expect(page.locator('.stat').first()).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/08-organizer-dashboard.png', fullPage: true });

    await page.getByRole('tab', { name: 'الحجوزات' }).click();
    await expect(page.getByText(order.reference)).toBeVisible();

    await page.getByRole('tab', { name: 'تسجيل الحضور' }).click();
    await page.getByLabel('رمز التذكرة').fill(code);
    await page.getByRole('button', { name: 'تحقق', exact: true }).click();
    await expect(page.getByText('تم تسجيل الحضور — اسمح بالدخول').first()).toBeVisible();
    await page.getByLabel('رمز التذكرة').fill(code);
    await page.getByRole('button', { name: 'تحقق', exact: true }).click();
    await expect(page.getByText('التذكرة مستخدمة مسبقاً — لا تسمح بالدخول').first()).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/09-checkin.png', fullPage: true });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('staff: only events and check-in; financial tabs are not offered', async ({ page }) => {
    await signIn(page, 'staff@gulfstage.demo.test', '/org');
    await expect(page.getByRole('tab', { name: 'تسجيل الحضور' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'نظرة عامة' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'الحجوزات' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'الأسعار' })).toHaveCount(0);
    await page.goto('/org/overview');
    await expect(page.getByRole('tab', { name: 'نظرة عامة' })).toHaveCount(0);
  });

  test('another organizer never sees Gulf Stage bookings', async ({ page }) => {
    const order = await apiBooking(page.request, 'STL');
    await signIn(page, 'owner@desertlights.demo.test', '/org');
    await page.getByRole('tab', { name: 'الحجوزات' }).click();
    await expect(page.locator('main')).not.toContainText(order.reference);
    await expect(page.locator('main')).not.toContainText('Gulf Stage');
  });
});

test.describe('platform admin (real API)', () => {
  test('quick event: review → custom quote sent with an exact fils total', async ({ page }) => {
    const qe = await (
      await page.request.post('/api/quick-events', {
        data: { companyName: 'E2E Pop-up Co', contactName: 'Noura', email: 'noura@demo.test', mobile: '65551234', venueName: 'Demo Mall Atrium', eventType: 'Pop-up market', proposedDates: '2026-12-18 → 2026-12-19', expectedAttendance: 600, admission: 'free', seatingMode: 'general_admission', services: ['ticketing'] },
      })
    ).json();
    expect(qe.reference).toMatch(/^QE-/);

    await signIn(page, 'admin@ebooking.demo.test', '/admin');
    await page.getByRole('tab', { name: 'طلبات Quick Event' }).click();
    const card = page.locator('article, .card').filter({ hasText: qe.reference }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'بدء المراجعة' }).click();
    await card.getByRole('button', { name: 'إنشاء عرض سعر' }).click();
    await card.getByLabel('الوصف').first().fill('Ticketing setup (demo figure)');
    await card.getByLabel('المبلغ (د.ك)').first().fill('120.500');
    await card.getByLabel('الكمية').first().fill('1');
    page.once('dialog', (d) => void d.accept()); // the UI asks for confirmation before sending a quote
    await card.getByRole('button', { name: 'إرسال العرض للعميل' }).click();
    await expect(page.getByText(/تم إرسال عرض سعر بقيمة/)).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/10-admin-quote.png', fullPage: true });

    // server state: quoted with an exact fils total
    const login = await page.request.post('/api/auth/login', { data: { email: 'admin@ebooking.demo.test', password: DEMO_PW } });
    const list = await (await page.request.get('/api/admin/quick-events', { headers: { authorization: `Bearer ${(await login.json()).token}` } })).json();
    const row = list.find((x: any) => x.reference === qe.reference);
    expect(row.status).toBe('quoted');
    expect(row.quotes[0].total_fils).toBe(120500);
  });

  test('non-admins are refused', async ({ page }) => {
    await signIn(page, 'owner@gulfstage.demo.test', '/admin');
    await expect(page.getByText('غير مصرّح')).toBeVisible();
  });
});
