'use client';

import { useState } from 'react';
import { Video, Plus, Trash2, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectVideos, useAddVideo, useDeleteVideo } from '@/lib/hooks/use-project-videos';
import { parseVideoUrl, PROVIDER_LABELS } from '@/lib/utils/video-embed-helpers';
import type { ProjectVideo } from '@/types/entities';

interface ProjectVideosProps {
  projectId: string;
  canManage: boolean;
}

/**
 * S-VIDEO-EMBED-1: видео-материалы проекта (демо/обучение/записи встреч).
 * YouTube/VK/Rutube — встроенный плеер; прочее — карточка-ссылка.
 * W7 (безопасность): iframe.src ВСЕГДА из parseVideoUrl(video.url) на рендере —
 * stored provider из БД не доверяем (только badge), сырой url в iframe не попадает.
 */
export function ProjectVideos({ projectId, canManage }: ProjectVideosProps) {
  const { data: videos = [], isLoading } = useProjectVideos(projectId);
  const addVideo = useAddVideo(projectId);
  const deleteVideo = useDeleteVideo(projectId);

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  const draftParsed = url.trim() ? parseVideoUrl(url.trim()) : null;

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    const parsed = parseVideoUrl(trimmed);
    addVideo.mutate(
      {
        url: trimmed,
        provider: parsed.provider,
        title: title.trim() || null,
        sort_order: videos.length,
      },
      {
        onSuccess: () => {
          setUrl('');
          setTitle('');
          setAdding(false);
        },
        onError: () => toast.error('Не удалось добавить видео'),
      },
    );
  }

  function handleDelete(video: ProjectVideo) {
    if (window.confirm('Удалить видео?')) {
      deleteVideo.mutate(video.id, {
        onError: () => toast.error('Не удалось удалить видео'),
      });
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video size={14} className="text-text-dim" />
          <span className="text-xs font-semibold text-text-main">Видео</span>
          <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
            {videos.length}
          </span>
        </div>
        {canManage && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1
                       text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            {adding ? <X size={12} /> : <Plus size={12} />}
            {adding ? 'Отмена' : 'Видео'}
          </button>
        )}
      </div>

      {canManage && adding && (
        <div className="mb-3 flex flex-col gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Ссылка: YouTube / VK Видео / Rutube — плеером, прочее — ссылкой"
            className="w-full rounded-lg border border-input bg-surface px-3 py-1.5
                       text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название (необязательно)"
            className="w-full rounded-lg border border-input bg-surface px-3 py-1.5
                       text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
          {draftParsed && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-text-mute">
                {draftParsed.embedUrl
                  ? `Провайдер: ${PROVIDER_LABELS[draftParsed.provider]} — будет встроен плеер`
                  : 'Плеер для этой ссылки не поддерживается — добавится кликабельной ссылкой'}
              </span>
              {draftParsed.embedUrl && (
                <div className="aspect-video w-full max-w-sm">
                  <iframe
                    src={draftParsed.embedUrl}
                    title="Предпросмотр видео"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full rounded-lg border border-border"
                  />
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={!url.trim() || addVideo.isPending}
            className="self-start rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-white
                       transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {addVideo.isPending ? 'Добавление...' : 'Добавить'}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="py-6 text-center text-xs text-text-mute">Загрузка...</p>
      ) : videos.length === 0 ? (
        !adding && (
          <div className="flex flex-col items-center py-6 text-center">
            <Video size={20} strokeWidth={1.2} className="text-text-mute" />
            <p className="mt-2 text-xs text-text-mute">
              {canManage ? 'Добавь демо, обучение или запись встречи — «+ Видео»' : 'Видео пока нет'}
            </p>
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {videos.map((video) => {
            // W7: embed строим из url на рендере; video.provider — только badge.
            const parsed = parseVideoUrl(video.url);
            return (
              <div key={video.id} className="flex flex-col gap-1.5">
                {parsed.embedUrl ? (
                  <div className="aspect-video w-full">
                    <iframe
                      src={parsed.embedUrl}
                      title={video.title || 'Видео'}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full rounded-lg border border-border"
                    />
                  </div>
                ) : (
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-3
                               text-sm text-text-main transition-colors hover:bg-surface2 hover:text-accent"
                  >
                    <ExternalLink size={14} className="shrink-0 text-text-mute" />
                    <span className="min-w-0 truncate">{video.title || video.url}</span>
                  </a>
                )}
                <div className="flex items-center gap-2 px-0.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-text-dim" title={video.title ?? undefined}>
                    {video.title || PROVIDER_LABELS[video.provider as keyof typeof PROVIDER_LABELS] || 'Видео'}
                  </span>
                  <span className="shrink-0 text-[10px] text-text-mute">
                    {PROVIDER_LABELS[video.provider as keyof typeof PROVIDER_LABELS] ?? video.provider}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => handleDelete(video)}
                      className="shrink-0 rounded p-0.5 text-text-mute hover:text-red transition-colors"
                      aria-label="Удалить видео"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
