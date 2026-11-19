import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/** Fetch hook with loading/error states and manual reload. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController | null>(null);
  const lastPath = useRef<string | null>(path);

  const load = useCallback(async () => {
    if (!path) return;
    // a different resource: never show the previous resource's data while loading
    if (lastPath.current !== path) {
      lastPath.current = path;
      setData(null);
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path, { signal: c.signal });
      if (!c.signal.aborted) setData(d);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof ApiError ? e : new ApiError(0, 'network_error'));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    void load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
