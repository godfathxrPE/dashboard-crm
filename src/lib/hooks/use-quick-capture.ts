'use client';

import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { captureResultSchema, type CaptureResult } from '@/lib/validators/capture';
import { extractEmail, phoneKey } from '@/lib/utils/capture-helpers';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';

/**
 * S-QUICK-CAPTURE-1: разбор вставленного текста (edge `ai-capture`) + поиск дубля.
 *
 * Кэша у разбора нет намеренно (`useMutation`, не `useQuery`): это одноразовое
 * действие над одноразовым текстом, инвалидировать нечего и переиспользовать
 * нечего.
 */

export type CaptureDuplicate =
  | { kind: 'contact'; id: string; label: string }
  | { kind: 'company'; id: string; label: string };

/** Название компании без ОПФ, кавычек и регистра — как в дедупе CompanyModal. */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»"'“”]/g, '')
    .replace(/\b(ооо|ао|зао|пао|оао|нао|ип)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parseText(text: string): Promise<CaptureResult> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('ai-capture', {
    body: { text },
  });

  if (error) {
    // Edge Function вернула non-2xx — нейтральное сообщение лежит в теле,
    // достаём его через error.context (паттерн use-ai-summary).
    let message = 'Не удалось разобрать текст';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch { /* нейтральное сообщение по умолчанию */ }
    throw new Error(message);
  }

  // Ответ функции — внешний payload: сужаем, а не кастуем. Функция деплоится
  // гейтом отдельно от бандла, и битая версия иначе протекла бы undefined-ами
  // в defaultValues формы.
  const parsed = captureResultSchema.safeParse((data as { result?: unknown } | null)?.result);
  if (!parsed.success) throw new Error('Некорректный ответ сервиса разбора');
  return parsed.data;
}

export function useQuickCapture() {
  // `silentError` — потому что виджет показывает отказ САМ, прямо в поповере, где
  // рядом лежит непотерянный текст и кнопка «Повторить». Без флага AUDIT A1.1
  // добавил бы поверх этого ещё и глобальный тост — два сообщения об одном сбое.
  const parse = useMutation({ mutationFn: parseText, meta: { silentError: true } });

  // Дедуп идёт по УЖЕ ЗАГРУЖЕННЫМ спискам, без отдельных запросов: их и так
  // безусловно тянет CommandPalette, статически смонтированная в layout, так что
  // данные в кэше есть на любой странице. Плюс это единственный способ сверить
  // мультителефон: `phones` — jsonb, и PostgREST-фильтром подстроку в нём не
  // найти (`cs` требует точного элемента). RLS уже ограничила выдачу текущей
  // организацией — дополнительных фильтров не нужно.
  const { data: contacts = [] } = useContacts();
  const { data: companies = [] } = useCompanies();

  /**
   * Первый похожий существующий объект или null.
   *
   * Контакт — по email или любому из телефонов (нормализованных до 10 цифр).
   * Компания — по ИНН (точно) или названию без ОПФ. `inn` приходит отдельным
   * параметром: модель его не извлекает (инвариант), его даёт `extractInn`.
   */
  const findDuplicate = useCallback(
    (result: CaptureResult, inn: string | null): CaptureDuplicate | null => {
      const c = result.contact;
      if (c) {
        const email = (c.email || extractEmail(c.notes) || '').trim().toLowerCase() || null;
        const key = phoneKey(c.phone);
        if (email || key) {
          const hit = contacts.find((row) => {
            if (email && row.email && row.email.trim().toLowerCase() === email) return true;
            if (!key) return false;
            if (phoneKey(row.phone) === key) return true;
            return (row.phones ?? []).some((p) => phoneKey(p.value) === key);
          });
          if (hit) {
            return {
              kind: 'contact',
              id: hit.id,
              label: `${hit.first_name} ${hit.last_name}`.trim(),
            };
          }
        }
      }

      const norm = result.company?.name ? normalizeCompanyName(result.company.name) : '';
      if (inn || norm.length >= 3) {
        const hit = companies.find((row) => {
          if (inn && row.inn && row.inn.trim() === inn) return true;
          return norm.length >= 3 && normalizeCompanyName(row.name) === norm;
        });
        if (hit) return { kind: 'company', id: hit.id, label: hit.name };
      }

      return null;
    },
    [contacts, companies],
  );

  return { parse, findDuplicate };
}
