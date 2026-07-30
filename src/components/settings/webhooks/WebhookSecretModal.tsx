'use client';

import { toast } from 'sonner';
import { Copy, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';

interface WebhookSecretModalProps {
  title: string;
  secret: string;
  onClose: () => void;
}

/**
 * Экран «секрет виден один раз». Общий для создания и ротации — оба случая
 * одинаковы по последствиям: закрыл, не сохранив, — только перегенерировать.
 *
 * ⚠️ `isDirty` держится включённым всегда, хотя формы здесь нет. Это не
 *    злоупотребление флагом, а его прямое назначение: закрытие теряет данные
 *    безвозвратно, и случайный Esc / клик по фону обязан спросить. Единственный
 *    штатный выход — явная кнопка.
 */
export function WebhookSecretModal({ title, secret, onClose }: WebhookSecretModalProps) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Секрет скопирован');
    } catch {
      toast.error('Буфер обмена недоступен — скопируйте вручную');
    }
  };

  return (
    <Modal
      title={title}
      description="Секрет показывается один раз"
      onClose={onClose}
      isDirty
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Я сохранил секрет
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface2 p-3">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-text-dim">
            Сохраните секрет сейчас — показать его снова нельзя. Если потеряете, останется
            только перегенерировать, и старый перестанет действовать немедленно.
          </p>
        </div>

        <div>
          <span className="mb-1 block text-meta font-medium text-text-dim">Секрет подписи</span>
          <div className="flex items-stretch gap-2">
            <code className="min-w-0 flex-1 break-all rounded border border-input bg-surface2 px-3 py-2 font-mono text-xs text-text-main">
              {secret}
            </code>
            <button
              type="button"
              onClick={copy}
              aria-label="Скопировать секрет"
              title="Скопировать секрет"
              className="flex shrink-0 items-center gap-1 rounded border border-border px-3 text-xs font-medium text-text-dim transition-colors hover:bg-surface-hover"
            >
              <Copy size={13} /> Копировать
            </button>
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-text-mute">
          <p className="font-medium text-text-dim">Как проверять подпись на приёмнике</p>
          <p>
            Заголовок <code className="font-mono">X-Torii-Signature</code> имеет вид{' '}
            <code className="font-mono">t=&lt;unix&gt;,v1=&lt;hex&gt;</code>. Значение{' '}
            <code className="font-mono">v1</code> — это{' '}
            <code className="font-mono">HMAC-SHA256(секрет, &quot;&lt;t&gt;.&lt;сырое тело&gt;&quot;)</code>.
            Считайте его от полученных байт, а не от пересобранного JSON: порядок ключей
            изменится, и подпись не сойдётся.
          </p>
          <p>
            Сравнивайте constant-time, отклоняйте запросы старше 5 минут по{' '}
            <code className="font-mono">t</code>, а повторы отсекайте по{' '}
            <code className="font-mono">X-Torii-Delivery</code> — он одинаков у всех попыток
            одной доставки.
          </p>
        </div>
      </div>
    </Modal>
  );
}
