'use client';

import { useState } from 'react';
import { Send, ExternalLink, Copy, Check } from 'lucide-react';
import { InlineConfirm, useConfirm } from '@/components/ui/InlineConfirm';
import {
  useTelegramAccount,
  useCreateTelegramLinkToken,
  useUnlinkTelegram,
} from '@/lib/hooks/use-telegram-account';

/**
 * S-TG-1: привязка Telegram к своему профилю.
 *
 * ⚠️ Это СЕКЦИЯ внутри существующей страницы настроек, а НЕ новый раздел приложения.
 *    Таблица «новый раздел = шесть точек правки» (урок S-AI-VIS-2: nav, section-colors,
 *    ContentHeader, AuraOrbs+css, CommandPalette) здесь НЕ ПРИМЕНЯЕТСЯ — ни маршрута,
 *    ни пункта меню, ни цвета секции, ни орбов, ни записей в ⌘K заводить не нужно.
 *    Сказано явно, чтобы на ревью не искали пять недостающих точек.
 *
 * ⚠️ Иконки Telegram в lucide нет — используем `Send` (бумажный самолётик).
 *    Рисовать свой SVG ради логотипа мессенджера здесь не за чем.
 *
 * ⚠️ Имя бота — из `NEXT_PUBLIC_TELEGRAM_BOT`, не хардкодом: у прода и у локальной
 *    разработки боты разные, а хардкод увёл бы разработчика в боевого бота.
 */

/** Без `@`. Пусто ⇒ окружение не настроено, и кнопка честно об этом говорит. */
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? '';

function formatLinkedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function TelegramSection() {
  const { data: account, isLoading } = useTelegramAccount();
  const createToken = useCreateTelegramLinkToken();
  const unlink = useUnlinkTelegram();
  const confirmUnlink = useConfirm<string>();

  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function connect() {
    setError(null);
    setCopied(false);

    if (!BOT_USERNAME) {
      setError('Бот не настроен: в окружении нет NEXT_PUBLIC_TELEGRAM_BOT');
      return;
    }

    createToken.mutate(undefined, {
      onSuccess: (token) => {
        const url = `https://t.me/${BOT_USERNAME}?start=${token}`;
        setLinkUrl(url);
        // Вкладка — быстрый путь для тех, у кого установлен клиент. Ссылку ниже
        // показываем ВСЕГДА: на десктопе без Telegram открытая вкладка бесполезна,
        // а токен живёт 15 минут, и второй заход за ним — лишний шаг.
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Не удалось получить ссылку'),
    });
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Буфер обмена недоступен — скопируйте ссылку вручную');
    }
  }

  function doUnlink(id: string) {
    setError(null);
    setLinkUrl(null);
    unlink.mutate(id, {
      onSuccess: () => confirmUnlink.cancel(),
      onError: (e) => {
        confirmUnlink.cancel();
        setError(e instanceof Error ? e.message : 'Не удалось отвязать');
      },
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Send size={13} className="text-accent" />
        <h2 className="text-xs font-semibold text-text-dim">Telegram</h2>
      </div>

      {isLoading ? (
        <p className="text-xs text-text-mute">Загрузка…</p>
      ) : account ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-text-main">
              {account.username ? `@${account.username}` : `ID ${account.telegram_user_id}`}
            </p>
            <p className="text-meta text-text-mute">
              Привязан {formatLinkedAt(account.linked_at)} · уведомления приходят в чат
            </p>
          </div>

          {confirmUnlink.isAsking(account.id) ? (
            <InlineConfirm
              question="Отвязать?"
              confirmLabel="Отвязать"
              pending={unlink.isPending}
              onConfirm={() => doUnlink(account.id)}
              onCancel={confirmUnlink.cancel}
            />
          ) : (
            <button
              onClick={() => confirmUnlink.ask(account.id)}
              className="shrink-0 text-xs font-medium text-red hover:underline"
            >
              Отвязать
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-mute">
            Уведомления CRM будут дублироваться в Telegram. Нажмите «Подключить» и
            отправьте боту команду, которую он предложит.
          </p>

          <button
            onClick={connect}
            disabled={createToken.isPending}
            className="flex items-center gap-1.5 rounded border border-input bg-surface2 px-2.5 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ExternalLink size={12} />
            {createToken.isPending ? 'Готовим ссылку…' : 'Подключить Telegram'}
          </button>

          {linkUrl && (
            <div className="rounded border border-border bg-surface2 p-2">
              <p className="mb-1 text-meta text-text-dim">
                Ссылка действует 15 минут. Если вкладка не открылась — перейдите по ней
                вручную:
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-meta text-accent hover:underline"
                >
                  {linkUrl}
                </a>
                <button
                  onClick={copyLink}
                  className="flex shrink-0 items-center gap-1 text-meta text-text-dim hover:text-text-main"
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-meta text-red">{error}</p>}
    </div>
  );
}
