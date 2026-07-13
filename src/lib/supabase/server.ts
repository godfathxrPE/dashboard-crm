import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// См. комментарий в client.ts: каст к SupabaseClient<Database> из-за ssr@0.5 × postgrest@2.100.
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: {name: string; value: string; options: any}) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll вызывается из Server Component —
            // можно игнорировать, middleware подхватит
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}
