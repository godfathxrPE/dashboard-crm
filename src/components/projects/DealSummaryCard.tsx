'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { useCompletenessRules } from '@/lib/hooks/use-org-settings';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { RailCard, RailRow } from '@/components/shared/RailCard';
import { formatBudget } from '@/lib/validators/project';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1 (R-05): «Сводка» — property-list вместо четырёх боксов инфо-грида.
//
// Грид из четырёх карточек занимал полосу во всю ширину полотна ради четырёх
// значений, которые читают по необходимости. Здесь тот же состав живёт строками
// в рельсе: лейбл слева, значение справа, порядок фиксирован.
//
// Сюда же переехали из шапки страницы бейдж полноты (R-06: счётчик обязан стоять
// над полями, которые считает) и «Создан …» (R-11/F-09).
// ═══════════════════════════════════════════════════════

/** «Иванов И.» — в рельсе 320px полное ФИО режется чаще, чем читается. */
function shortName(first: string, last: string): string {
  const initial = first.trim().charAt(0);
  return initial ? `${last} ${initial}.` : last;
}

/**
 * Приглашение вместо прочерка (F-05): пустое поле выглядит пустым и зовёт
 * заполнить. Курсив — то же начертание, что у плейсхолдеров InlineEdit.
 */
function Placeholder({ onClick }: { onClick?: () => void }) {
  if (!onClick) return <span className="italic text-text-mute">+ Указать</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="italic text-text-mute transition-colors hover:text-accent"
    >
      + Указать
    </button>
  );
}

/**
 * Жёлтая точка у дорогой пустоты. Текст последствия берётся из правил полноты
 * (`rule.cost`), а не сочиняется здесь: иначе одно и то же поле объясняло бы
 * свою пустоту двумя разными фразами — в бейдже полноты и в строке.
 */
function CostDot({ cost }: { cost: string }) {
  return (
    <span
      title={cost}
      aria-label={cost}
      className="ml-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-yellow align-middle"
    />
  );
}

export interface DealSummaryCardProps {
  project: Project;
  /** Родительская сделка внедрения — у delivery занимает строку вместо бюджета. */
  parentDeal?: Project | null;
  isDelivery: boolean;
  /** Бейдж полноты — переехал из шапки страницы (R-06). */
  badge?: React.ReactNode;
  /** Открыть модалку редактирования: компания и контакт правятся только там. */
  onEdit?: () => void;
}

export function DealSummaryCard({
  project, parentDeal, isDelivery, badge, onEdit,
}: DealSummaryCardProps) {
  const updateProject = useUpdateProject();
  const rules = useCompletenessRules();
  const costOf = (key: string) => rules.find((r) => r.key === key && r.weight > 0)?.cost ?? null;
  const contactCost = costOf('contact_id');
  const budgetCost = costOf('budget');

  return (
    // id — якорь CTA сигнала `deadline` (SIGNAL_ANCHORS). Обёртка, а не сам
    // RailCard: примитив общий с карточкой компании и id ему не принадлежит.
    <div id="deal-summary">
      <RailCard icon={Info} title="Сводка" badge={badge}>
        <RailRow label="Компания" wrap>
          {project.company ? (
            <Link
              href={`/companies/${project.company_id}`}
              className="text-accent transition-colors hover:underline"
            >
              {project.company.name}
            </Link>
          ) : (
            <Placeholder onClick={onEdit} />
          )}
        </RailRow>

        <RailRow label="Контакт">
          {project.contact ? (
            <Link
              href={`/contacts/${project.contact_id}`}
              title={`${project.contact.first_name} ${project.contact.last_name}`}
              className="text-accent transition-colors hover:underline"
            >
              {shortName(project.contact.first_name, project.contact.last_name)}
            </Link>
          ) : (
            <>
              <Placeholder onClick={onEdit} />
              {contactCost && <CostDot cost={contactCost} />}
            </>
          )}
        </RailRow>

        {isDelivery ? (
          <RailRow label="Сделка" wrap>
            {project.parent_deal_id ? (
              <Link
                href={`/deals/${project.parent_deal_id}`}
                className="text-accent transition-colors hover:underline"
              >
                {parentDeal?.name ?? '…'}
              </Link>
            ) : (
              <span className="italic text-text-mute">—</span>
            )}
          </RailRow>
        ) : (
          <RailRow label="Бюджет">
            <span className="inline-flex items-center">
              <InlineEdit
                value={project.budget ? String(project.budget) : ''}
                type="number"
                placeholder="+ Указать"
                formatDisplay={(v) => formatBudget(Number(v))}
                onSave={async (val) => {
                  updateProject.mutate({ id: project.id, budget: val ? Number(val) : null });
                }}
                // F-05: приглашение того же начертания, что реальный бюджет,
                // пролистывалось как заполненное поле — отсюда курсив.
                className={cn(!project.budget && 'italic')}
              />
              {!project.budget && budgetCost && <CostDot cost={budgetCost} />}
            </span>
          </RailRow>
        )}

        <RailRow label="Дедлайн">
          <InlineEdit
            value={project.deadline ?? ''}
            type="date"
            placeholder="+ Установить"
            formatDisplay={(v) => {
              try {
                return new Date(v).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric',
                });
              } catch { return v; }
            }}
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, deadline: val || null });
            }}
            className={cn(!project.deadline && 'italic')}
          />
        </RailRow>

        <RailRow label="Создана">
          <span className="text-text-dim">
            {new Date(project.created_at).toLocaleDateString('ru-RU')}
          </span>
        </RailRow>
      </RailCard>
    </div>
  );
}
