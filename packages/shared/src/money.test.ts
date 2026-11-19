import { describe, it, expect } from 'vitest';
import { kwdToFils, filsToKwdString, formatKWD, percentOf, sumFils } from './money';
import { normalizeKuwaitMobile } from './kuwait';

describe('money (integer fils)', () => {
  it('parses KWD strings exactly', () => {
    expect(kwdToFils('45')).toBe(45000);
    expect(kwdToFils('12.5')).toBe(12500);
    expect(kwdToFils('0.001')).toBe(1);
    expect(() => kwdToFils('1.0001')).toThrow();
    expect(() => kwdToFils('-1')).toThrow();
  });
  it('formats with three decimals', () => {
    expect(filsToKwdString(45000)).toBe('45.000');
    expect(formatKWD(1250, 'en')).toBe('KWD 1.250');
    expect(formatKWD(1250, 'ar')).toBe('1.250 د.ك');
  });
  it('avoids float drift', () => {
    expect(sumFils([100, 200])).toBe(300);
    expect(percentOf(20000, 500)).toBe(1000);
    expect(percentOf(333, 1000)).toBe(33);
  });
  it('rejects non-integer fils', () => {
    expect(() => sumFils([1.5])).toThrow();
  });
});

describe('kuwait mobile', () => {
  it('normalizes valid numbers', () => {
    expect(normalizeKuwaitMobile('99887766')).toBe('+96599887766');
    expect(normalizeKuwaitMobile('+965 5555 1234')).toBe('+96555551234');
    expect(normalizeKuwaitMobile('٦٥٥٥١٢٣٤')).toBe('+96565551234');
  });
  it('rejects invalid', () => {
    expect(normalizeKuwaitMobile('12345678')).toBeNull();
    expect(normalizeKuwaitMobile('9988776')).toBeNull();
  });
});
