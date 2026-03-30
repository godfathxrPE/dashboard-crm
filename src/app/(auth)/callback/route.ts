import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Успешный вход → на дашборд
      return NextResponse.redirect(`${origin}/`);
    }
  }

  // Ошибка → обратно на логин
  return NextResponse.redirect(`${origin}/login`);
}
