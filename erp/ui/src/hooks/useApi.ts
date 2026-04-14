import { useState, useEffect, useCallback, useRef } from "react";

type FetchFn<T> = () => Promise<T>;

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useApi<T>(fetcher: FetchFn<T>, deps: unknown[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  const doFetch = useCallback(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (seq === seqRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (seq === seqRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return { data, loading, error, refresh: doFetch };
}
