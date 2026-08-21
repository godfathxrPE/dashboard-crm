'use client';

import { useRef, useState } from 'react';
import { Download, FileText, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAttachmentUrl,
  useDownloadAttachment,
  isImageAttachment,
  formatAttachmentSize,
} from '@/lib/hooks/use-message-attachments';
import type { MessageAttachment } from '@/types/entities';

/**
 * S-CHAT-HUB-1d: вложения под текстом сообщения.
 *
 * Превью — ТОЛЬКО картинки (`mime_type like 'image/%'`). Всё остальное — строка
 * «иконка · имя · размер» с кнопкой скачивания: PDF-вьюеров и прочих просмотрщиков
 * здесь не изобретаем, это отдельный продукт.
 *
 * Бакет приватный, поэтому любой URL — подписанный и живёт 60 секунд. Отсюда два
 * следствия: превью просит ссылку сразу (иначе нечего рисовать), а файловая строка —
 * только по клику; и протухшую ссылку картинки чинит `onError` → перевыпуск, а не
 * иконка «битое изображение».
 */
export function MessageAttachments({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {attachments.map((a) =>
        isImageAttachment(a) ? (
          <ImagePreview key={a.id} attachment={a} />
        ) : (
          <FileRow key={a.id} attachment={a} />
        ),
      )}
    </div>
  );
}

function ImagePreview({ attachment }: { attachment: MessageAttachment }) {
  const { url, isLoading, refetch } = useAttachmentUrl(attachment.storage_path);
  const [broken, setBroken] = useState(false);
  // Один перевыпуск на попытку: без него протухший объект (удалён из бакета) крутил бы
  // refetch → onError → refetch бесконечно.
  const retried = useRef(false);

  if (broken) return <FileRow attachment={attachment} />;

  if (isLoading || !url) {
    return (
      <div className="h-24 w-40 animate-pulse rounded-lg border border-border bg-surface2" />
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      title={attachment.file_name}
      className="block max-w-[16rem] overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={attachment.file_name}
        className="max-h-56 w-full object-cover"
        onError={() => {
          if (retried.current) {
            setBroken(true);
            return;
          }
          retried.current = true;
          refetch();
        }}
      />
    </button>
  );
}

function FileRow({ attachment }: { attachment: MessageAttachment }) {
  const download = useDownloadAttachment();
  const [busy, setBusy] = useState(false);
  const isImage = isImageAttachment(attachment);

  const onDownload = async () => {
    setBusy(true);
    try {
      await download(attachment);
    } catch {
      toast.error('Не удалось скачать файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={busy}
      className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface2 px-2 py-1.5
                 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
    >
      {/* Картинка, для которой не вышло превью, честно показывает это иконкой. */}
      {isImage ? (
        <ImageOff size={14} className="shrink-0 text-text-mute" aria-hidden="true" />
      ) : (
        <FileText size={14} className="shrink-0 text-text-mute" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-text-main">{attachment.file_name}</span>
      <span className="shrink-0 text-meta tabular-nums text-text-mute">
        {formatAttachmentSize(attachment.file_size)}
      </span>
      <Download size={13} className="shrink-0 text-text-mute" aria-hidden="true" />
    </button>
  );
}
