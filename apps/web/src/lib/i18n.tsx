import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatKWD } from '@ebooking/shared';

export type Lang = 'ar' | 'en';

interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (l: Lang) => void;
  /** Inline bilingual strings: t('عربي', 'English'). Arabic is the default. */
  t: (ar: string, en: string) => string;
  /** Pick the localized field from an API row: pick(row, 'title') → row.title_ar / row.title_en */
  pick: (row: Record<string, any> | null | undefined, base: string) => string;
  money: (fils: number | null | undefined) => string;
  date: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  errorText: (code: string) => string;
}

const Ctx = createContext<I18n | null>(null);

const ERRORS: Record<string, [string, string]> = {
  seat_unavailable: ['بعض الكراسي ما عادت متاحة. حدّثنا الخريطة.', 'Some seats are no longer available. The map has been refreshed.'],
  too_many_seats: ['الحد الأقصى ٦ كراسي للطلب الواحد.', 'Maximum 6 seats per order.'],
  hold_expired: ['انتهت مدة حجز الكراسي المؤقت. اختارها من جديد.', 'Your seat hold expired. Please select seats again.'],
  hold_not_found: ['ما لقينا السلة. اختر الكراسي من جديد.', 'Basket not found. Please select seats again.'],
  auth_required: ['سجّل دخولك للمتابعة.', 'Please sign in to continue.'],
  invalid_credentials: ['البريد أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'],
  network_error: ['تعذّر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة ثانية.', 'Could not reach the server. Check your connection and retry.'],
  payment_in_progress: ['فيه عملية دفع قيد التحقق لهذا الطلب. لا تعيد الدفع.', 'A payment for this order is being verified. Please do not pay again.'],
  capacity_exceeded: ['ما فيه أماكن كافية متبقية.', 'Not enough places left.'],
  not_on_sale: ['البيع غير متاح حالياً لهذا العرض.', 'Sales are not open for this performance.'],
  rate_limited: ['طلبات كثيرة. انتظر شوي وحاول.', 'Too many requests. Please wait a moment.'],
  validation_error: ['تأكد من البيانات المدخلة.', 'Please check the entered details.'],
  forbidden: ['ما عندك صلاحية لهذا الإجراء.', 'You do not have permission for this action.'],
  booth_not_available: ['البوث غير متاح.', 'This booth is not available.'],
  email_taken: ['البريد مسجّل مسبقاً.', 'Email already registered.'],
  booth_already_allocated: ['هذا البوث تم تخصيصه لعارض آخر.', 'This booth is already allocated to another exhibitor.'],
  request_already_decided: ['تم البت في هذا الطلب مسبقاً.', 'This request has already been decided.'],
  request_already_pending: ['عندك طلب قيد المراجعة لهذا البوث.', 'You already have a pending request for this booth.'],
  user_not_found: ['ما فيه مستخدم بهذا البريد.', 'No user with this email.'],
  event_not_pending: ['الفعالية ليست بانتظار الموافقة.', 'The event is not pending approval.'],
  event_not_draft: ['يمكن إعادة إرسال المسودات فقط.', 'Only drafts can be resubmitted.'],
  invalid_transition: ['هذا الانتقال غير مسموح من الحالة الحالية.', 'That status change is not allowed from the current state.'],
  no_verified_payment: ['لا توجد دفعة متحقق منها لهذا الطلب.', 'There is no verified payment for this order.'],
  provider_status_not_verified: ['تعذّر التحقق من حالة الدفع لدى المزوّد.', 'Could not verify the payment status with the provider.'],
  refund_not_confirmed: ['لم يؤكد المزوّد الاسترجاع بعد.', 'The provider has not confirmed the refund.'],
  starts_at_in_past: ['وقت البداية يجب أن يكون في المستقبل.', 'The start time must be in the future.'],
  quote_not_open: ['عرض السعر لم يعد متاحاً للقبول أو الرفض.', 'This quote can no longer be accepted or declined.'],
  quote_expired: ['انتهت صلاحية عرض السعر.', 'This quote has expired.'],
  idempotency_key_conflict: ['تعارض في طلب الدفع. أعد تحميل الصفحة.', 'Payment request conflict. Please reload the page.'],
  session_required: ['أعد تحميل الصفحة ثم حاول مرة ثانية.', 'Please reload the page and try again.'],
  unknown_seat: ['كرسي غير معروف.', 'Unknown seat.'],
  duplicate_seats: ['تم اختيار نفس الكرسي مرتين.', 'The same seat was selected twice.'],
  empty_hold: ['السلة فاضية.', 'The basket is empty.'],
  assistant_budget_exceeded: ['وصلت للحد المسموح من رسائل المساعد لهذه الساعة.', 'You reached the assistant message limit for this hour.'],
  unsupported_file_type: ['نوع الملف غير مدعوم (PDF أو PNG أو JPG فقط).', 'Unsupported file type (PDF, PNG or JPG only).'],
  wrong_inventory_type: ['نوع الحجز غير مناسب لهذا العرض.', 'Wrong booking type for this performance.'],
  internal_error: ['صار خطأ في الخادم. حاول بعد شوي.', 'Server error. Please try again shortly.'],
};
// any `*_not_found` code
const NOT_FOUND: [string, string] = ['العنصر المطلوب غير موجود أو ليس لديك صلاحية عليه.', 'The requested item was not found or you do not have access to it.'];

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('ebk.lang') as Lang) || 'ar';
    } catch {
      return 'ar';
    }
  });
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('ebk.lang', l);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      dir,
      setLang,
      t: (ar, en) => (lang === 'ar' ? ar : en),
      pick: (row, base) => (row ? (row[`${base}_${lang}`] ?? row[`${base}_ar`] ?? '') : ''),
      money: (fils) => (fils == null ? (lang === 'ar' ? 'السعر عند الطلب' : 'Price on Request') : formatKWD(fils, lang)),
      date: (iso, opts) =>
        new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW' : 'en-GB', { timeZone: 'Asia/Kuwait', ...(opts ?? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }).format(new Date(iso)),
      errorText: (code) => {
        const e = ERRORS[code] ?? (code.endsWith('_not_found') ? NOT_FOUND : undefined);
        return e ? (lang === 'ar' ? e[0] : e[1]) : lang === 'ar' ? 'صار خطأ غير متوقع. حاول مرة ثانية.' : 'Something went wrong. Please try again.';
      },
    }),
    [lang, dir, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
