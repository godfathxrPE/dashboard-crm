'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useChipFilter<T>(
  data: T[],
  filters: Record<string, (item: T) => boolean>,
  paramKey = 'f',
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFilters = useMemo(() => {
    const raw = searchParams.get(paramKey);
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams, paramKey]);

  const setActiveFilters = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.length === 0) params.delete(paramKey);
      else params.set(paramKey, next.join(','));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams, paramKey],
  );

  const filtered = useMemo(() => {
    // Ключи из URL, которых нет в filters (устаревший вид, ещё не загруженные
    // динамические чипы), не должны обнулять выборку
    const applicable = activeFilters.filter((key) => filters[key]);
    if (applicable.length === 0) return data;
    return data.filter((item) => applicable.every((key) => filters[key](item)));
  }, [data, activeFilters, filters]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [key, fn] of Object.entries(filters)) {
      result[key] = data.filter(fn).length;
    }
    return result;
  }, [data, filters]);

  const toggle = useCallback(
    (key: string) => {
      setActiveFilters(
        activeFilters.includes(key)
          ? activeFilters.filter((k) => k !== key)
          : [...activeFilters, key],
      );
    },
    [activeFilters, setActiveFilters],
  );

  const reset = useCallback(() => setActiveFilters([]), [setActiveFilters]);

  return { filtered, activeFilters, counts, toggle, reset };
}
