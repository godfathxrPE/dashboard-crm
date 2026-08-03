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
  /** S-OKVED-1: основной код ОКВЭД-2. Идёт в `okved`; отрасль из него выводит справочник. */
  okved: string | null;
  /** S-OKVED-1: телефоны реестра. Пустой массив, а не null — на тарифе «Подсказки» их обычно нет. */
  phones: string[];
  /** S-OKVED-1: почты реестра. Там же. */
  emails: string[];
}

function isLookupResult(v: unknown): v is CompanyLookupResult {
  return typeof v === 'object' && v !== null && typeof (v as { found?: unknown }).found === 'boolean';
}

/** Массив строк или пустой массив. Всё, что не строка, отбрасывается. */
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
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
  // S-OKVED-1: три поля добавлены в контракт этим спринтом, а функция деплоится
  // гейтом ОТДЕЛЬНО от фронта. Между выкаткой бандла и редеплоем функции в ответе
  // придёт версия без них — и `r.phones.map(...)` в форме упал бы на undefined,
  // хотя тип обещает массив. Достраиваем недостающее здесь, на границе.
  return {
    ...data,
    okved: typeof data.okved === 'string' ? data.okved : null,
    phones: strList(data.phones),
    emails: strList(data.emails),
  };
}

/**
 * Без кэша (`useMutation`, не `useQuery`) сознательно: «Обновить из ЕГРЮЛ» — это
 * запрос за СВЕЖИМИ данными реестра, и отдать на него закэшированный ответ значит
 * не сделать ровно то, о чём просили.
 */
export function useCompanyLookup() {
  return useMutation({ mutationFn: lookupByInn });
}
