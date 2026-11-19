const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Convert Arabic-Indic digits to ASCII digits. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Kuwait mobile numbers: 8 digits starting with 4, 5, 6 or 9, optional +965 / 00965 prefix. */
export function normalizeKuwaitMobile(input: string): string | null {
  const digits = toAsciiDigits(input).replace(/[\s\-()]/g, '');
  const m = /^(?:\+965|00965|965)?([4569]\d{7})$/.exec(digits);
  return m ? `+965${m[1]}` : null;
}

export const KUWAIT_TZ = 'Asia/Kuwait';
