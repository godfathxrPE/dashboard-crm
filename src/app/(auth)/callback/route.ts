import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/** Open-redirect guard: только относительный путь с одним ведущим `/`. */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Успешный вход → на next (напр. /invite?token=…), иначе на дашборд
      return NextResponse.redirect(new URL(next ?? '/', origin));
    }
  }

  // Ошибка → обратно на логин
  return NextResponse.redirect(`${origin}/login`);
}
