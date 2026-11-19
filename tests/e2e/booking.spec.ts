import { test, expect } from '@playwright/test';
import { cameraPos, collectErrors, firstPerformanceId, waitForVenue, loginDemo, expectNoHorizontalOverflow } from './helpers';

test.describe('customer journey (desktop)', () => {
  test('home → event → 3D venue → seat view → smart pick → compare → basket → checkout → tickets', async ({ page }) => {
    test.setTimeout(300_000); // software WebGL (SwiftShader) in CI is slow
    const errors = await collectErrors(page);

    // 1. homepage (Arabic, RTL)
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('شوف إطلالتك');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'docs/evidence/01-home-desktop.png' });

    // 2. select a fictional event
    await page.getByRole('link', { name: /ليالي المباركية/ }).first().click();
    await expect(page.getByRole('heading', { name: /ليالي المباركية/ })).toBeVisible();

    // 3. select a showtime
    await page.getByRole('link', { name: 'اختر كرسيك ثلاثي الأبعاد' }).first().click();

    // 4. explore the venue (overview → section)
    await waitForVenue(page);
    await expect(page.getByTestId('venue-3d')).toHaveAttribute('data-mode', 'overview');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/evidence/02-venue-overview.png' });
    await page.locator('.side-panel').getByRole('button', { name: /كبار الشخصيات/ }).click();
    await expect(page.getByTestId('venue-3d')).toHaveAttribute('data-mode', 'section');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/evidence/03-section-vip.png' });

    // 5+6. choose an available seat via the accessible 2D list, then back to 3D
    await page.getByRole('button', { name: 'عرض ثنائي الأبعاد' }).first().click();
    await page.getByRole('group', { name: 'اختر القسم' }).getByRole('button', { name: /^كبار الشخصيات/ }).click();
    const seatBtn = page.locator('button[aria-label^="كبار الشخصيات, صف C,"][aria-label*="متاح"]').first();
    const seatLabel = (await seatBtn.getAttribute('aria-label'))!;
    await seatBtn.click();
    await expect(page.locator('.side-panel h3')).toHaveText('كبار الشخصيات');
    await page.getByRole('button', { name: 'عرض ثلاثي الأبعاد' }).click();
    await waitForVenue(page);

    // 7. preview the actual position: camera must reach the seat's seated eye position
    const seatId = await page.locator('.side-panel .tiny.faint.num').first().textContent();
    const seatmap = await (await page.request.get(page.url().replace('/book/', '/api/performances/').replace(/\?.*$/, '') + '/seatmap')).json();
    const seat = seatmap.seats.find((s: any) => s.id === seatId);
    expect(seat, `seat ${seatId} from ${seatLabel}`).toBeTruthy();
    await page.getByRole('button', { name: /شوف الإطلالة من الكرسي/ }).click();
    await expect(page.getByTestId('venue-3d')).toHaveAttribute('data-mode', 'seat');
    await expect.poll(async () => {
      const c = await cameraPos(page);
      return Math.hypot(c.x - seat.x, c.y - (seat.y + seat.eye_height), c.z - seat.z);
    }, { timeout: 10_000 }).toBeLessThan(0.15);
    await page.screenshot({ path: 'docs/evidence/04-seat-perspective.png' });

    // adjacent seat via keyboard changes the perspective
    const before = await cameraPos(page);
    await page.locator('body').press('ArrowRight');
    await expect.poll(async () => Math.abs((await cameraPos(page)).x - before.x), { timeout: 10_000 }).toBeGreaterThan(0.3);

    // 9. smart recommendation (Kuwaiti Arabic)
    await page.getByRole('tab', { name: /اقتراح ذكي/ }).click();
    await page.getByLabel('اكتب طلبك بالعربي أو الإنجليزي').fill('أبي ٢ كراسي يم بعض وبالنص بميزانية ٧٠ دينار');
    await page.getByRole('button', { name: 'ابحث', exact: true }).click();
    const firstRec = page.locator('.side-panel .card.card-tight').first();
    await expect(firstRec).toContainText('/100');
    await expect(page.getByText('فهمنا:')).toContainText('2');

    // 8. compare seats (two synchronized previews in one canvas)
    await firstRec.getByRole('button', { name: 'قارن' }).click();
    await expect(page.locator('.side-panel table')).toContainText('تقييم الرؤية');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'docs/evidence/05-compare.png' });

    // 10. add recommended seats to basket
    await page.getByRole('tab', { name: /اقتراح ذكي/ }).click();
    await page.locator('.side-panel .card.card-tight').first().getByRole('button', { name: 'أضفها للسلة' }).click();
    await expect(page.locator('[role="status"]').first()).toContainText('محجوزة لك');

    // 11. authoritative prices & fees in basket drawer
    await page.getByRole('button', { name: /السلة \(\d\)/ }).click();
    const drawer = page.getByRole('dialog', { name: 'السلة' });
    await expect(drawer).toContainText('رسوم الخدمة');
    await expect(drawer).toContainText('د.ك');
    await drawer.getByRole('button', { name: 'متابعة للدفع' }).click();
    await expect(page).toHaveURL(/checkout/);

    // 12. simulated checkout (sign in inline with the demo customer)
    await expect(page.getByText('دفع تجريبي — لن تتم معالجة أي دفع حقيقي.')).toBeVisible();
    await loginDemo(page, 'customer@demo.ebooking.test');
    await page.getByLabel('الاسم الكامل').fill('عميل تجريبي');
    await page.getByLabel('رقم الموبايل (الكويت)').fill('12345');
    await page.getByRole('button', { name: /ادفع \(تجريبي\)/ }).click();
    await expect(page.getByText('رقم كويتي من ٨ أرقام')).toBeVisible(); // client validation
    await page.getByLabel('رقم الموبايل (الكويت)').fill('+965 9988 7766');
    await page.getByText('كي نت').click();
    await page.screenshot({ path: 'docs/evidence/06-checkout.png' });
    await page.getByRole('button', { name: /ادفع \(تجريبي\)/ }).click();

    // 13. demo booking reference
    await expect(page).toHaveURL(/\/orders\/EBK-/);
    await expect(page.getByText('تم تأكيد حجزك!')).toBeVisible();
    await expect(page.getByText('تذكرة تجريبية — غير صالحة للدخول').first()).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/07-confirmation.png', fullPage: true });

    // 14. access the tickets again
    await page.getByRole('link', { name: 'تذاكري' }).first().click();
    await expect(page.getByRole('heading', { name: 'تذاكري' })).toBeVisible();
    await expect(page.locator('article.ticket-shape')).toHaveCount(2);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('language switch to English flips direction to LTR', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See your view');
    await page.getByRole('button', { name: 'التبديل للعربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('sold seats cannot be selected', async ({ page }) => {
    const perf = await firstPerformanceId(page);
    await page.goto(`/book/${perf}`);
    await page.getByRole('button', { name: 'عرض ثنائي الأبعاد' }).first().click();
    const sold = page.locator('button[aria-label*=", مباع,"]').first();
    await expect(sold).toHaveAttribute('aria-disabled', 'true');
    await sold.click({ force: true });
    await expect(page.locator('.side-panel').getByRole('button', { name: 'أضف للسلة' })).toHaveCount(0);
  });

  test('2D fallback renders automatically when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error test override
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (/webgl/.test(type)) return null;
        return orig.call(this, type as any, ...(rest as []));
      };
    });
    const perf = await firstPerformanceId(page);
    await page.goto(`/book/${perf}`);
    await expect(page.getByTestId('venue-3d')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'اختر القسم' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'عرض ثلاثي الأبعاد' })).toBeVisible();
  });

  test('payment failure shows a safe retry path', async ({ page }) => {
    const perf = await firstPerformanceId(page);
    await page.goto(`/book/${perf}`);
    await page.getByRole('button', { name: 'عرض ثنائي الأبعاد' }).first().click();
    await page.getByRole('group', { name: 'اختر القسم' }).getByRole('button', { name: /^عادي يمين/ }).click();
    await page.locator('button[aria-label^="عادي يمين"][aria-label*=", متاح,"]').first().click();
    await page.locator('.side-panel').getByRole('button', { name: 'أضف للسلة' }).click();
    await page.locator('.side-panel').getByRole('button', { name: 'متابعة للدفع' }).click();
    await loginDemo(page, 'customer@demo.ebooking.test');
    await page.getByLabel('رقم الموبايل (الكويت)').fill('55551234');
    await page.getByText('محاكي الدفع التجريبي (للاختبار)').click();
    await page.getByLabel('نتيجة الدفع المحاكاة').selectOption('fail');
    await page.getByRole('button', { name: /ادفع \(تجريبي\)/ }).click();
    await expect(page.getByText('فشل الدفع').first()).toBeVisible();
    await page.getByRole('link', { name: 'حاول مرة ثانية' }).click();
    await page.getByRole('button', { name: /ادفع \(تجريبي\)/ }).click();
    await expect(page.getByText('تم تأكيد حجزك!')).toBeVisible();
  });
});
