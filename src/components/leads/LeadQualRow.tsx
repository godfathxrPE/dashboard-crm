'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { useUpdateLead } from '@/lib/hooks/use-leads';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { LEAD_BUDGET_STATUS_CONFIG } from '@/lib/validators/lead';
import { STAKEHOLDER_ROLE_CONFIG, STAKEHOLDER_ROLE_ORDER } from '@/lib/constants/stakeholders';
import { CHZ_GROUP_NAMES } from '@/lib/constants/chz';
import { parseBudgetInput } from '@/lib/validators/project';
import type { LeadQualItem } from '@/lib/domain/lead-qualification';
import type { Lead, LeadBudgetStatus, StakeholderRole } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-WORK-1 (спека §5, F-04/F-05): строка зоны «Осталось выяснить».
//
// Лейбл → замок/следствие → контрол ПОД ними. Контрол у дальнего края строки
// (прежний `justify-between`) глаз не связывал с вопросом — F-05.
//
// Каждый пункт отвечается там, где спрошен (F-04): «Заполнить» → `LeadModal`
// убран, полная форма живёт на карандаше шапки. Запись — одна мутация
// `useUpdateLead` на ответ; оптимистичный апдейт в хуке пересчитывает
// `qualifyLead`, и пункт сам уезжает в «Известно» — руками строка не прячется.
// ═══════════════════════════════════════════════════════

/** Кнопка-вариант: ответ одним кликом. */
const OPTION_BTN =
  'h-7 rounded-[0.5625rem] border border-border2 bg-surface px-2.5 text-xs font-medium text-text-main ' +
  'transition-colors hover:bg-surface2';

/** Триггер свободного ввода — как у обязательных пунктов до спринта. */
const WRITE_BTN = 'rounded-lg border border-accent px-2.5 py-1 text-xs text-accent no-underline hover:no-underline';

/** `unknown` — это «не выяснен», ответом он быть не может. */
const BUDGET_OPTIONS: LeadBudgetStatus[] = ['none', 'estimated', 'confirmed'];

/**
 * Быстрые роли. Все семь кнопок в строке ~300px переносились в три ряда, поэтому
 * три частых — кнопками, остальное — «ещё…». CHECK `leads_decision_role_check`
 * допускает все семь ролей (разведка 27.09), фильтровать словарь не нужно.
 */
const QUICK_ROLES: StakeholderRole[] = ['decision_maker', 'influencer', 'end_user'];

export function LeadQualRow({ item, lead }: { item: LeadQualItem; lead: Lead }) {
  return (
    <div className="min-w-0">
      <div className="text-body font-semibold text-text-main">{item.label}</div>
      {item.required ? (
        <div
          className="mt-0.5 flex items-center gap-1 text-meta"
          style={{ color: 'var(--yellow-text, var(--yellow))' }}
        >
          <Lock size={11} aria-hidden /> держит конверсию
        </div>
      ) : (
        <div className="mt-0.5 text-meta text-text-mute">{item.hint}</div>
      )}
      <div className="mt-2">
        <QualControl item={item} lead={lead} />
      </div>
    </div>
  );
}

function QualControl({ item, lead }: { item: LeadQualItem; lead: Lead }) {
  const update = useUpdateLead();

  switch (item.key) {
    case 'pain':
      return (
        <InlineEdit
          value={lead.pain ?? ''}
          as="textarea"
          placeholder="Записать"
          className={WRITE_BTN}
          onSave={async (val) => {
            update.mutate({ id: lead.id, pain: val.trim() || null });
          }}
        />
      );

    case 'budget':
      return (
        <div className="flex flex-wrap gap-1.5">
          {BUDGET_OPTIONS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => update.mutate({ id: lead.id, budget_status: b })}
              className={OPTION_BTN}
            >
              {LEAD_BUDGET_STATUS_CONFIG[b].label}
            </button>
          ))}
        </div>
      );

    case 'role':
      return (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => update.mutate({ id: lead.id, decision_role: r })}
              className={OPTION_BTN}
            >
              {STAKEHOLDER_ROLE_CONFIG[r].label}
            </button>
          ))}
          {/* Управляемый с `value=""`: выбор сразу пишет, строка уезжает в «Известно»,
              и возвращать селект к «ещё…» руками не нужно. */}
          <select
            value=""
            aria-label="Другая роль контакта"
            onChange={(e) => {
              const role = e.target.value as StakeholderRole;
              if (role) update.mutate({ id: lead.id, decision_role: role });
            }}
            // Ширина фиксирована: нативный select растягивается по самой длинной
            // опции («Чемпион — продаёт внутри») и уезжал на второй ряд.
            className={`${OPTION_BTN} w-[5.5rem] text-text-dim`}
          >
            <option value="">ещё…</option>
            {STAKEHOLDER_ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {STAKEHOLDER_ROLE_CONFIG[r].full}
              </option>
            ))}
          </select>
        </div>
      );

    case 'chz':
      return (
        <ChzGroupsPicker
          value={lead.chz_groups}
          onCommit={(next) => update.mutate({ id: lead.id, chz_groups: next })}
        />
      );

    case 'deadline':
      return (
        <InlineEdit
          value={lead.regulatory_deadline ?? ''}
          type="date"
          placeholder="Указать дату"
          className={`${OPTION_BTN} inline-flex items-center`}
          onSave={async (val) => {
            update.mutate({ id: lead.id, regulatory_deadline: val || null });
          }}
        />
      );

    case 'value':
      return <ValueInput onSave={(kopecks) => update.mutate({ id: lead.id, estimated_value: kopecks })} />;
  }
}

/**
 * Оценка суммы: рубли в поле → копейки через `parseBudgetInput` (как в `LeadModal`,
 * те же суффиксы «млн»/«тыс»). Пустое или невалидное — «Сохранить» настоящий
 * `disabled` (CLAUDE.md, «Disabled-состояние»), а не серый на вид.
 */
function ValueInput({ onSave }: { onSave: (kopecks: number) => void }) {
  const [raw, setRaw] = useState('');
  const parsed = parseBudgetInput(raw);
  const valid = parsed != null && parsed > 0;

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(parsed);
      }}
    >
      <input
        type="text"
        inputMode="decimal"
        placeholder="1 800 000"
        aria-label="Оценка суммы, ₽"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="h-7 w-32 min-w-0 rounded-[0.5625rem] border border-border2 bg-surface px-2.5 text-xs
                   tabular-nums text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={!valid}
        className={`${OPTION_BTN} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface`}
      >
        Сохранить
      </button>
    </form>
  );
}

/**
 * Группы ЧЗ из справочника, мультивыбор. `Combobox` мультивыбора не умеет
 * (разведка), поэтому — простой список с чекбоксами, без новой библиотеки.
 *
 * ⚠️ Запись — по ЗАКРЫТИЮ поповера, не на каждый чекбокс: иначе первая же галка
 * закрыла бы пункт, строка уехала бы в «Известно» вместе с поповером, и вторую
 * группу было бы не выбрать. Пустой выбор → `null` (правило `toggleChz`:
 * «не выяснено» и «групп нет» — разные вещи, NULL против '{}').
 *
 * ⚠️ Список — порталом с `position: fixed`, как у `Combobox`. Абсолютный внутри
 * листа проигрывал бы слою: в стеклянных темах у `.sheet` `backdrop-filter`, это
 * свой контекст наложения, и следующий лист («Активность») рисовался бы поверх.
 */
function ChzGroupsPicker({
  value,
  onCommit,
}: {
  value: string[] | null;
  onCommit: (next: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Свежие значения для обработчиков документа — без переподписки на каждую галку.
  const stateRef = useRef({ draft, value, onCommit });
  stateRef.current = { draft, value, onCommit };

  function close() {
    const { draft: d, value: v, onCommit: commit } = stateRef.current;
    setOpen(false);
    const before = [...(v ?? [])].sort().join('\n');
    const after = [...d].sort().join('\n');
    if (before !== after) commit(d.length > 0 ? d : null);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // `close` читает состояние через ref — подписка живёт, пока поповер открыт.
  }, [open]);

  // Позиция от кнопки; скролл страницы и ресайз двигают якорь — пересчёт.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  function toggle(group: string) {
    setDraft((d) => (d.includes(group) ? d.filter((g) => g !== group) : [...d, group]));
  }

  return (
    <div ref={rootRef} className="inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close();
          } else {
            setDraft(value ?? []);
            setOpen(true);
          }
        }}
        className={`${OPTION_BTN} border-dashed text-text-dim`}
      >
        + Группа из справочника
        {open && draft.length > 0 && <span className="ml-1 tabular-nums">· {draft.length}</span>}
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          role="listbox"
          aria-multiselectable
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1100 }}
          className="max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border
                     bg-surface p-1 shadow-lg"
        >
          {CHZ_GROUP_NAMES.map((g) => {
            const checked = draft.includes(g);
            return (
              <label
                key={g}
                role="option"
                aria-selected={checked}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-text-main
                           transition-colors hover:bg-surface2"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(g)}
                  className="accent-[var(--accent)]"
                />
                {g}
              </label>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
