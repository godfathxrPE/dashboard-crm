'use client';

import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { QuotesTab } from './QuotesTab';
import { ProjectFiles } from './ProjectFiles';
import { ActiveQuoteCard } from './ActiveQuoteCard';
import { DealWaitingList } from './DealWaitingList';
import { useQuotes } from '@/lib/hooks/use-quotes';
import { useProjectFiles } from '@/lib/hooks/use-project-files';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { QUOTE_STATUS_CONFIG } from '@/lib/validators/quote';
import { pickActiveQuote, quoteVersionMap } from '@/lib/domain/quote-version';
import { pluralRu } from '@/lib/utils/plural';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// S-DEAL-LAYOUT-1 (задача 3): орг. блок — контейнер для того, что раньше жило
// на вкладке «КП» (QuotesTab целиком) плюс список файлов из «Материалов».
// Только сделка (type='client') — у внедрения КП нет.
//
// S-DEAL-ORG-1 (W4): наполнение по спеке. Две колонки (КП | материалы),
// карточка АКТИВНОГО КП с решением в один клик над списком, список «Ждём» под
// материалами. Разбор решений — в шапках `ActiveQuoteCard` и `DealWaitingList`.
//
// `DealMaterialsCard` остаётся на рельсе зоны «Контекст» и продолжает открывать
// `ProjectMaterialsModal` — видео туда не переехали, только список файлов
// (разведка: для client-проекта модалка рисует ТОЛЬКО ProjectFiles + ProjectVideos,
// первое — сюда, видео остаются доступны через модалку).
//
// `useQuotes`/`useProjectFiles` вызваны здесь для сводки — тот же ключ кэша,
// что у `QuotesTab` и у `DealMaterialsCard` на рельсе: второго запроса нет.
//
// ⚠️ ВЕРСИЯ В СВОДКЕ — ВЫЧИСЛЯЕМАЯ, НЕ `quotes.length`. До S-DEAL-ORG-1 строка
// печатала `КП v${quotesCount}` — число КП вместо версии; на трёх КП активное
// второе подписывалось «v3». Источник числа один на все три места (свёрнутая
// строка, карточка, подпись «заменён») — `quoteVersionMap`.
// ═══════════════════════════════════════════════════════

export interface DealOrgBlockProps {
  project: Project;
  /** Деплинк ?tab=quotes (задача 4) — открыть блок и проскроллить к нему. */
  forceExpanded?: boolean;
}

export function DealOrgBlock({ project, forceExpanded }: DealOrgBlockProps) {
  const { data: quotes } = useQuotes(project.id);
  const { data: files } = useProjectFiles(project.id);
  const { data: orgRole } = useOrgRole();

  // Тот же гейт, что у остальных правок КП в `QuotesTab`: РОЛЬ org (RLS 053),
  // а не `canManage` — org-manager без владения сделкой имеет write по RLS.
  const canEditQuotes = orgRole === 'owner' || orgRole === 'admin' || orgRole === 'manager';

  const active = pickActiveQuote(quotes ?? []);
  const activeVersion = active ? (quoteVersionMap(quotes ?? []).get(active.id) ?? 1) : null;
  const filesCount = files?.length ?? 0;

  const summary = [
    active && activeVersion
      ? `КП v${activeVersion} · ${QUOTE_STATUS_CONFIG[active.status].label}`
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
      <div className="deal-org-split">
        <div className="deal-org-cols">
          <div className="min-w-0">
            <ActiveQuoteCard
              deal={project}
              quotes={quotes ?? []}
              canEditQuotes={canEditQuotes}
            />
            <QuotesTab deal={project} />
          </div>
          <div className="min-w-0">
            <ProjectFiles projectId={project.id} />
            <DealWaitingList projectId={project.id} />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
