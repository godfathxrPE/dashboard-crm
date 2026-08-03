'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════
// FIX S-CHAT-TASK-1-BIND: поиск сущности по НАЗВАНИЮ для привязки задачи.
//
// ЗАЧЕМ. Исходный спринт брал сущность только из чипа-ссылки — это защищало от привязки
// не к той сделке, но чипы появляются, лишь когда человек вставляет URL из адресной
// строки. В переписке так не пишут, и привязка не срабатывала почти никогда. Здесь —
// то, чего не хватало: список, в котором есть ЧТО выбрать.
//
// Принцип «никогда не привязывать молча» не меняется: поиск только предлагает, решает
// человек. Меняется цена решения — раньше отказ был единственным исходом.
//
// ⚠️ `%` И `_` В ПОЛЬЗОВАТЕЛЬСКОМ ВВОДЕ — ЭТО МАСКА, А НЕ СИМВОЛЫ. Без экранирования
//    запрос «100%» ищет «всё, что начинается на 100», а «Ор_ент» матчит «Ориент» и
//    «Орнент». Экранируем `\`, `%`, `_` (см. `escapeIlike`).
//
// ⚠️ Контактов в поиске НЕТ намеренно: задача на контакт без сделки — редкий сценарий,
//    а чип на контакт в сообщении по-прежнему работает и привязку даёт.
//
// RLS режет невидимое сама: и `projects`, и `companies` org-scoped, после 098 рядовой
// участник видит всю организацию на чтение — поиск по названию осмыслен для всех ролей.
// ═══════════════════════════════════════════════════════

/** Что можно выбрать привязкой. `deal`/`project` пишутся в `project_id`, `company` — в `company_id`. */
export interface EntityOption {
  entityType: 'deal' | 'project' | 'company';
  id: string;
  label: string;
  /** Вторая строка: компания сделки либо «Компания». */
  sub?: string;
}

/** Пустой запрос — последние сделки/проекты: список при открытии не должен быть пустым. */
const RECENT_LIMIT = 20;
const PROJECT_LIMIT = 20;
const COMPANY_LIMIT = 10;
const DEBOUNCE_MS = 250;

/**
 * Экранирование маски LIKE. Обратный слэш идёт в том же классе символов и первым по
 * смыслу: одна замена за один проход, поэтому уже вставленные `\` повторно не
 * экранируются.
 *
 * `*` не экранируем — его в `%` превращает сам PostgREST на разборе URL, до Postgres,
 * и обратный слэш от этой подстановки не спасает. Практический эффект — запрос из
 * одной звёздочки покажет всё подряд; это шире ожидаемого, но не опаснее пустого
 * запроса, поэтому ломать ради него ввод не стоит.
 */
export function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, '\\$&');
}

/** Строка `projects` в форме, достаточной для строки списка. */
interface ProjectRow {
  id: string;
  name: string;
  type: string | null;
  company: { name: string } | null;
}

interface CompanyRow {
  id: string;
  name: string;
}

function toOptions(projects: ProjectRow[], companies: CompanyRow[]): EntityOption[] {
  // Сделки/проекты первыми (решение 5): задача «звонок» почти всегда про сделку
  // в работе, а не про компанию вообще.
  const out: EntityOption[] = projects.map((p) => ({
    entityType: p.type === 'client' ? 'deal' : 'project',
    id: p.id,
    label: p.name,
    sub: p.company?.name ?? (p.type === 'client' ? 'Сделка' : 'Внедрение'),
  }));
  for (const c of companies) {
    out.push({ entityType: 'company', id: c.id, label: c.name, sub: 'Компания' });
  }
  return out;
}

/** Значение, отстающее от источника на `ms` — гасит запрос на каждую букву. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Поиск сущностей по названию.
 *
 * `isLoading` покрывает и паузу дебаунса, а не только сетевой запрос: без этого список
 * успевает моргнуть «Ничего не найдено» между нажатием буквы и уходом запроса.
 */
export function useEntitySearch(query: string): { options: EntityOption[]; isLoading: boolean } {
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);

  const result = useQuery({
    queryKey: ['entity-search', debounced] as const,
    // Название сделки меняют редко, а по одному и тому же слову ходят повторно.
    staleTime: 60_000,
    queryFn: async (): Promise<EntityOption[]> => {
      const supabase = createClient();

      if (!debounced) {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, type, company:companies(name)')
          .order('updated_at', { ascending: false })
          .limit(RECENT_LIMIT);
        if (error) throw error;
        return toOptions((data ?? []) as unknown as ProjectRow[], []);
      }

      const pattern = `%${escapeIlike(debounced)}%`;
      const [projects, companies] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, type, company:companies(name)')
          .ilike('name', pattern)
          .order('updated_at', { ascending: false })
          .limit(PROJECT_LIMIT),
        supabase
          .from('companies')
          .select('id, name')
          .ilike('name', pattern)
          .order('name')
          .limit(COMPANY_LIMIT),
      ]);
      // Ошибку не глотаем: «не смог спросить» и «ничего не нашлось» — разные состояния,
      // и молчаливое «Ничего не найдено» на упавшей сети врало бы про данные.
      if (projects.error) throw projects.error;
      if (companies.error) throw companies.error;

      return toOptions(
        (projects.data ?? []) as unknown as ProjectRow[],
        (companies.data ?? []) as unknown as CompanyRow[],
      );
    },
  });

  const options = useMemo(() => result.data ?? [], [result.data]);

  return {
    options,
    isLoading: trimmed !== debounced || result.isFetching,
  };
}
