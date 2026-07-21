'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

type Status = 'idle' | 'loading' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const supabase = createClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    setErrorMsg('');

    // Прокидываем ?next через callback, чтобы после magic-link вернуться на исходный
    // путь (напр. /invite?token=…), а не молча на дашборд.
    const next = new URLSearchParams(window.location.search).get('next');
    const callback = next
      ? `${window.location.origin}/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Callback URL для подтверждения Magic Link
        emailRedirectTo: callback,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(
        error.message.includes('rate')
          ? 'Слишком много попыток. Подожди 10 минут.'
          : error.message,
      );
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 px-4">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-white text-xl font-bold">
          ОП
        </div>
        <h1 className="text-xl font-semibold text-text-main">
          Вход в дашборд
        </h1>
        <p className="mt-1.5 text-sm text-text-mute">
          Введи рабочую почту — пришлём ссылку для входа
        </p>
      </div>

      {/* Form */}
      {status === 'sent' ? (
        <div className="rounded-lg border border-green/30 bg-green-l p-4 text-center">
          <p className="text-sm font-medium text-green">
            Ссылка отправлена на {email}
          </p>
          <p className="mt-1 text-xs text-text-mute">
            Проверь почту и перейди по ссылке
          </p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Отправить повторно
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="твоя@почта.ru"
            required
            autoFocus
            className="w-full rounded-lg border border-border bg-surface2 px-4 py-3 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === 'loading' ? 'Отправляем...' : 'Войти через email'}
          </button>
          {status === 'error' && (
            <p className="text-center text-xs text-red">{errorMsg}</p>
          )}
        </form>
      )}

      {/* Footer */}
      <p className="text-center text-meta text-text-mute">
        Torii CRM · v4.0
      </p>
    </div>
  );
}
