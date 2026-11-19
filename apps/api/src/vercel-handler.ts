/**
 * Vercel Function entry for the DEMO deployment.
 * Runs the unchanged Fastify app on an embedded, in-memory PostgreSQL (PGlite) seeded with the
 * fictional demo data. Each function instance has its own database: data resets on cold start.
 * Payments use the demo simulator only — no real payment provider is configured.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { createPgliteDb, migrate } from './db';
import { seed } from './seed';
import { buildApp } from './app';

let ready: Promise<FastifyInstance> | null = null;

async function boot(): Promise<FastifyInstance> {
  const db = await createPgliteDb(); // in-memory
  await migrate(db);
  await seed(db); // fictional demo data (demo accounts use the public README test password)
  const { app, ctx } = await buildApp(db, { logger: false });
  await app.ready();
  const timer = setInterval(() => void ctx.booking.sweep().catch(() => undefined), 5000);
  timer.unref?.();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= boot().catch((e) => {
    ready = null; // allow a retry on the next request
    throw e;
  });
  const app = await ready;
  app.server.emit('request', req, res);
}
