'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * S-DEAL-CONTACT-1: визитка одного контакта — имя, должность, телефон, почта.
 *
 * Зачем отдельный хук. Основной контакт сделки (`projects.contact_id`) приходит в
 * запросе сделки урезанным до имени (`use-projects.ts`, embed `contact:contacts(id,
 * first_name, last_name)`), и расширять тот select нельзя: он грузится в каждом
 * списке сделок. Карта стейкхолдеров телефон несёт, но только для строк
 * `deal_stakeholders` — основной контакт без строки в карте (виртуальная строка
 * `DealStakeholders`) остаётся без контактов вовсе.
 *
 * Потребителей двое — чип в футере `DealNextStep` и `VirtualPrimaryLine` в
 * `DealStakeholders`; ключ общий, React Query делает из них один запрос.
 *
 * ⚠️ Ключ НЕ под префиксом `['contacts']`: там живёт список контактов организации,
 * и `setQueryData(['contacts'], …)` его мутаций не должен задевать чужую форму
 * данных. Инвалидация визитки при правке контакта — в `useUpdateContact`.
 *
 * `maybeSingle()`, не `single()`: удалённый или закрытый RLS контакт — это `null`
 * (чип не рисуется), а не ошибка запроса.
 */
export interface ContactBrief {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
}

export const contactBriefKey = (contactId: string | null) => ['contact-brief', contactId] as const;

async function fetchContactBrief(contactId: string): Promise<ContactBrief | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, position, email, phone')
    .eq('id', contactId)
    .maybeSingle();
  if (error) throw error;
  // `last_name` в БД nullable; визитка держит форму карты стейкхолдеров
  // (`StakeholderContact`), где фамилия — строка.
  return data ? { ...data, last_name: data.last_name ?? '' } : null;
}

export function useContactBrief(contactId: string | null) {
  return useQuery({
    queryKey: contactBriefKey(contactId),
    queryFn: () => fetchContactBrief(contactId as string),
    enabled: !!contactId,
    staleTime: 60_000,
  });
}
