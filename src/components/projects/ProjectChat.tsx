'use client';

import { MessageCircle } from 'lucide-react';
import { useProjectConversation } from '@/lib/hooks/use-conversations';
import { MessageThread } from '@/components/chat/MessageThread';

interface ProjectChatProps {
  projectId: string;
}

/** Карточка-обёртка для состояний «канал ещё не загружен» / «канала нет». */
function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">Чат проекта</span>
      </div>
      <div className="flex h-[min(55vh,40rem)] items-center justify-center rounded-[var(--radius-m)] border border-border/50 bg-bg px-3 py-2">
        {children}
      </div>
    </div>
  );
}

/**
 * S-CHAT-HUB-1a: вкладка «Чат» на карточке — тонкая обёртка над тредом канала.
 *
 * Сам тред (лента, composer, правка/удаление, реакции) живёт в `MessageThread` и не
 * знает про проекты: его источник — conversation. Хаб 1b откроет ТУ ЖЕ conversation —
 * один источник сообщений, две точки входа.
 */
export function ProjectChat({ projectId }: ProjectChatProps) {
  const { conversation, isLoading, isError } = useProjectConversation(projectId);

  if (isLoading) {
    return (
      <ChatShell>
        <p className="text-xs text-text-mute">Загрузка...</p>
      </ChatShell>
    );
  }

  // Канала нет — либо запрос упал, либо проект создан в обход сидера/бэкфилла 094
  // (не должно случаться). Пустой экран без объяснения хуже, чем честная заглушка;
  // в консоль кладём projectId, чтобы случай было чем чинить.
  if (isError || !conversation) {
    if (!isError) console.warn(`[chat] нет канала для проекта ${projectId}`);
    return (
      <ChatShell>
        <p className="text-xs text-text-mute">Чат недоступен</p>
      </ChatShell>
    );
  }

  return <MessageThread conversationId={conversation.id} />;
}
