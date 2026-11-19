import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';

export interface Me {
  id: string;
  email: string;
  platformRole: 'customer' | 'platform_admin';
  profile: { full_name: string; mobile: string | null; locale: string } | null;
  organizations: { id: string; name: string; slug: string; role: 'owner' | 'manager' | 'staff' }[];
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>('/api/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.token);
    await refresh();
  };
  const register = async (email: string, password: string, fullName: string) => {
    const r = await api<{ token: string }>('/api/auth/register', { method: 'POST', body: { email, password, fullName } });
    setToken(r.token);
    await refresh();
  };
  const logout = () => {
    setToken(null);
    setMe(null);
  };
  return <Ctx.Provider value={{ me, loading, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
