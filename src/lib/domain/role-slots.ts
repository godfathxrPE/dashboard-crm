import { STAKEHOLDER_ROLE_ORDER, STAKEHOLDER_ROLE_CONFIG } from '@/lib/constants/stakeholders';
import type { StakeholderRow } from '@/lib/hooks/use-deal-stakeholders';
import type { PipelineExpectedRole, StakeholderRole } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-DEAL-ROLES-1 (W10): сборка СЛОТОВ ролей контура сделки.
//
// Список стейкхолдеров отвечает «кто есть». Слоты отвечают «кого НЕ хватает» —
// и это второе есть работа пресейла: сделка на 2,8 млн с одним контактом рушится,
// когда контакт уходит в отпуск. Пустой слот ЛПР сам является сообщением.
//
// Чистая функция: ноль React, ноль запросов, ноль `Date.now()`. Вход — ожидания
// воронки (`pipeline_expected_roles`, 130), участники сделки и основной контакт;
// выход — слоты и `missingRequired` для сигнала `single_threaded`.
//
// ⚠️ Ожиданий нет (`expected` пуст) ⇒ прежнее поведение: единственный слот primary,
// все остальные в хвосте, `hasExpectations: false`. Виджет по этому флагу рисует
// плоский список, а сигнал считает по количеству, как до спринта. Это требование
// обратной совместимости: delivery-воронки и любые новые не должны молча получить
// пустые слоты и красный сигнал.
// ═══════════════════════════════════════════════════════

export interface RoleSlot<T extends StakeholderRow = StakeholderRow> {
  kind: 'primary' | 'role';
  /** null у слота primary: «основной контакт» — не роль из словаря, а projects.contact_id. */
  role: StakeholderRole | null;
  label: string;
  hint: string | null;
  isRequired: boolean;
  /**
   * Кто закрыл слот. У слота primary строки в `deal_stakeholders` может НЕ быть
   * (контакт сделки задан, а в карту его не добавляли) — тогда `filled: null`,
   * но слот считается закрытым: смотреть на `isFilled`, а не на `filled !== null`.
   */
  filled: T | null;
  isFilled: boolean;
  /** Только у primary без своей строки — чей это контакт. */
  virtualContactId: string | null;
}

export interface RoleSlotsResult<T extends StakeholderRow = StakeholderRow> {
  slots: RoleSlot<T>[];
  /** Число ЗАКРЫТЫХ СЛОТОВ, не людей: один человек закрывает и primary, и свою роль. */
  filledCount: number;
  totalCount: number;
  /** Незакрытые ОБЯЗАТЕЛЬНЫЕ роли — вход сигнала single_threaded. */
  missingRequired: StakeholderRole[];
  /** Ожидания для воронки не заданы — виджет рисует плоский список. */
  hasExpectations: boolean;
  /**
   * Кто не попал ни в один слот: без роли, сверх слота, либо с ролью, которой
   * воронка не ждёт. Люди НЕ теряются — уходят под слоты списком «Ещё в контуре».
   */
  rest: T[];
}

/** Подпись слота primary. Роли в словаре у неё нет — это поле «Контакт» сделки. */
export const PRIMARY_SLOT_LABEL = 'Основной контакт';

/** Порядок ролей внутри одного `sort_order` — тот же, что сортирует карту. */
function roleRank(role: StakeholderRole): number {
  const idx = STAKEHOLDER_ROLE_ORDER.indexOf(role);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/**
 * Слоты ролей для карточки сделки.
 *
 * @param expected          ожидания воронки (`usePipelineExpectedRoles`); пусто = ожиданий нет
 * @param stakeholders      участники сделки (`useDealStakeholders`)
 * @param primaryContactId  `projects.contact_id` — основной контакт сделки
 */
export function resolveRoleSlots<T extends StakeholderRow>(
  expected: readonly PipelineExpectedRole[],
  stakeholders: readonly T[],
  primaryContactId: string | null,
): RoleSlotsResult<T> {
  // Внутри роли слот закрывает ПЕРВЫЙ по `created_at` — тот же ключ, что у
  // sortStakeholders. Второй человек с той же ролью уходит в хвост, а не
  // затирает первого молча.
  const byCreated = [...stakeholders].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Кого уже израсходовали на слот. Ключ — id строки: один человек может закрыть
  // ДВА слота (primary и свою роль), поэтому «израсходован» считается по слотам,
  // а не по людям — иначе primary с ролью ЛПР оставил бы слот ЛПР пустым.
  const usedForRest = new Set<string>();

  // ── Слот primary: всегда первый, всегда есть ──
  const primaryRow = primaryContactId
    ? (byCreated.find((s) => s.contact_id === primaryContactId) ?? null)
    : null;
  // Закрыт, если контакт сделки ЗАДАН — даже когда строки в карте ещё нет
  // (легальное состояние 092: primary вычисляется, дублировать нечего).
  const primaryFilled = !!primaryContactId;
  if (primaryRow) usedForRest.add(primaryRow.id);

  const primarySlot: RoleSlot<T> = {
    kind: 'primary',
    role: null,
    label: PRIMARY_SLOT_LABEL,
    hint: null,
    // primary не «обязателен» в смысле сигнала: пустое поле «Контакт» — это забота
    // бейджа полноты сделки, а не контура ролей. Второй сигнал о том же факте —
    // правило «Два источника одного факта: вес и подпись, не слияние».
    isRequired: false,
    filled: primaryRow,
    isFilled: primaryFilled,
    virtualContactId: primaryFilled && !primaryRow ? primaryContactId : null,
  };

  if (expected.length === 0) {
    // Ожиданий нет — прежний плоский список: слот только primary, все, кто не он,
    // в хвосте.
    return {
      slots: [primarySlot],
      filledCount: primaryFilled ? 1 : 0,
      totalCount: 1,
      missingRequired: [],
      hasExpectations: false,
      rest: byCreated.filter((s) => !usedForRest.has(s.id)),
    };
  }

  // ── Слоты ожидаемых ролей ──
  const ordered = [...expected].sort(
    (a, b) => a.sort_order - b.sort_order || roleRank(a.role) - roleRank(b.role),
  );

  const missingRequired: StakeholderRole[] = [];
  const roleSlots: RoleSlot<T>[] = ordered.map((exp) => {
    // Человек БЕЗ роли не закрывает ничего: «в карте есть кто-то» — не то же самое,
    // что «роль закрыта», иначе слот ЛПР гас бы от любого добавленного контакта.
    const row = byCreated.find((s) => s.role === exp.role) ?? null;
    if (row) usedForRest.add(row.id);
    if (!row && exp.is_required) missingRequired.push(exp.role);

    return {
      kind: 'role' as const,
      role: exp.role,
      label: STAKEHOLDER_ROLE_CONFIG[exp.role]?.full ?? exp.role,
      hint: exp.hint,
      isRequired: exp.is_required,
      filled: row,
      isFilled: !!row,
      virtualContactId: null,
    };
  });

  const slots = [primarySlot, ...roleSlots];

  return {
    slots,
    // Считаются СЛОТЫ, не головы: один человек, который и primary, и ЛПР, закрывает
    // ДВА слота — иначе шапка «1 из 3» врала бы при двух закрытых ролях.
    filledCount: slots.filter((s) => s.isFilled).length,
    totalCount: slots.length,
    missingRequired,
    hasExpectations: true,
    rest: byCreated.filter((s) => !usedForRest.has(s.id)),
  };
}
