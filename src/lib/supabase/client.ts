import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// @supabase/ssr@0.5 не пробрасывает Database-generic в новый postgrest-js@2.100
// (результаты запросов схлопываются в `never`). Приводим к «сырому» типизированному
// SupabaseClient<Database> — рантайм тот же, типы результатов корректны.
// Снять каст можно после апгрейда @supabase/ssr до версии, совместимой с postgrest 2.100+.
export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as unknown as SupabaseClient<Database>;
}
