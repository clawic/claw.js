import { useState, useEffect, useCallback, useRef } from "react";

export type FetchState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: string }
  | { status: "stale"; data: T; error: null };

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<FetchState<T>>({ status: "loading", data: null, error: null });
  const lastData = useRef<T | null>(null);

  const load = useCallback(async () => {
    if (lastData.current) {
      setState({ status: "stale", data: lastData.current, error: null });
    } else {
      setState({ status: "loading", data: null, error: null });
    }
    try {
      const data = await fetcher();
      lastData.current = data;
      setState({ status: "success", data, error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({ status: "error", data: null, error: msg });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
