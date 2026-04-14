import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";

export function useUrlFilters<K extends string>(keys: K[]) {
  const [params, setParams] = useSearchParams();

  const filters: Record<K, string> = {} as Record<K, string>;
  for (const k of keys) {
    filters[k] = params.get(k) ?? "";
  }

  const setFilter = useCallback((key: K, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }, [setParams]);

  const clearFilters = useCallback(() => {
    setParams(new URLSearchParams());
  }, [setParams]);

  return { filters, setFilter, clearFilters };
}
