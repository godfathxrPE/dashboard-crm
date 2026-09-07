'use client';

import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { QuotesTab } from './QuotesTab';
import { ProjectFiles } from './ProjectFiles';
import { useQuotes } from '@/lib/hooks/use-quotes';
import { useProjectFiles } from '@/lib/hooks/use-project-files';
import { QUOTE_STATUS_CONFIG } from '@/lib/validators/quote';
import { pluralRu } from '@/lib/utils/plural';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// S-DEAL-LAYOUT-1 (задача 3): орг. блок — контейнер для того, что раньше жило
// на вкладке «КП» (QuotesTab целиком) плюс список файлов из «Материалов».
// Только сделка (type='client') — у внедрения КП нет. Наполнение по спеке W4
// (срок действия, «Принято/Отклонено», ожидаемый файл) — СЛЕДУЮЩИЙ спринт
// S-DEAL-ORG-1, здесь только переезд существующего.
//
// `DealMaterialsCard` остаётся на рельсе зоны «Контекст» и продолжает открывать
// `ProjectMaterialsModal` — видео туда не переехали, только список файлов
// (разведка: для client-проекта модалка рисует ТОЛЬКО ProjectFiles + ProjectVideos,
// первое — сюда, видео остаются доступны через модалку).
//
// `useQuotes`/`useProjectFiles` вызваны здесь для сводки — тот же ключ кэша,
// что у `QuotesTab` и у `DealMaterialsCard` на рельсе: второго запроса нет.
// ═══════════════════════════════════════════════════════

export interface DealOrgBlockProps {
  project: Project;
  /** Деплинк ?tab=quotes (задача 4) — открыть блок и проскроллить к нему. */
  forceExpanded?: boolean;
}

export function DealOrgBlock({ project, forceExpanded }: DealOrgBlockProps) {
  const { data: quotes } = useQuotes(project.id);
  const { data: files } = useProjectFiles(project.id);

  const quotesCount = quotes?.length ?? 0;
  // useQuotes сортирует created_at desc — [0] и есть последнее КП.
  const latestQuote = quotes?.[0] ?? null;
  const filesCount = files?.length ?? 0;

  const summary = [
    latestQuote
      ? `КП v${quotesCount} · ${QUOTE_STATUS_CONFIG[latestQuote.status].label}`
      : 'КП нет',
    `${filesCount} ${pluralRu(filesCount, 'файл', 'файла', 'файлов')}`,
  ].join(' · ');

  return (
    <CollapsibleSection
      id="deal-org-block"
      projectId={project.id}
      sectionId="org"
      title="Организационный блок"
      summary={summary}
      defaultExpanded={false}
      forceExpanded={forceExpanded}
    >
      <div className="space-y-4">
        <QuotesTab deal={project} />
        <ProjectFiles projectId={project.id} />
      </div>
    </CollapsibleSection>
  );
}
