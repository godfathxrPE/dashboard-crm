'use client';

import { FolderOpen } from 'lucide-react';
import { useProjectFiles } from '@/lib/hooks/use-project-files';
import { useProjectVideos } from '@/lib/hooks/use-project-videos';
import { RailCard, RailRow } from '@/components/shared/RailCard';
import type { Project } from '@/lib/hooks/use-projects';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-DEAL-CTX-1 (R-08): материалы сведены к четырём строкам в рельсе.
//
// Цена решения, принятая осознанно: раньше `ProjectFiles`/`ProjectVideos`
// монтировались только при раскрытии аккордеона, то есть списки не грузились,
// пока их не открыли. Теперь оба хука зовутся на КАЖДОЙ карточке — это два
// запроса, которых раньше не было.
//
// `count: 'exact'` ради счётчиков не заводится: в проекте такого паттерна нет
// ни одного, а выигрыш мнимый — те же списки нужны модалке, и при общем ключе
// кеша она получит данные без второго запроса. Один запрос на список дешевле,
// чем count плюс список.
// ═══════════════════════════════════════════════════════

export interface DealMaterialsCardProps {
  project: Project;
  isDelivery: boolean;
  onOpen: () => void;
}

/** Значение строки: ноль/пусто — приглушённо, но строка всё равно кликабельна. */
function Value({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={cn(muted && 'italic text-text-mute')}>{children}</span>;
}

export function DealMaterialsCard({
  project, isDelivery, onOpen,
}: DealMaterialsCardProps) {
  const projectId = project.id;
  const { data: files } = useProjectFiles(projectId);
  const { data: videos } = useProjectVideos(projectId);
  const fileCount = files?.length ?? 0;
  const videoCount = videos?.length ?? 0;
  // Заметка команды живёт в «Материалах» только у delivery/internal: у сделки то же
  // поле `pinned_note` уже редактируется карточкой «Закреплено» в этой же рельсе.
  const hasTeamNote = isDelivery || project.type === 'internal';

  return (
    // Кликабельна вся карточка, включая строки с нулём: ноль — повод открыть и
    // добавить первое, а не причина запретить клик.
    <button
      type="button"
      onClick={onOpen}
      aria-label="Открыть материалы проекта"
      className="block w-full rounded-lg text-left transition-opacity hover:opacity-90"
    >
      <RailCard icon={FolderOpen} title="Материалы">
        {isDelivery && (
          <RailRow label="1С:ДО">
            {project.do_url
              ? <Value>привязан</Value>
              : <Value muted>привязать</Value>}
          </RailRow>
        )}
        {hasTeamNote && (
          <RailRow label="Заметки">
            {project.pinned_note
              ? <Value>есть</Value>
              : <Value muted>—</Value>}
          </RailRow>
        )}
        <RailRow label="Файлы">
          <Value muted={fileCount === 0}>{fileCount}</Value>
        </RailRow>
        <RailRow label="Видео">
          <Value muted={videoCount === 0}>{videoCount}</Value>
        </RailRow>
      </RailCard>
    </button>
  );
}
