import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import { createDb, migrate } from './db';
import { seed } from './seed';
import { buildApp } from './app';

const dataDir = config.pgliteDataDir ? resolve(config.pgliteDataDir) : '';
const fresh = !config.databaseUrl && (!dataDir || !existsSync(resolve(dataDir, 'PG_VERSION')));

// Demo accounts share a PUBLIC test password (README). Seed them automatically only for the embedded
// local database outside production; any other database requires SEED_DEMO_DATA=true, and production never seeds.
const explicitSeed = process.env.SEED_DEMO_DATA === 'true';
if (config.isProd && explicitSeed) throw new Error('Refusing SEED_DEMO_DATA in production: demo accounts use a public password');
const mayAutoSeed = !config.isProd && !config.databaseUrl;

const db = await createDb({ databaseUrl: config.databaseUrl, dataDir });
const applied = await migrate(db);
const schemaJustCreated = fresh || applied.includes('0001_core_schema.sql');
if (schemaJustCreated && (mayAutoSeed || explicitSeed)) {
  console.log('[ebooking] seeding fictional demo data…');
  await seed(db);
} else if (schemaJustCreated) {
  console.log('[ebooking] schema created WITHOUT demo data (set SEED_DEMO_DATA=true on a non-production database to add it).');
}

const { app, ctx } = await buildApp(db, { logger: true });

// background maintenance: expire holds, reconcile unverified payments
const timer = setInterval(() => ctx.booking.sweep().catch((e) => app.log.error({ err: e.message }, 'sweep failed')), 5000);

await app.listen({ port: config.port, host: config.host });
app.log.info(`Ebooking API on http://${config.host}:${config.port} (db=${db.kind}, payments=demo, ai=${config.aiProvider})`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    clearInterval(timer);
    await app.close();
    await db.close();
    process.exit(0);
  });
}
