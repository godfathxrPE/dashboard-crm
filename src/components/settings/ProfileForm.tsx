'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { profileSchema, type ProfileFormData } from '@/lib/validators/profile';
import { useMyProfile, useUpdateProfile, MY_PROFILE_KEY } from '@/lib/hooks/use-profile';
import { AvatarUpload } from '@/components/settings/AvatarUpload';

interface ProfileFormProps {
  mode: 'onboarding' | 'settings';
  /** settings: закрыть режим редактирования после сохранения. */
  onDone?: () => void;
}

const inputClass = `w-full rounded-lg border border-input bg-surface px-3 py-2
  text-sm text-text-main placeholder:text-text-mute
  focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent`;

/**
 * Переиспользуемая форма профиля (welcome-гейт + Настройки, S-ONBOARD-1).
 * onboarding: RPC complete_onboarding (серверный гард «имя обязательно» +
 * стемп onboarded_at) → редирект на дашборд. settings: прямой update под RLS
 * profiles_update_own, без редиректа. Аватар живёт отдельно (AvatarUpload
 * пишет сразу при выборе файла) — submit его не касается.
 */
export function ProfileForm({ mode, onDone }: ProfileFormProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', phone: '', job_title: '' },
  });

  // Префилл из профиля (в onboarding имя обычно пустое, но phone/job_title
  // могли остаться от прошлой незавершённой попытки).
  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name ?? '',
        phone: profile.phone ?? '',
        job_title: profile.job_title ?? '',
      });
    }
  }, [profile, reset]);

  const onSubmit = async (values: ProfileFormData) => {
    try {
      if (mode === 'onboarding') {
        const supabase = createClient();
        const { error } = await supabase.rpc('complete_onboarding', {
          p_full_name: values.full_name,
          p_phone: values.phone?.trim() || null,
          p_job_title: values.job_title?.trim() || null,
        });
        if (error) throw error;
        await Promise.all([
          qc.invalidateQueries({ queryKey: MY_PROFILE_KEY }),
          qc.invalidateQueries({ queryKey: ['org-role'] }),
          qc.invalidateQueries({ queryKey: ['team-members'] }),
        ]);
        router.replace('/');
      } else {
        await updateProfile.mutateAsync(values);
        toast.success('Профиль обновлён');
        onDone?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить профиль');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <AvatarUpload
        avatarUrl={profile?.avatar_url ?? null}
        fullName={profile?.full_name || ''}
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-text-dim">ФИО *</label>
        <input
          {...register('full_name')}
          autoFocus={mode === 'onboarding'}
          placeholder="Иван Петров"
          className={inputClass}
        />
        {errors.full_name && (
          <p className="mt-1 text-xs text-red">{errors.full_name.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-dim">Телефон</label>
        <input
          {...register('phone')}
          type="tel"
          placeholder="+7 900 000-00-00"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-dim">Должность</label>
        <input
          {...register('job_title')}
          placeholder="Менеджер проектов"
          className={inputClass}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {mode === 'settings' && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || (mode === 'settings' && !isDirty)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting
            ? 'Сохраняю…'
            : mode === 'onboarding'
              ? 'Продолжить'
              : 'Сохранить'}
        </button>
      </div>
    </form>
  );
}
