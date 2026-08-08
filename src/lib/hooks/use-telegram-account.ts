'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import type { Database, TelegramAccount } from '@/types/database';

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
 * ⚠️ СТАБ СХЕМЫ ДО РЕГЕНЕРАЦИИ. 107 применяется на гейте, а код пишется до, так что
 *    таблицы и функции ещё нет в `supabase.gen.ts`. После apply + `npm run
 *    db:gen-types` стаб и `telegramClient()` удаляются, вместо них — `createClient()`
 *    напрямую (ровно так сняли стаб вебхуков после 088).
 *
 *    ⚠️⚠️ Стаб объявлен через `type`, а НЕ `interface`. postgrest-js требует
 *    `Row extends Record<string, unknown>`; `interface` неявной index signature не
 *    получает, констрейнт `GenericTable` не выполняется, и `.delete()/.rpc()`
 *    схлопываются в `never`/`undefined` с сообщением, которое на index signature не
 *    намекает никак. Час, потерянный на этом в S-R2-SIGNOFF-1, повторять не надо.
 *
 * Ключ кеша без org_id — конвенция проекта: смена организации означает перелогин.
 */

// ═══════════════════════════════════════════════════════
// Стаб схемы до регенерации
// ═══════════════════════════════════════════════════════

type TelegramAccountRowDb = {
  id: string;
  org_id: string;
  profile_id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  username: string | null;
  linked_at: string;
  created_at: string;
  updated_at: string;
};

type DatabaseWithTelegram = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Database['public']['Tables'] & {
      telegram_accounts: {
        Row: TelegramAccountRowDb;
        Insert: Partial<TelegramAccountRowDb>;
        Update: Partial<TelegramAccountRowDb>;
        Relationships: [];
      };
    };
    // `link_telegram_account` в стаб НЕ входит намеренно: её ACL — только
    // service_role, из браузера её не вызвать, и место ей в edge, а не здесь.
    Functions: Database['public']['Functions'] & {
      create_telegram_link_token: { Args: Record<string, never>; Returns: string };
    };
  };
};

function telegramClient(): SupabaseClient<DatabaseWithTelegram> {
  return createClient() as unknown as SupabaseClient<DatabaseWithTelegram>;
}

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
      const supabase = telegramClient();
      const { data, error } = await supabase
        .from('telegram_accounts')
        .select(
          'id, org_id, profile_id, telegram_user_id, telegram_chat_id, username, linked_at, created_at, updated_at',
        )
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TelegramAccount | null;
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
      const supabase = telegramClient();
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
      const supabase = telegramClient();
      const { error } = await supabase.from('telegram_accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: telegramAccountKey() });
    },
  });
}
