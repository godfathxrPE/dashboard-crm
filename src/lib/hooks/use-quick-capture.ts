'use client';

import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { captureResultSchema, type CaptureResult } from '@/lib/validators/capture';
import { findCaptureDuplicate, type CaptureDuplicate } from '@/lib/utils/capture-helpers';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';

/**
 * S-QUICK-CAPTURE-1: разбор вставленного текста (edge `ai-capture`) + поиск дубля.
 *
 * Кэша у разбора нет намеренно (`useMutation`, не `useQuery`): это одноразовое
 * действие над одноразовым текстом, инвалидировать нечего и переиспользовать
 * нечего.
 *
 * ⚠️ S-TG-3: САМО ПРАВИЛО ДЕДУПА ЗДЕСЬ БОЛЬШЕ НЕ ЖИВЁТ. Оно переехало в
 *    `capture-helpers` (`findCaptureDuplicate`), потому что у него появился второй
 *    клиент — бот. Здесь остался только источник строк: списки из кэша React Query.
 *    Бот подставляет в ту же функцию строки, вычитанные из БД. Разъехавшись, эти
 *    два дедупа дали бы дубль из мессенджера на тексте, на котором веб дубль видит.
 */

export type { CaptureDuplicate };

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

  /** Первый похожий существующий объект или null. Правило — в `capture-helpers`. */
  const findDuplicate = useCallback(
    (result: CaptureResult, inn: string | null): CaptureDuplicate | null =>
      findCaptureDuplicate(result, inn, contacts, companies),
    [contacts, companies],
  );

  return { parse, findDuplicate };
}
