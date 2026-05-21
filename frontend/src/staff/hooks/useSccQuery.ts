import { useState, useEffect, useCallback, useRef } from "react";
import { sccApi, SccApiError } from "@scc/api/client";

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface QueryOptions {
  deps?: unknown[];
  skip?: boolean;
}

export function useSccQuery<T>(
  path: string,
  options: QueryOptions = {}
): QueryResult<T> {
  const { deps = [], skip = false } = options;
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const mountedRef             = useRef(true);
  const versionRef             = useRef(0);

  const load = useCallback(() => {
    if (skip) { setLoading(false); return; }
    const version = ++versionRef.current;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();

    sccApi.get<T>(path)
      .then((d) => {
        if (mountedRef.current && version === versionRef.current) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        if (mountedRef.current && version === versionRef.current) {
          if (err instanceof SccApiError) {
            setError(`${err.status}: ${err.message}`);
          } else {
            setError(err instanceof Error ? err.message : "Unbekannter Fehler");
          }
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, skip, ...deps]);

  useEffect(() => {
    mountedRef.current = true;
    const cleanup = load();
    return () => {
      mountedRef.current = false;
      cleanup?.();
    };
  }, [load]);

  return { data, loading, error, reload: load };
}
