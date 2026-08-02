'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useCreateGroup, useRenameGroup, useDeleteGroup } from '@/lib/hooks/use-conversations';
import {
  useConversationMembers,
  useAddMembers,
  useRemoveMember,
} from '@/lib/hooks/use-conversation-members';
import {
  groupConversationSchema,
  GROUP_TITLE_MAX,
  type GroupConversationFormValues,
} from '@/lib/validators/conversation';
import { useAuth } from '@/lib/hooks/use-auth';
import type { Conversation } from '@/types/entities';

const labelCls = 'block text-meta font-medium text-text-dim mb-1';
const inputCls =
  'w-full rounded border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none';
const errCls = 'mt-1 text-meta text-red';

/** Сколько живёт inline-подтверждение удаления, прежде чем откатиться в обычную кнопку. */
const CONFIRM_TTL_MS = 5000;

interface GroupModalProps {
  /** Есть — режим редактирования; нет — создание. */
  conversation?: Conversation | null;
  onClose: () => void;
  /** Создали группу: вызывающий открывает новый канал. */
  onCreated?: (conversationId: string) => void;
  /** Удалили группу: вызывающий уводит с канала (снимает `?c=`). */
  onDeleted?: () => void;
}

/**
 * S-CHAT-HUB-1c: создание и редактирование группы — ОДНА модалка (режим по наличию
 * `conversation`). Форма и список участников в обоих режимах одни и те же; разница
 * только в том, откуда приходят значения и что делает submit.
 *
 * Модалка лежит в фиче-папке `components/chat/`, а не в `components/modals/` — конвенция
 * проекта (learnings).
 *
 * Состав в режиме редактирования применяется ОДНИМ submit'ом (diff → добавить/убрать),
 * а не по клику на каждую галочку: иначе «Отмена» в футере не отменяла бы уже
 * отправленные изменения, а isDirty-guard модалки врал бы про несохранённое.
 *
 * АВТОРА ИЗ ГРУППЫ НЕ УБРАТЬ (строка списка отключена, даже когда редактирует админ):
 * `created_by` не меняется, и вышедший автор сохранил бы право управлять группой,
 * которую перестал видеть. Тот же запрет, что на кнопку «Выйти» у автора.
 */
export function GroupModal({ conversation, onClose, onCreated, onDeleted }: GroupModalProps) {
  const isEdit = !!conversation;
  const { user } = useAuth();
  const myId = user?.id ?? null;
  // В создании автор — я; в редактировании — тот, кто завёл группу (created_by может
  // быть NULL только у системных каналов, сюда они не попадают).
  const authorId = isEdit ? conversation!.created_by : myId;

  const { data: team = [] } = useTeamMembers();
  const { members, isLoading: membersLoading } = useConversationMembers(
    conversation?.id ?? null,
    isEdit,
  );

  const createGroup = useCreateGroup();
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();
  const addMembers = useAddMembers(conversation?.id ?? '');
  const removeMember = useRemoveMember(conversation?.id ?? '');

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Подтверждение живёт 5 секунд и само откатывается — window.confirm в проекте
  // запрещён (блокирует браузерные смоки, грабля GanttTimeline).
  useEffect(() => {
    if (!confirmingDelete) return;
    confirmTimer.current = setTimeout(() => setConfirmingDelete(false), CONFIRM_TTL_MS);
    return () => clearTimeout(confirmTimer.current);
  }, [confirmingDelete]);

  /** Текущий состав без автора — форма оперирует только теми, кого можно снять. */
  const currentMemberIds = useMemo(
    () => members.map((m) => m.profile_id).filter((id) => id !== authorId),
    [members, authorId],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<GroupConversationFormValues>({
    resolver: zodResolver(groupConversationSchema),
    defaultValues: { title: conversation?.title ?? '', memberIds: [] },
  });

  // Состав приезжает вторым запросом — до него форма не знает начальных галочек.
  // reset (а не setValue) держит isDirty честным: подгрузка состава не «правка».
  const membersReady = !isEdit || !membersLoading;
  useEffect(() => {
    if (!membersReady) return;
    reset({ title: conversation?.title ?? '', memberIds: currentMemberIds });
    // currentMemberIds пересобирается при каждом изменении кеша состава; ключ —
    // содержимое, а не ссылка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersReady, conversation?.id, conversation?.title, currentMemberIds.join(',')]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (!isEdit) {
        const id = await createGroup.mutateAsync({
          title: values.title,
          memberIds: values.memberIds,
        });
        toast.success('Группа создана');
        onCreated?.(id);
        onClose();
        return;
      }

      const next = new Set(values.memberIds);
      const prev = new Set(currentMemberIds);
      const toAdd = team.filter((m) => next.has(m.id) && !prev.has(m.id));
      const toRemove = currentMemberIds.filter((id) => !next.has(id));

      if (values.title.trim() !== (conversation!.title ?? '')) {
        await renameGroup.mutateAsync({ id: conversation!.id, title: values.title });
      }
      if (toAdd.length > 0) {
        await addMembers.mutateAsync(
          toAdd.map((m) => ({ id: m.id, full_name: m.full_name, avatar_url: m.avatar_url })),
        );
      }
      // Последовательно, а не Promise.all: параллельные DELETE по одной таблице ради
      // двух-трёх строк выигрывают миллисекунды, но частичный провал разъезжается
      // с оптимистичным кешем (урок useShiftTasks — allSettled не атомарен).
      for (const id of toRemove) {
        await removeMember.mutateAsync(id);
      }
      toast.success('Группа обновлена');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить группу');
    }
  });

  const onDelete = async () => {
    if (!conversation) return;
    try {
      await deleteGroup.mutateAsync(conversation.id);
      toast.success('Группа удалена');
      onDeleted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить группу');
    }
  };

  const busy = isSubmitting || deleteGroup.isPending;

  return (
    <Modal
      title={isEdit ? 'Настройки группы' : 'Новая группа'}
      description={
        isEdit
          ? 'Название и состав. Удаление уносит переписку без возврата.'
          : 'Канал под задачу — не привязан к проекту'
      }
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface-hover"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="group-form"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <form id="group-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="group-title">Название</label>
          <input
            id="group-title"
            className={inputCls}
            placeholder="Запуск обновления"
            maxLength={GROUP_TITLE_MAX}
            {...register('title')}
          />
          {errors.title && <p className={errCls}>{errors.title.message}</p>}
        </div>

        <div>
          <span className={labelCls}>Участники</span>
          <Controller
            control={control}
            name="memberIds"
            render={({ field }) => (
              <div className="max-h-64 space-y-0.5 overflow-y-auto rounded border border-border p-1">
                {team.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-text-mute">
                    В организации пока только вы
                  </p>
                )}
                {team.map((m) => {
                  const isAuthor = m.id === authorId;
                  const checked = isAuthor || field.value.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-surface2 ${
                        isAuthor ? 'cursor-default opacity-70' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAuthor}
                        onChange={(e) => {
                          field.onChange(
                            e.target.checked
                              ? [...field.value, m.id]
                              : field.value.filter((id) => id !== m.id),
                          );
                        }}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-main">{m.full_name}</span>
                      {isAuthor && (
                        <span className="shrink-0 text-meta text-text-mute">
                          {m.id === myId ? 'вы, автор' : 'автор'}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          />
          <p className="mt-1 text-meta text-text-mute">
            Автор группы остаётся в ней всегда. Группа из одного человека — валидна.
          </p>
        </div>

        {isEdit && (
          <div className="rounded-lg border border-border bg-surface2 p-3">
            {confirmingDelete ? (
              <>
                <p className="flex items-start gap-2 text-xs text-text-dim">
                  <Users size={13} className="mt-0.5 shrink-0 text-text-mute" aria-hidden="true" />
                  Точно удалить «{conversation!.title}»? Переписка группы уйдёт вместе с ней,
                  восстановить нельзя.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={deleteGroup.isPending}
                    className="rounded border border-border px-2.5 py-1 text-xs text-red transition-colors hover:bg-surface-hover disabled:opacity-50"
                  >
                    Точно удалить?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded border border-border px-2.5 py-1 text-xs text-text-dim transition-colors hover:bg-surface-hover"
                  >
                    Отмена
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded border border-border px-2.5 py-1 text-xs text-red transition-colors hover:bg-surface-hover"
              >
                Удалить группу
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
