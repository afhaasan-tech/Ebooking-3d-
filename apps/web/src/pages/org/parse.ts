/**
 * Pure (React-free) parsing helpers for the organizer and admin portals.
 *
 * Money stays integer fils end to end: KWD inputs are parsed from strings ("12.500" → 12500)
 * with the shared kwdToFils helper — never through floating point.
 */
import { filsToKwdString, kwdToFils, toAsciiDigits } from '@ebooking/shared';

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII; Arabic decimal separator (٫) → '.'. */
export function normalizeNumeric(input: string): string {
  return toAsciiDigits(input)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .trim();
}

/** "12.500" → 12500 fils. Returns null for anything that is not a plain non-negative KWD amount. */
export function parseKwd(input: string): number | null {
  const s = normalizeNumeric(input);
  if (!s) return null;
  try {
    return kwdToFils(s);
  } catch {
    return null;
  }
}

/** 12500 → "12.500" (for pre-filling inputs). Empty string for null / invalid. */
export function filsToKwd(fils: number | null | undefined): string {
  if (fils == null) return '';
  try {
    return filsToKwdString(fils);
  } catch {
    return '';
  }
}

export function parseIntStrict(input: string, min: number, max: number): number | null {
  const s = normalizeNumeric(input);
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** "2.5" (percent) → 250 basis points, by string parsing. */
export function parsePercentToBps(input: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalizeNumeric(input));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** 250 → "2.5" */
export function bpsToPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** A datetime-local value is interpreted as Kuwait wall-clock time (UTC+3, no DST) → ISO (UTC). */
export function kuwaitLocalToIso(v: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Current Kuwait wall-clock time as a datetime-local value (optionally shifted by minutes). */
export function kuwaitNowLocal(offsetMinutes = 0): string {
  return new Date(Date.now() + 3 * 3_600_000 + offsetMinutes * 60_000).toISOString().slice(0, 16);
}

/** Defensive coercion of an API money field to integer fils. */
export function toFils(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export const shortId = (id: string | null | undefined) => (!id ? '—' : /^[0-9a-f-]{36}$/i.test(id) ? `${id.slice(0, 8)}…` : id);
