'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { MY_PROFILE_KEY } from '@/lib/hooks/use-profile';

const BUCKET = 'avatars';
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Загрузка аватара (зеркало useUploadProjectFile, но бакет публичный и путь
 * per-uid): upload в avatars/{uid}/avatar.<ext> (upsert) → public URL →
 * update profiles.avatar_url. RLS storage (061) пускает запись только в свою
 * папку {uid}/…. Cache-buster в URL — upsert не меняет путь, иначе <img>
 * покажет старый закешированный файл.
 */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Можно загрузить только изображение');
      if (file.size > MAX_SIZE) throw new Error('Файл больше 2 МБ');

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const storagePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const avatarUrl = `${publicUrl}?v=${Date.now()}`;

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);
      if (error) throw error;

      return avatarUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_PROFILE_KEY });
      qc.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}
