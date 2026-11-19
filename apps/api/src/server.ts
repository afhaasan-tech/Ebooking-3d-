import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';
import { createDb, migrate } from './db';
import { seed } from './seed';
import { buildApp } from './app';

const dataDir = config.pgliteDataDir ? resolve(config.pgliteDataDir) : '';
const fresh = !config.databaseUrl && (!dataDir || !existsSync(resolve(dataDir, 'PG_VERSION')));

const db = await createDb({ databaseUrl: config.databaseUrl, dataDir });
const applied = await migrate(db);
if (fresh || applied.includes('0001_core_schema.sql')) {
  console.log('[ebooking] seeding fictional demo data…');
  await seed(db);
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
