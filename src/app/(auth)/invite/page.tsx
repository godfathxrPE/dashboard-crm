'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

type Phase = 'checking' | 'accepting' | 'invalid' | 'no-token' | 'wrong-email';

function InviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('checking');
  // T1c: инвайт адресован другому email — показываем оба адреса на экране смены аккаунта
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  // StrictMode/двойной эффект — accept зовём один раз на маунт
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Не залогинен → на логин, сохранив токен через next (вернёмся сюда после magic-link)
      if (!user) {
        const next = token ? `/invite?token=${encodeURIComponent(token)}` : '/invite';
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      // Залогинен, но без токена → экран «вошли, но не в организации»
      if (!token) {
        setPhase('no-token');
        return;
      }

      setPhase('accepting');
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
      const result = data as { status?: string; invited_email?: string } | null;
      const status = result?.status;

      const known = ['accepted', 'unauthenticated', 'invalid', 'wrong_email'];
      if (error || !status || !known.includes(status)) {
        setPhase('invalid');
        return;
      }
      if (status === 'unauthenticated') {
        const next = `/invite?token=${encodeURIComponent(token)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (status === 'invalid') {
        setPhase('invalid');
        return;
      }
      // T1c: токен не сгорел (accepted_at не стемпнут) — объясняем и даём сменить аккаунт
      if (status === 'wrong_email') {
        setInvitedEmail(result?.invited_email ?? null);
        setCurrentEmail(user.email ?? null);
        setPhase('wrong-email');
        return;
      }

      // accepted → обновить org-кеши и уйти в дашборд
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['org-role'] }),
        qc.invalidateQueries({ queryKey: ['team-members'] }),
        qc.invalidateQueries({ queryKey: ['invitations'] }),
      ]);
      toast.success('Вы добавлены в организацию');
      router.replace('/');
    })();
  }, [token, router, qc]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="w-full max-w-sm space-y-6 px-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-white text-xl font-bold">
        ОП
      </div>

      {(phase === 'checking' || phase === 'accepting') && (
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-text-main">
            {phase === 'accepting' ? 'Принимаем приглашение…' : 'Проверяем…'}
          </h1>
          <p className="text-sm text-text-mute">Секунду</p>
        </div>
      )}

      {phase === 'invalid' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-text-main">Ссылка недействительна</h1>
            <p className="text-sm text-text-mute">
              Приглашение уже принято или истекло. Попросите владельца прислать новую ссылку.
            </p>
          </div>
          <Button variant="secondary" onClick={signOut} className="w-full">
            Выйти
          </Button>
        </div>
      )}

      {phase === 'wrong-email' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-text-main">
              Приглашение для другого адреса
            </h1>
            <p className="text-sm text-text-mute">
              Вы вошли как{' '}
              <span className="font-medium text-text-main">{currentEmail ?? 'другой аккаунт'}</span>
              , а приглашение отправлено на{' '}
              <span className="font-medium text-text-main">{invitedEmail ?? 'другой адрес'}</span>.
              Выйдите и войдите под нужным адресом — ссылка останется действительной.
            </p>
          </div>
          <Button variant="secondary" onClick={signOut} className="w-full">
            Выйти
          </Button>
        </div>
      )}

      {phase === 'no-token' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-text-main">
              Вы вошли, но ещё не в организации
            </h1>
            <p className="text-sm text-text-mute">
              Попросите владельца прислать ссылку-приглашение — по ней вы получите доступ.
            </p>
          </div>
          <Button variant="secondary" onClick={signOut} className="w-full">
            Выйти
          </Button>
        </div>
      )}

      <p className="text-center text-[11px] text-text-mute">Torii CRM · v4.0</p>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm px-4 text-center text-sm text-text-mute">Проверяем…</div>
      }
    >
      <InviteInner />
    </Suspense>
  );
}
