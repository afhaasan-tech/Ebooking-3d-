import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { DemoPaymentProvider } from '@ebooking/booking-engine';
import type { Db } from './db';
import { config } from './config';
import { HttpError, resolveUser, sessionIdFrom, type AuthUser } from './auth';
import { BookingService } from './services/booking';
import { SupportAssistant } from './ai/support';
import { publicRoutes } from './routes/public';
import { bookingRoutes } from './routes/booking';
import { orgRoutes } from './routes/org';
import { adminRoutes } from './routes/admin';
import { extraRoutes } from './routes/extras';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
    user: AuthUser | null;
    sessionId: string | null;
  }
}

export interface Ctx {
  db: Db;
  booking: BookingService;
  assistant: SupportAssistant;
  provider: DemoPaymentProvider;
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'validation_error', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

export async function buildApp(db: Db, opts: { logger?: boolean; paymentDelays?: { webhook: number; delayed: number; afterTimeout: number }; schedule?: (fn: () => void, ms: number) => void } = {}): Promise<{ app: FastifyInstance; ctx: Ctx }> {
  const app = Fastify({
    logger: opts.logger ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'body.contact', 'body.password'] } : false,
    bodyLimit: 64 * 1024,
    // set TRUST_PROXY=true only behind a known reverse proxy/CDN so rate limits see real client IPs
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // keep the raw body so webhook signatures are verified over the exact bytes received
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as FastifyRequest).rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new HttpError(400, 'invalid_json'), undefined);
    }
  });

  // The demo gateway delivers webhooks through the full HTTP pipeline (signature verification included).
  const provider = new DemoPaymentProvider(
    config.demoWebhookSecret,
    async (body, signature) => {
      await app.inject({ method: 'POST', url: '/api/payments/webhook/demo', headers: { 'content-type': 'application/json', 'x-demo-signature': signature }, payload: body });
    },
    opts.schedule,
    opts.paymentDelays,
  );
  const booking = new BookingService(db, provider, app.log);
  const ctx: Ctx = { db, booking, assistant: new SupportAssistant(db, booking), provider };

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'x-session-id', 'idempotency-key'],
  });
  await app.register(rateLimit, { max: config.rateLimitPerMinute, timeWindow: '1 minute', allowList: (req) => req.url.startsWith('/api/payments/webhook') });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.addHook('preHandler', async (req) => {
    req.user = await resolveUser(db, req);
    req.sessionId = sessionIdFrom(req);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, details: err.details });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'validation_error' });
    const e = err as { statusCode?: number; message: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: 'rate_limited' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'bad_request' });
    req.log.error({ err: e.message }, 'unhandled error');
    return reply.status(500).send({ error: 'internal_error' }); // never leak internals
  });

  app.get('/api/health', async () => {
    const t0 = Date.now();
    await db.one('select 1');
    return { ok: true, db: db.kind, dbLatencyMs: Date.now() - t0, payments: provider.isDemo ? 'demo' : provider.name, ai: config.aiProvider, demoMode: true };
  });

  await publicRoutes(app, ctx);
  await bookingRoutes(app, ctx);
  await orgRoutes(app, ctx);
  await adminRoutes(app, ctx);
  await extraRoutes(app, ctx);
  return { app, ctx };
}
