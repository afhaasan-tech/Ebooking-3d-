import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

/** Server-side hold summary (authoritative prices). */
export interface Hold {
  id: string;
  status: 'active' | 'converted' | 'expired' | 'released';
  expiresAt: string;
  performanceId: string;
  event: any;
  items: any[];
  pricing: { subtotalFils: number; serviceFeeFils: number; totalFils: number; ticketCount: number; serviceFeeBps: number; serviceFeeFixedFils: number };
}

interface BasketCtx {
  hold: Hold | null;
  busy: boolean;
  /** Replace the basket for a performance with exactly these seats (server validates atomically). */
  setSeats: (performanceId: string, seatIds: string[]) => Promise<Hold | null>;
  holdAdmission: (performanceId: string, quantity: number) => Promise<Hold>;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
}

const Ctx = createContext<BasketCtx | null>(null);
const KEY = 'ebk.hold';

function readKey(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeKey(v: string | null) {
  try {
    if (v) sessionStorage.setItem(KEY, v);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // restore after reload — only the hold id is stored locally; contents come from the server
  const reload = useCallback(async () => {
    const id = readKey();
    if (!id) return setHold(null);
    try {
      const h = await api<Hold>(`/api/holds/${id}`);
      if (h.status === 'active' && new Date(h.expiresAt).getTime() > Date.now()) setHold(h);
      else {
        writeKey(null);
        setHold(null);
      }
    } catch {
      writeKey(null);
      setHold(null);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  // expire locally when the server hold expires
  useEffect(() => {
    if (!hold) return;
    const ms = new Date(hold.expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => void reload(), Math.max(1000, ms + 500));
    return () => clearTimeout(timer);
  }, [hold, reload]);

  const setSeats = async (performanceId: string, seatIds: string[]) => {
    setBusy(true);
    try {
      if (seatIds.length === 0) {
        if (hold) await api(`/api/holds/${hold.id}`, { method: 'DELETE' }).catch(() => {});
        writeKey(null);
        setHold(null);
        return null;
      }
      // one basket at a time: release a hold on a different performance first
      if (hold && hold.performanceId !== performanceId) await api(`/api/holds/${hold.id}`, { method: 'DELETE' }).catch(() => {});
      const h = await api<Hold>('/api/holds/seats', { method: 'POST', body: { performanceId, seatIds } });
      writeKey(h.id);
      setHold(h);
      return h;
    } finally {
      setBusy(false);
    }
  };

  const holdAdmission = async (performanceId: string, quantity: number) => {
    setBusy(true);
    try {
      if (hold && hold.performanceId !== performanceId) await api(`/api/holds/${hold.id}`, { method: 'DELETE' }).catch(() => {});
      const h = await api<Hold>('/api/holds/admission', { method: 'POST', body: { performanceId, quantity } });
      writeKey(h.id);
      setHold(h);
      return h;
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (hold) await api(`/api/holds/${hold.id}`, { method: 'DELETE' }).catch((e: ApiError) => e);
    writeKey(null);
    setHold(null);
  };

  return <Ctx.Provider value={{ hold, busy, setSeats, holdAdmission, clear, reload, drawerOpen, setDrawerOpen }}>{children}</Ctx.Provider>;
}

export function useBasket() {
  const c = useContext(Ctx);
  if (!c) throw new Error('BasketProvider missing');
  return c;
}

export function forgetBasket() {
  writeKey(null);
}
