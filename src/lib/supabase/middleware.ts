import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Open-redirect guard: пускаем только относительный путь с одним ведущим `/`
 *  (не `//host`, не `/\host`, не абсолютный `scheme://`). Иначе — null. */
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }: {name: string; value: string}) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: {name: string; value: string; options: any}) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ВАЖНО: НЕ использовать supabase.auth.getSession() —
  // getUser() валидирует токен на сервере Supabase, getSession нет
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/callback');
  // /invite обслуживает org-less юзеров — исключён и из auth-bounce, и из org-guard,
  // иначе редирект зациклится (org-less → /invite → org-guard → /invite → …).
  const isInvite = path.startsWith('/invite');

  // Не авторизован → на логин (кроме /login, /callback, /invite).
  // /invite пускаем: его client-страница сама уведёт на /login?next=/invite?token=…,
  // сохранив токен (bare-редирект тут потерял бы его).
  if (!user && !isAuthRoute && !isInvite) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Авторизован + на логине → на next (если безопасный) либо на дашборд.
  // Закрывает W1: magic-link → callback → сюда → вернуть на исходный /invite?token=…
  if (user && path.startsWith('/login')) {
    const next = safeNext(request.nextUrl.searchParams.get('next'));
    const url = request.nextUrl.clone();
    url.search = '';
    if (next) {
      const target = new URL(next, request.nextUrl.origin);
      url.pathname = target.pathname;
      url.search = target.search;
    } else {
      url.pathname = '/';
    }
    return NextResponse.redirect(url);
  }

  // Org-guard: залогинен, но без организации (сбой инвайта / отозванный доступ /
  // удалён из команды) → на /invite, а не в молчаливо-пустой дашборд
  // (current_org_id()=NULL → все RLS-SELECT возвращают пусто без ошибок).
  if (user && !isInvite && !isAuthRoute) {
    const { data: orgId, error } = await supabase.rpc('current_org_id');
    // Fail-open при ошибке RPC: не бросаем легитимного члена на /invite из-за
    // транзиентного сбоя (пустой дашборд — меньшее зло, чем ложный gate).
    if (!error && !orgId) {
      const url = request.nextUrl.clone();
      url.pathname = '/invite';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
