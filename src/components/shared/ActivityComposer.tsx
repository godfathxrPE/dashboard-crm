'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { useLogActivity } from '@/lib/hooks/use-activity-log';

// ═══════════════════════════════════════════════════════
// ActivityComposer — ввод заметки (comment_added) для любой сущности.
// S-NOTES-TIMELINE-1: вынесен из ProjectDetail в shared, чтобы стоять на
// сделке, контакте и компании. entityType выбирает FK-колонку activity_log;
// read-часть — в <EntityTimeline> (includeSystem). Инвалидацию ленты
// (['timeline']) делает useLogActivity.
// ═══════════════════════════════════════════════════════

type Entity = 'project' | 'contact' | 'company';

const FK_KEY: Record<Entity, 'project_id' | 'contact_id' | 'company_id'> = {
  project: 'project_id',
  contact: 'contact_id',
  company: 'company_id',
};

interface ActivityComposerProps {
  entityType: Entity;
  entityId: string;
}

export function ActivityComposer({ entityType, entityId }: ActivityComposerProps) {
  const logMutation = useLogActivity();
  const [comment, setComment] = useState('');

  function handleAddComment() {
    const text = comment.trim();
    if (!text) return;
    logMutation.mutate(
      { [FK_KEY[entityType]]: entityId, event_type: 'comment_added', payload: { text } },
      { onSuccess: () => setComment('') },
    );
  }

  return (
    <div className="mb-4 flex gap-2">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Добавить комментарий..."
        rows={1}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); }
        }}
        className="flex-1 resize-none rounded-lg border border-input bg-bg px-3 py-1.5
                   text-sm text-text-main placeholder:text-text-mute
                   focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        onClick={handleAddComment}
        disabled={!comment.trim() || logMutation.isPending}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white
                   transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Send size={14} />
      </button>
    </div>
  );
}
