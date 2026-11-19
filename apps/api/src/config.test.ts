import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { resolveSecret } from './config';
import { setup } from './test-helpers';

describe('secret resolution (regression: empty JWT secret allowed forged tokens)', () => {
  it('treats empty and whitespace values as unset → random 64-hex dev secret', () => {
    for (const v of ['', '   ', undefined]) {
      const s = resolveSecret('JWT_SECRET', v, false);
      expect(s).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  it('refuses short secrets and missing secrets in production', () => {
    expect(() => resolveSecret('JWT_SECRET', 'short', false)).toThrow(/too short/);
    expect(() => resolveSecret('JWT_SECRET', 'replace-with-64-random-hex-characters-for-local-dev-only-000000', false)).toThrow(/placeholder/);
    expect(() => resolveSecret('JWT_SECRET', '', true)).toThrow(/production/);
    expect(resolveSecret('JWT_SECRET', 'x'.repeat(40), true)).toBe('x'.repeat(40));
  });
});

describe('forged tokens are rejected end-to-end', () => {
  it('a token signed with an empty key cannot reach admin endpoints', async () => {
    const t = await setup();
    const forged = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-a000-000000000006')
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(''));
    expect((await t.call('GET', '/api/admin/overview', { token: forged })).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"00000000-0000-4000-a000-000000000006","aud":"authenticated"}').toString('base64url')}.`;
    expect((await t.call('GET', '/api/admin/overview', { token: none })).status).toBe(401);
    await t.app.close();
    await t.db.close();
  });
});
