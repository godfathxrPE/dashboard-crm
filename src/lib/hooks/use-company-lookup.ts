'use client';

import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * S-INN-1: реквизиты компании по ИНН из ЕГРЮЛ (Edge Function `company-lookup` → DaData).
 *
 * Зеркало серверного контракта — `CompanyLookupResult` в
 * `supabase/functions/company-lookup/normalize.ts`. Держать синхронно.
 */
export interface CompanyLookupResult {
  found: boolean;
  /** Полное юрназвание с ОПФ. Идёт в `legal_name`, НЕ в `name`. */
  legal_name: string | null;
  /** Короткое название с ОПФ. Предлагается в `name`, только если поле пустое. */
  short_name: string | null;
  kpp: string | null;
  ogrn: string | null;
  /** Юрадрес. Идёт в `legal_address`, фактический `address` не трогаем. */
  legal_address: string | null;
  /** ACTIVE | LIQUIDATING | LIQUIDATED | REORGANIZING | BANKRUPT | … */
  status: string | null;
  /** Руководитель — подсказка для контакта; в компанию не пишется. */
  management_name: string | null;
}

function isLookupResult(v: unknown): v is CompanyLookupResult {
  return typeof v === 'object' && v !== null && typeof (v as { found?: unknown }).found === 'boolean';
}

async function lookupByInn(inn: string): Promise<CompanyLookupResult> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('company-lookup', {
    body: { inn: inn.trim() },
  });
  if (error) throw error;
  // Ответ функции — внешний payload для клиента ровно так же, как payload DaData
  // для функции: сужаем, а не кастуем. Иначе битый деплой протёк бы в форму
  // undefined-ами и молча затёр поля.
  if (!isLookupResult(data)) throw new Error('Некорректный ответ сервиса поиска по ИНН');
  return data;
}

/**
 * Без кэша (`useMutation`, не `useQuery`) сознательно: «Обновить из ЕГРЮЛ» — это
 * запрос за СВЕЖИМИ данными реестра, и отдать на него закэшированный ответ значит
 * не сделать ровно то, о чём просили.
 */
export function useCompanyLookup() {
  return useMutation({ mutationFn: lookupByInn });
}
