/** Thin typed fetch wrapper. The server is the source of truth for inventory and prices. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: any,
  ) {
    super(code);
  }
}

const TOKEN_KEY = 'ebk.token';
const SESSION_KEY = 'ebk.session';

function safeGet(store: Storage, k: string): string | null {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(store: Storage, k: string, v: string | null) {
  try {
    if (v === null) store.removeItem(k);
    else store.setItem(k, v);
  } catch {
    /* storage unavailable (private mode) — app still works for this tab */
  }
}

let memToken: string | null = safeGet(sessionStorage, TOKEN_KEY);
export const getToken = () => memToken;
export const setToken = (t: string | null) => {
  memToken = t;
  safeSet(sessionStorage, TOKEN_KEY, t);
};

/** Anonymous hold-owner id for guests (random, not a credential). */
let memSession: string | null = safeGet(sessionStorage, SESSION_KEY);
export function getSessionId(): string {
  if (!memSession) {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    memSession = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
    safeSet(sessionStorage, SESSION_KEY, memSession);
  }
  return memSession;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-session-id': getSessionId() };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const tok = getToken();
  if (tok) headers.authorization = `Bearer ${tok}`;
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && tok) setToken(null);
    throw new ApiError(res.status, data?.error ?? 'error', data?.details);
  }
  return data as T;
}

export function newIdempotencyKey(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return 'ik-' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
