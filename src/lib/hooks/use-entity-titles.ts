'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { entityKey, type EntityPart } from '@/lib/utils/entity-links';

// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1e: названия сущностей для чипов-ссылок в сообщениях.
//
// Один запрос НА ТАБЛИЦУ на всю ленту, а не на чип: тот же приём, что у реакций и
// вложений (`.in('id', …)` по уже собранным ссылкам). Сделка и внедрение живут в одной
// таблице `projects` — их id сливаются в ОДИН запрос, разводит их только ключ.
//
// Отсутствие строки — не ошибка: RLS честно отдаёт пусто на сущность, которую человек
// не видит. Чип в этом случае рисуется как «Недоступно», а не как сломанная ссылка.
// ═══════════════════════════════════════════════════════

/** Названия по ключу `entityKey(type, id)`; ключа нет — названия нет. */
export type EntityTitles = ReadonlyMap<string, string>;

export interface UseEntityTitlesResult {
  titles: EntityTitles;
  /** Пока true — чип показывает укороченный uuid, а не «Недоступно». */
  isLoading: boolean;
}

const EMPTY: EntityTitles = new Map();

export function useEntityTitles(refs: EntityPart[]): UseEntityTitlesResult {
  const supabase = createClient();

  // Стабильный ключ кэша: набор ссылок, а не массив-объект. Ленту перерисовывает каждое
  // сообщение, и ключ из самого массива инвалидировал бы запрос на каждый рендер.
  const cacheKey = useMemo(
    () => Array.from(new Set(refs.map((r) => entityKey(r.entityType, r.id)))).sort().join(','),
    [refs],
  );

  const ids = useMemo(() => {
    const projects = new Set<string>();
    const companies = new Set<string>();
    const contacts = new Set<string>();
    for (const key of cacheKey ? cacheKey.split(',') : []) {
      const [type, id] = key.split(':');
      if (type === 'deal' || type === 'project') projects.add(id);
      else if (type === 'company') companies.add(id);
      else if (type === 'contact') contacts.add(id);
    }
    return {
      projects: [...projects],
      companies: [...companies],
      contacts: [...contacts],
    };
  }, [cacheKey]);

  const query = useQuery({
    queryKey: ['entity-titles', cacheKey] as const,
    enabled: cacheKey.length > 0,
    // Название сделки меняют редко, а чипов на экране может быть много: рефетч по
    // фокусу окна здесь только шум.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<EntityTitles> => {
      const [projects, companies, contacts] = await Promise.all([
        ids.projects.length
          ? supabase.from('projects').select('id, name').in('id', ids.projects)
          : null,
        ids.companies.length
          ? supabase.from('companies').select('id, name').in('id', ids.companies)
          : null,
        ids.contacts.length
          ? supabase.from('contacts').select('id, first_name, last_name').in('id', ids.contacts)
          : null,
      ]);

      // Ошибку не глотаем: «не смог спросить» и «нет доступа» — разные состояния, и
      // молчаливое «Недоступно» на упавшей сети врало бы про права.
      for (const res of [projects, companies, contacts]) {
        if (res?.error) throw res.error;
      }

      const titles = new Map<string, string>();
      for (const row of projects?.data ?? []) {
        // Строка `projects` обслуживает и /deals/, и /projects/ — какой ссылкой на неё
        // сослались, мы не знаем, поэтому кладём под обоими ключами.
        titles.set(entityKey('deal', row.id), row.name);
        titles.set(entityKey('project', row.id), row.name);
      }
      for (const row of companies?.data ?? []) {
        titles.set(entityKey('company', row.id), row.name);
      }
      for (const row of contacts?.data ?? []) {
        const full = `${row.last_name ?? ''} ${row.first_name ?? ''}`.trim();
        titles.set(entityKey('contact', row.id), full || 'Контакт');
      }
      return titles;
    },
  });

  return {
    titles: query.data ?? EMPTY,
    // `isLoading` у выключенного запроса остаётся true — без этой проверки чип без
    // ссылок вечно висел бы в состоянии загрузки.
    isLoading: cacheKey.length > 0 && query.isLoading,
  };
}
