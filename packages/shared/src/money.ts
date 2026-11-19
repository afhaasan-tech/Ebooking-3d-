/**
 * Money is always integer fils. 1 KWD = 1000 fils.
 * Never use floating point for totals; only format at the edge.
 */
export type Fils = number;

export const FILS_PER_KWD = 1000;

export function assertFils(v: number): asserts v is Fils {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error(`Invalid fils amount: ${v}`);
}

/** Parse a decimal KWD string like "45" or "12.500" into integer fils without float math. */
export function kwdToFils(kwd: string): Fils {
  const s = kwd.trim();
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) throw new Error(`Invalid KWD amount: ${kwd}`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(3, '0'));
  const f = whole * FILS_PER_KWD + frac;
  assertFils(f);
  return f;
}

export function filsToKwdString(fils: Fils): string {
  assertFils(fils);
  const whole = Math.floor(fils / FILS_PER_KWD);
  const frac = String(fils % FILS_PER_KWD).padStart(3, '0');
  return `${whole}.${frac}`;
}

export function formatKWD(fils: Fils, locale: 'ar' | 'en' = 'ar'): string {
  const s = filsToKwdString(fils);
  return locale === 'ar' ? `${s} د.ك` : `KWD ${s}`;
}

/** Percentage fee in basis points (1% = 100 bps), rounded half-up to the nearest fil. */
export function percentOf(fils: Fils, bps: number): Fils {
  assertFils(fils);
  if (!Number.isInteger(bps) || bps < 0) throw new Error('bps must be a non-negative integer');
  return Math.floor((fils * bps + 5000) / 10000);
}

export function sumFils(values: Fils[]): Fils {
  return values.reduce((a, b) => {
    const s = a + b;
    assertFils(s);
    return s;
  }, 0);
}
