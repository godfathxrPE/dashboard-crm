'use client';

import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useUploadAvatar } from '@/lib/hooks/use-avatar';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

interface AvatarUploadProps {
  avatarUrl: string | null;
  fullName: string;
}

/**
 * Превью аватара + загрузка/замена (avatars/{uid}/, RLS 061). Грузится сразу
 * при выборе файла — отдельного submit не требует (avatar_url пишется прямым
 * update под profiles_update_own).
 */
export function AvatarUpload({ avatarUrl, fullName }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // тот же файл повторно → onChange всё равно сработает
    if (!file) return;
    upload.mutate(file, {
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Не удалось загрузить аватар'),
    });
  }

  return (
    <div className="flex items-center gap-3">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="Аватар"
          className="h-14 w-14 rounded-full border border-border object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-l text-sm font-bold text-accent">
          {initials(fullName)}
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-dim hover:border-accent/50 transition-colors disabled:opacity-50"
        >
          <Camera size={13} />
          {upload.isPending ? 'Загрузка…' : avatarUrl ? 'Заменить фото' : 'Загрузить фото'}
        </button>
        <p className="mt-1 text-[10px] text-text-mute">JPG/PNG, до 2 МБ. Необязательно.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
