'use client';

import { useState } from 'react';
import { ChevronDown, Hash, MessagesSquare, Plus, Users } from 'lucide-react';
import { useConversations, type ConversationListItem } from '@/lib/hooks/use-conversations';
import { partitionChannels } from '@/lib/utils/chat-channels';
import { GroupModal } from '@/components/chat/GroupModal';
import { mskDateKey, mskDayMonth, mskTime } from '@/lib/utils/date-helpers';
import { cn } from '@/lib/utils/cn';

interface ChannelListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * S-CHAT-HUB-1b: левая панель хаба.
 *
 * Раскладка (решение спринта): общий канал всегда сверху и отделён; ниже — проектные
 * каналы с сообщениями по свежести; пустые проектные всегда прячутся за
 * «Показать все проекты (N)». Каналы заводит сидер на каждый проект, поэтому список,
 * где 17 из 19 строк пустые, — это шум, а не навигация.
 *
 * Ревью спринта нашло расхождение: в задаче 3 было «если непустых нет вообще —
 * показываем всё без кнопки», в EDGE CASES — «общий + кнопка (17)». Принят вариант
 * EDGE: правило одно во всех состояниях, и первый экран не открывается 18 строками.
 * Кнопка сама объясняет, где проекты.
 *
 * S-CHAT-HUB-1c: появились ГРУППЫ. Они идут в основной список ВСЕГДА, даже пустые, и
 * за кнопку не прячутся: кнопка существует из-за сидера проектов, а группу человек
 * только что завёл руками — прятать её до первого сообщения значит прятать результат
 * только что сделанного действия. Раскладка считается в `partitionChannels` (покрыта
 * тестами), тип канала виден иконкой: Users у группы, Hash у проекта.
 */
export function ChannelList({ activeId, onSelect }: ChannelListProps) {
  const { conversations, isLoading } = useConversations();
  const [showEmpty, setShowEmpty] = useState(false);
  const [creating, setCreating] = useState(false);

  const { general, live, emptyProjects } = partitionChannels(conversations);

  return (
    <nav aria-label="Каналы" className="flex h-full flex-col overflow-y-auto p-2">
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2 px-1">
        <span className="text-meta font-medium uppercase tracking-wide text-text-mute">Каналы</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-text-dim
                     transition-colors hover:bg-surface2 hover:text-text-main"
        >
          <Plus size={13} aria-hidden="true" />
          Новая группа
        </button>
      </div>

      {isLoading ? (
        <p className="p-2 text-xs text-text-mute">Загрузка...</p>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-6">
          <MessagesSquare size={18} className="text-text-mute" aria-hidden="true" />
          <p className="text-center text-xs text-text-mute">Каналов пока нет</p>
        </div>
      ) : (
        <>
          {general && (
            <>
              <ChannelRow item={general} activeId={activeId} onSelect={onSelect} />
              <div className="my-2 border-t border-border/50" />
            </>
          )}

          {live.map((item) => (
            <ChannelRow
              key={item.conversation.id}
              item={item}
              activeId={activeId}
              onSelect={onSelect}
            />
          ))}

          {emptyProjects.length > 0 && !showEmpty && (
            <button
              type="button"
              onClick={() => setShowEmpty(true)}
              aria-expanded={false}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-text-mute
                         transition-colors hover:bg-surface2 hover:text-text-main"
            >
              <ChevronDown size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">Показать все проекты ({emptyProjects.length})</span>
            </button>
          )}

          {showEmpty &&
            emptyProjects.map((item) => (
              <ChannelRow
                key={item.conversation.id}
                item={item}
                activeId={activeId}
                onSelect={onSelect}
              />
            ))}
        </>
      )}

      {creating && (
        <GroupModal
          onClose={() => setCreating(false)}
          // Открываем свежую группу сразу: иначе она приезжает в конец списка живых
          // каналов (сообщений в ней нет) и выглядит как «ничего не произошло».
          onCreated={(id) => onSelect(id)}
        />
      )}
    </nav>
  );
}

/**
 * Строка канала. Время последнего сообщения — по МСК: сегодня → «ЧЧ:ММ», иначе «ДД.ММ»
 * (форматтеры из date-helpers, не свои). Непрочитанное — точка, а не число: в
 * `conversation_reads` лежит `last_read_at`, счётчика сообщений мы не знаем.
 */
function ChannelRow({
  item,
  activeId,
  onSelect,
}: {
  item: ConversationListItem;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const id = item.conversation.id;
  const isActive = id === activeId;
  const stamp = formatStamp(item.lastMessageAt);
  // Группу от проектного канала отличает иконка, а не текстовая пометка: строка узкая,
  // и подпись «группа» съела бы место у названия.
  const Icon = item.conversation.kind === 'group' ? Users : Hash;

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      data-active={isActive ? '' : undefined}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        isActive
          ? 'bg-surface2 font-medium text-text-main'
          : 'text-text-dim hover:bg-surface2 hover:text-text-main',
      )}
    >
      <Icon size={13} className="shrink-0 text-text-mute" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {stamp && (
        <span className="shrink-0 text-meta tabular-nums text-text-mute">{stamp}</span>
      )}
      {item.hasUnread && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
          aria-label="Есть непрочитанное"
        />
      )}
    </button>
  );
}

function formatStamp(iso: string | null): string | null {
  if (!iso) return null;
  return mskDateKey(iso) === mskDateKey(new Date()) ? mskTime(iso) : mskDayMonth(iso);
}
