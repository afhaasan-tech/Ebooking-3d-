import { ApiError } from '../../lib/api';
import { STATUS_META, r1, type Booth, type BoothGeo, type BoothStatus } from './model';

export type T = (ar: string, en: string) => string;

export const statusWord = (t: T, s: BoothStatus) => t(STATUS_META[s].ar, STATUS_META[s].en);
export const metres = (t: T, n: number) => `${r1(n)} ${t('م', 'm')}`;
export const sqm = (t: T, n: number) => `${r1(n)} ${t('م²', 'm²')}`;
export const sizeText = (t: T, b: Booth) => `${r1(b.width)} × ${r1(b.depth)} ${t('م', 'm')}`;

export function openSidesText(t: T, n: number): string {
  if (n >= 4) return t('٤ واجهات (جزيرة)', '4 (island)');
  if (n === 3) return t('٣ واجهات', '3 (peninsula)');
  if (n === 2) return t('واجهتان (زاوية)', '2 (corner)');
  return t('واجهة واحدة', '1 (inline)');
}

export function frontText(t: T, g: BoothGeo | undefined): string {
  if (!g) return '—';
  if (g.front === 'cross_aisle') return t('نحو الممر الرئيسي العرضي', 'Toward the central cross aisle');
  if (g.front === 'entrance_side') return t('نحو ممر جهة المدخل الرئيسي', 'Toward the main-entrance side aisle');
  return t('نحو الممر المحيطي', 'Toward the perimeter aisle');
}

/** Screen-reader description of a booth used by the 2D plan buttons. */
export function boothAria(t: T, b: Booth, selected: boolean): string {
  const parts = [
    `${t('بوث', 'Booth')} ${b.code}`,
    statusWord(t, b.status),
    `${sizeText(t, b)} (${sqm(t, b.width * b.depth)})`,
    `${t('الدرجة', 'score')} ${b.score}/100`,
    b.fronts_main_aisle ? t('على ممر رئيسي', 'fronts a main aisle') : '',
    selected ? t('محدد حالياً', 'currently selected') : '',
  ];
  return parts.filter(Boolean).join(t('، ', ', '));
}

const EXTRA_ERRORS: Record<string, [string, string]> = {
  exhibition_not_found: ['المعرض غير موجود أو غير منشور.', 'This exhibition was not found or is not published.'],
  booth_not_found: ['البوث غير موجود في هذا المعرض.', 'This booth was not found in this exhibition.'],
  booth_not_available: ['هذا البوث لم يعد متاحاً — حدّثنا المخطط، اختر بوثاً آخر.', 'This booth is no longer available — the plan was refreshed, please choose another booth.'],
  request_already_pending: ['لديك طلب قيد المراجعة لهذا البوث بالفعل. سيراجعه المنظّم ويتواصل معك.', 'You already have a pending request for this booth. The organizer will review it and contact you.'],
  auth_required: ['انتهت جلستك. سجّل دخولك مرة ثانية للمتابعة.', 'Your session has ended. Please sign in again to continue.'],
};

/** Bilingual message for an API error, with exhibition-specific codes the shared map does not cover. */
export function errMessage(t: T, errorText: (code: string) => string, e: unknown): string {
  const code = e instanceof ApiError ? e.code : (e as { code?: string } | null)?.code ?? 'error';
  const m = EXTRA_ERRORS[code];
  return m ? t(m[0], m[1]) : errorText(code);
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
