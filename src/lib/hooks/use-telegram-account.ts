'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import type { TelegramAccount } from '@/types/database';

/**
 * S-TG-1: привязка Telegram к профилю (миграция 107).
 *
 * ⚠️ ПРИВЯЗКА СОЗДАЁТСЯ НЕ ОТСЮДА. Из браузера доступны ровно две операции:
 *    получить одноразовый токен (RPC `create_telegram_link_token`) и снять свою
 *    привязку (DELETE). Саму строку создаёт edge `telegram-webhook` под
 *    service_role, когда бот получит `/start <token>` — INSERT/UPDATE у
 *    `authenticated` отозваны в 107, и это смысл фичи: иначе `telegram_user_id`
 *    подделывался бы из консоли браузера и уведомления уезжали бы чужому человеку.
 *
 * ⚠️ РЕАЛТАЙМ ЗДЕСЬ НЕ УКРАШЕНИЕ. Путь такой: нажал «Подключить» → ушёл в Telegram
 *    → сказал боту `/start` → вернулся во вкладку. Вкладка всё это время открыта и
 *    ничего не знает. Без подписки человек видит «не привязан» и жмёт F5.
 *
 * ⚠️ В `supabase.gen.ts` видны все четыре таблицы 107 и все её функции — автогенерация
 *    описывает СХЕМУ, а не права. Обращаться отсюда можно только к
 *    `telegram_accounts`: `telegram_link_tokens` / `telegram_outbox` /
 *    `telegram_updates` для `authenticated` закрыты полностью, и `link_telegram_account`
 *    тоже (её ACL — только service_role, место вызова — edge). Тип, который
 *    компилируется, здесь не означает запрос, который выполнится.
 *
 * Ключ кеша без org_id — конвенция проекта: смена организации означает перелогин.
 */

export const telegramAccountKey = () => ['telegram-account'] as const;

// ═══════════════════════════════════════════════════════
// Чтение
// ═══════════════════════════════════════════════════════

/**
 * Своя привязка или `null`. RLS отдаёт ровно одну строку (`profile_id = auth.uid()`),
 * поэтому фильтр по профилю в запросе не нужен — политика и есть фильтр.
 *
 * `maybeSingle`, а не `single`: «привязки нет» — штатное состояние, а не ошибка.
 */
export function useTelegramAccount() {
  useRealtimeSync('telegram_accounts');

  return useQuery({
    queryKey: telegramAccountKey(),
    staleTime: 1000 * 60,
    queryFn: async (): Promise<TelegramAccount | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('telegram_accounts')
        .select(
          'id, org_id, profile_id, telegram_user_id, telegram_chat_id, username, linked_at, created_at, updated_at',
        )
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

// ═══════════════════════════════════════════════════════
// Мутации
// ═══════════════════════════════════════════════════════

/**
 * Одноразовый токен привязки. Инвалидировать по успеху нечего: строка появится
 * только после `/start` в боте, и приедет она реалтаймом.
 */
export function useCreateTelegramLinkToken() {
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_telegram_link_token');
      if (error) throw error;
      if (typeof data !== 'string' || data === '') {
        throw new Error('Сервер не вернул токен привязки');
      }
      return data;
    },
  });
}

/**
 * «Отвязать». Hard delete — норма проекта; строка вернётся новой привязкой.
 *
 * ⚠️ Бот при этом продолжает существовать в списке чатов пользователя, и это
 *    правильно: остановить его — решение человека, а не CRM. Новые уведомления
 *    просто перестают ставиться в очередь (триггер не найдёт привязки).
 */
export function useUnlinkTelegram() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from('telegram_accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: telegramAccountKey() });
    },
  });
}
