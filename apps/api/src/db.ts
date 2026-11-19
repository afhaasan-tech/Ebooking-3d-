import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Tx {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface Db extends Tx {
  /** Run fn in a single transaction as the privileged server role. */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Run fn in a transaction with RLS enforced for the given user (or anon when null).
   * Mirrors how Supabase/PostgREST sets `role` and `request.jwt.claims`.
   */
  asUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: 'pglite' | 'postgres';
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function wrap(q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>): Tx {
  return {
    async query(sql, params) {
      return (await q(sql, params)).rows.map(normalizeRow) as any[];
    },
    async one(sql, params) {
      return ((await q(sql, params)).rows.map(normalizeRow)[0] ?? null) as any;
    },
  };
}

/** int8/bigint → number (all money values are well within safe-integer range). */
function normalizeRow(r: Record<string, unknown>) {
  for (const k in r) if (typeof r[k] === 'bigint') r[k] = Number(r[k]);
  return r;
}

async function setUserContext(tx: Tx, userId: string | null) {
  await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' })]);
  await tx.query(userId ? 'set local role authenticated' : 'set local role anon');
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir || undefined);
  await pg.waitReady;
  const base = wrap((s, p) => pg.query(s, p as any[]));
  const db: Db = {
    kind: 'pglite',
    ...base,
    tx: (fn) => pg.transaction((t) => fn(wrap((s, p) => t.query(s, p as any[])))),
    asUser: (userId, fn) =>
      pg.transaction(async (t) => {
        const tx = wrap((s, p) => t.query(s, p as any[]));
        await setUserContext(tx, userId);
        return fn(tx);
      }),
    exec: async (sql) => void (await pg.exec(sql)),
    close: () => pg.close(),
  };
  return db;
}

export async function createPostgresDb(url: string): Promise<Db> {
  const pgmod = await import('pg');
  const pgx = (pgmod as any).default ?? pgmod;
  pgx.types.setTypeParser(20, (v: string) => Number(v));
  const pool = new pgx.Pool({ connectionString: url, max: 10 });
  const base = wrap((s, p) => pool.query(s, p as any[]));
  const run = async <T>(userId: string | null | undefined, fn: (tx: Tx) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const tx = wrap((s, p) => client.query(s, p as any[]));
      if (userId !== undefined) await setUserContext(tx, userId);
      const r = await fn(tx);
      await client.query('commit');
      return r;
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  };
  return {
    kind: 'postgres',
    ...base,
    tx: (fn) => run(undefined, fn),
    asUser: (u, fn) => run(u, fn),
    exec: async (sql) => void (await pool.query(sql)),
    close: () => pool.end(),
  };
}

/** Apply the local auth shim (PGlite only) and all SQL migrations in order. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`create schema if not exists local_meta; create table if not exists local_meta.migrations (name text primary key, applied_at timestamptz default now());`);
  const files: string[] = [];
  if (db.kind === 'pglite') files.push(join(ROOT, 'supabase/local/0000_local_auth_shim.sql'));
  const migDir = join(ROOT, 'supabase/migrations');
  files.push(...readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort().map((f) => join(migDir, f)));
  const applied: string[] = [];
  for (const f of files) {
    const name = f.split(/[\\/]/).pop()!;
    const done = await db.one(`select 1 from local_meta.migrations where name = $1`, [name]);
    if (done) continue;
    await db.exec(readFileSync(f, 'utf8'));
    await db.query(`insert into local_meta.migrations(name) values ($1)`, [name]);
    applied.push(name);
  }
  return applied;
}

export async function createDb(opts: { databaseUrl?: string; dataDir?: string }): Promise<Db> {
  return opts.databaseUrl ? createPostgresDb(opts.databaseUrl) : createPgliteDb(opts.dataDir);
}
