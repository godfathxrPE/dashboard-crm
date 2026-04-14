'use client';

import { useState, useMemo } from 'react';

export function useChipFilter<T>(
  data: T[],
  filters: Record<string, (item: T) => boolean>,
) {
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const filtered = useMemo(() => {
    if (activeFilters.length === 0) return data;
    return data.filter((item) =>
      activeFilters.every((key) => filters[key]?.(item)),
    );
  }, [data, activeFilters, filters]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [key, fn] of Object.entries(filters)) {
      result[key] = data.filter(fn).length;
    }
    return result;
  }, [data, filters]);

  const toggle = (key: string) => {
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const reset = () => setActiveFilters([]);

  return { filtered, activeFilters, counts, toggle, reset };
}
