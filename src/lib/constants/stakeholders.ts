import type { BadgeColor } from '@/components/ui/Badge';
import type { StakeholderRole } from '@/types/database';

/**
 * S-R2-D3: словарь ролей в сделке (миграция 092).
 *
 * Зеркало CHECK `deal_stakeholders_role_chk` и union `StakeholderRole`. Значения
 * меняются ТОЛЬКО вместе с CHECK — расхождение даёт 23514 при записи.
 */

/** Порядок = убывание влияния на сделку. Им же сортируется карта (sortStakeholders). */
export const STAKEHOLDER_ROLE_ORDER: readonly StakeholderRole[] = [
  'decision_maker',
  'economic_buyer',
  'champion',
  'expert',
  'end_user',
  'blocker',
];

/**
 * Ярлыки и цвета бейджей. `color` типизирован сразу `BadgeColor`, а не `string` —
 * иначе каждое место рендера пришлось бы кастовать (хвост #7).
 */
export const STAKEHOLDER_ROLE_CONFIG: Record<
  StakeholderRole,
  { label: string; color: BadgeColor }
> = {
  decision_maker: { label: 'ЛПР', color: 'red' },
  economic_buyer: { label: 'Держатель бюджета', color: 'accent' },
  champion: { label: 'Чемпион', color: 'green' },
  expert: { label: 'Технический эксперт', color: 'blue' },
  end_user: { label: 'Конечный пользователь', color: 'purple' },
  blocker: { label: 'Блокер', color: 'yellow' },
};

/** Подпись строки без роли — не пустое место, а подсказка «поле стоит заполнить». */
export const STAKEHOLDER_ROLE_EMPTY_LABEL = 'роль не указана';
