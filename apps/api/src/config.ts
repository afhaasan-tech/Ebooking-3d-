import { randomBytes } from 'node:crypto';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

/**
 * Resolve a signing secret. Empty/whitespace values count as UNSET (an empty `FOO=` line in .env
 * must never become an empty HMAC key), and any value that IS set must be >= 32 characters.
 */
export function resolveSecret(name: string, value: string | undefined, production: boolean): string {
  const v = value?.trim();
  if (v) {
    if (/^replace-with|changeme|example/i.test(v)) throw new Error(`${name} still holds a placeholder value`);
    if (v.length < 32) throw new Error(`${name} is too short (must be >= 32 characters)`);
    return v;
  }
  if (production) throw new Error(`${name} must be set (>= 32 chars) in production`);
  // Development fallback: random per process. Tokens do not survive restarts, which is acceptable locally.
  return randomBytes(32).toString('hex');
}
const secret = (name: string) => resolveSecret(name, env[name], isProd);
const authMode = (env.AUTH_MODE?.trim() || 'local') as 'local' | 'supabase';
// Local auth is a demo/simulation (not Supabase Auth). Never run it in production by accident.
if (isProd && authMode === 'local' && env.ALLOW_DEMO_AUTH !== 'true') {
  throw new Error('AUTH_MODE=local is a demo authentication mode; set AUTH_MODE=supabase for production (or ALLOW_DEMO_AUTH=true for a private demo deployment)');
}

export const config = {
  isProd,
  port: Number(env.API_PORT ?? 8787),
  host: env.API_HOST ?? '127.0.0.1',
  publicApiUrl: env.PUBLIC_API_URL ?? `http://127.0.0.1:${env.API_PORT ?? 8787}`,
  corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173').split(',').map((s) => s.trim()),
  /** Empty → embedded PGlite. Set to a Supabase/Postgres connection string for hosted mode. */
  databaseUrl: env.DATABASE_URL ?? '',
  pgliteDataDir: env.PGLITE_DATA_DIR ?? '', // empty = in-memory
  /** HS256 secret. In Supabase mode, use the project's JWT secret so Supabase-issued tokens verify. */
  // exactly one source per mode — never a fallback chain that could pick an empty value
  jwtSecret: authMode === 'supabase' ? secret('SUPABASE_JWT_SECRET') : secret('JWT_SECRET'),
  authMode,
  ticketSigningSecret: secret('TICKET_SIGNING_SECRET'),
  demoWebhookSecret: secret('DEMO_WEBHOOK_SECRET'),
  paymentProvider: (env.PAYMENT_PROVIDER ?? 'demo') as 'demo',
  /** AI is optional. 'none' = deterministic only. */
  aiProvider: (env.AI_PROVIDER ?? 'none') as 'none' | 'gemini' | 'openai' | 'claude',
  aiApiKey: env.AI_API_KEY ?? '',
  aiModel: env.AI_MODEL ?? '',
  aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? 8000),
  aiMaxRequestsPerUserPerHour: Number(env.AI_MAX_REQ_PER_HOUR ?? 30),
  holdTtlSeconds: Number(env.HOLD_TTL_SECONDS ?? 600),
  paymentWindowSeconds: Number(env.PAYMENT_WINDOW_SECONDS ?? 900),
  rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 300),
};
export type Config = typeof config;
