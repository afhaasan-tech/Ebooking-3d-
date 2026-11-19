import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db, Tx } from './db';
import { config } from './config';

export interface AuthUser {
  id: string;
  email: string;
  platformRole: 'customer' | 'platform_admin';
}

const key = () => {
  // defence in depth: refuse to sign/verify with a weak key even if config is bypassed
  if (!config.jwtSecret || config.jwtSecret.length < 32) throw new Error('jwt_secret_misconfigured');
  return new TextEncoder().encode(config.jwtSecret);
};

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}

/** Supabase-compatible access token (sub, email, role=authenticated). */
export async function issueToken(user: { id: string; email: string }): Promise<string> {
  return new SignJWT({ email: user.email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('8h')
    .setAudience('authenticated')
    .sign(key());
}

export async function verifyToken(token: string): Promise<{ sub: string; email?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: 'authenticated', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}

/**
 * Identity is ALWAYS derived from a verified token, never from a client-supplied user id.
 * Platform role is read from the database, never from the token.
 */
export async function resolveUser(db: Db, req: FastifyRequest): Promise<AuthUser | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const claims = await verifyToken(h.slice(7));
  if (!claims) return null;
  const row = await db.one<{ id: string; email: string; platform_role: AuthUser['platformRole'] }>(
    `select u.id, u.email, coalesce(p.platform_role, 'customer') as platform_role
       from auth.users u left join public.profiles p on p.id = u.id where u.id = $1`,
    [claims.sub],
  );
  return row ? { id: row.id, email: row.email, platformRole: row.platform_role } : null;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new HttpError(401, 'auth_required');
  return user;
}

export function requireAdmin(user: AuthUser | null): AuthUser {
  const u = requireUser(user);
  if (u.platformRole !== 'platform_admin') throw new HttpError(403, 'forbidden');
  return u;
}

export async function orgRole(tx: Tx, orgId: string, userId: string): Promise<'owner' | 'manager' | 'staff' | null> {
  const r = await tx.one<{ role: 'owner' | 'manager' | 'staff' }>(`select role from public.organization_members where org_id = $1 and user_id = $2`, [orgId, userId]);
  return r?.role ?? null;
}

export async function requireOrgRole(tx: Tx, orgId: string, user: AuthUser | null, roles: Array<'owner' | 'manager' | 'staff'>) {
  const u = requireUser(user);
  const role = await orgRole(tx, orgId, u.id);
  if (!role || !roles.includes(role)) throw new HttpError(403, 'forbidden');
  return { user: u, role };
}

export async function createLocalUser(tx: Tx, email: string, password: string, fullName: string, platformRole: 'customer' | 'platform_admin' = 'customer', id = randomUUID()) {
  await tx.query(`insert into auth.users(id, email) values ($1, lower($2))`, [id, email]);
  await tx.query(`insert into auth.local_credentials(user_id, password_hash) values ($1, $2)`, [id, hashPassword(password)]);
  await tx.query(`insert into public.profiles(id, full_name, platform_role) values ($1, $2, $3)`, [id, fullName, platformRole]);
  return id;
}

/** Guests are identified by an opaque random session id for holds only. */
export function sessionIdFrom(req: FastifyRequest): string | null {
  const s = req.headers['x-session-id'];
  return typeof s === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(s) ? s : null;
}

export function sendError(reply: FastifyReply, e: HttpError) {
  return reply.status(e.status).send({ error: e.code, details: e.details });
}
