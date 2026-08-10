'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  leadFormSchema,
  leadSources,
  leadTemperatures,
  leadBudgetStatuses,
  LEAD_SOURCE_CONFIG,
  LEAD_TEMPERATURE_CONFIG,
  LEAD_BUDGET_STATUS_CONFIG,
  type LeadFormData,
} from '@/lib/validators/lead';
import { formatBudget, parseBudgetInput } from '@/lib/validators/project';
import { STAKEHOLDER_ROLE_CONFIG, STAKEHOLDER_ROLE_ORDER } from '@/lib/constants/stakeholders';
import { CHZ_GROUPS } from '@/lib/data/chz-groups';
import { useCreateLead, useUpdateLead } from '@/lib/hooks/use-leads';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { Modal } from '@/components/shared/Modal';
import { cn } from '@/lib/utils/cn';
import type { Lead } from '@/types/database';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editLead: Lead | null;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main ' +
  'placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

/** Названия групп ЧЗ без дублей (одна группа приходит из нескольких префиксов ОКВЭД). */
const CHZ_GROUP_NAMES = [...new Set(CHZ_GROUPS.map((g) => g.group))].sort((a, b) => a.localeCompare(b, 'ru'));

const EMPTY_FORM: LeadFormData = {
  title: '',
  source: null,
  direction: null,
  company_name_raw: null,
  contact_name_raw: null,
  phone: null,
  email: null,
  notes: null,
  owner_id: null,
  next_step: null,
  next_action_date: null,
  temperature: null,
  estimated_value: null,
  pain: null,
  budget_status: 'unknown',
  decision_role: null,
  chz_groups: null,
  regulatory_deadline: null,
};

export function LeadModal({ isOpen, onClose, editLead }: LeadModalProps) {
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: EMPTY_FORM,
  });

  // Квалификация свёрнута у нового лида и у «новых» — там ещё нечего заполнять;
  // с первого касания раскрыта: с этого момента она и есть работа по лиду.
  const [qualOpen, setQualOpen] = useState(false);
  /** Сырая строка поля суммы в рублях (в форме лежат копейки). */
  const [valueInput, setValueInput] = useState('');

  useEffect(() => {
    if (editLead) {
      reset({
        title: editLead.title,
        source: editLead.source,
        direction: editLead.direction,
        company_name_raw: editLead.company_name_raw,
        contact_name_raw: editLead.contact_name_raw,
        phone: editLead.phone,
        email: editLead.email,
        notes: editLead.notes,
        owner_id: editLead.owner_id,
        next_step: editLead.next_step,
        next_action_date: editLead.next_action_date,
        temperature: editLead.temperature,
        estimated_value: editLead.estimated_value,
        pain: editLead.pain,
        budget_status: editLead.budget_status ?? 'unknown',
        decision_role: editLead.decision_role,
        chz_groups: editLead.chz_groups,
        regulatory_deadline: editLead.regulatory_deadline,
      });
      setQualOpen(editLead.status !== 'new');
      setValueInput(editLead.estimated_value != null ? String(editLead.estimated_value / 100) : '');
    } else {
      reset(EMPTY_FORM);
      setQualOpen(false);
      setValueInput('');
    }
  }, [editLead, reset]);

  const onSubmit = async (values: LeadFormData) => {
    try {
      if (editLead) {
        await updateLead.mutateAsync({ id: editLead.id, ...values });
      } else {
        await createLead.mutateAsync(values);
      }
      onClose();
    } catch {
      // Ошибку показывает глобальный mutationCache.onError (toast). Модалку НЕ
      // закрываем — даём исправить и повторить.
    }
  };

  const currentDirection = watch('direction');
  const currentTemperature = watch('temperature');
  const currentBudgetStatus = watch('budget_status');
  const currentValue = watch('estimated_value');
  const currentChz = watch('chz_groups');
  const chzCount = currentChz?.length ?? 0;

  const roleOptions = useMemo(
    () => STAKEHOLDER_ROLE_ORDER.map((r) => ({ value: r, label: STAKEHOLDER_ROLE_CONFIG[r].full })),
    [],
  );

  const toggleChz = (group: string) => {
    const current = currentChz ?? [];
    const next = current.includes(group)
      ? current.filter((g) => g !== group)
      : [...current, group];
    // Пустой массив → null: «не выяснено» и «выяснили, что групп нет» — разные вещи,
    // и в БД это NULL против '{}'.
    setValue('chz_groups', next.length > 0 ? next : null, { shouldDirty: true });
  };

  if (!isOpen) return null;

  return (
    <Modal
      title={editLead ? 'Редактировать лид' : 'Новый лид'}
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2">
            Отмена
          </button>
          <button type="submit" form="lead-form" disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {isSubmitting ? 'Сохраняю...' : editLead ? 'Сохранить' : 'Создать лид'}
          </button>
        </>
      }
    >
      <form id="lead-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Название *
            </label>
            <input
              {...register('title')}
              autoFocus
              placeholder="Звонок от Коралл, 12.04"
              className={INPUT_CLASS}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red">{errors.title.message}</p>
            )}
          </div>

          {/* Source */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Источник
            </label>
            <select
              {...register('source')}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Не указан</option>
              {leadSources.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_CONFIG[s].label}
                </option>
              ))}
            </select>
          </div>

          {/* Direction — segmented control with nullable */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Направление
            </label>
            <div className="flex rounded-lg border border-border p-1">
              {([
                { value: null, label: 'Не определено' },
                { value: 'iiot' as const, label: 'IIoT' },
                { value: 'erp' as const, label: 'ERP' },
              ]).map((opt) => (
                <button
                  key={opt.value ?? 'null'}
                  type="button"
                  onClick={() => setValue('direction', opt.value, { shouldDirty: true })}
                  className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    currentDirection === opt.value
                      ? 'bg-accent-l text-accent'
                      : 'text-text-mute hover:text-text-main'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Company name (raw) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Компания
            </label>
            <input
              {...register('company_name_raw')}
              placeholder="ООО «Коралл»"
              className={INPUT_CLASS}
            />
          </div>

          {/* Contact name (raw) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Контактное лицо
            </label>
            <input
              {...register('contact_name_raw')}
              placeholder="Иван Петров"
              className={INPUT_CLASS}
            />
          </div>

          {/* Phone + Email row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Телефон
              </label>
              <input
                {...register('phone')}
                type="tel"
                placeholder="+7 (999) 123-45-67"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Email
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="ivan@corall.ru"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* ═══ Работа ═══ */}
          <div className="modal-section-divider"><span>Работа</span></div>

          <div>
            <Controller
              name="owner_id"
              control={control}
              render={({ field }) => (
                <AssigneeSelect
                  label="Ответственный"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v)}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Следующий шаг
              </label>
              <input
                {...register('next_step')}
                placeholder="Перезвонить, отправить КП..."
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Дата шага
              </label>
              <input {...register('next_action_date')} type="date" className={INPUT_CLASS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Температура
              </label>
              <div className="flex rounded-lg border border-border p-1">
                {leadTemperatures.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setValue('temperature', currentTemperature === t ? null : t, { shouldDirty: true })
                    }
                    className={cn(
                      'flex-1 rounded px-2 py-1.5 text-sm font-medium transition-colors',
                      currentTemperature === t
                        ? 'bg-accent-l text-accent'
                        : 'text-text-mute hover:text-text-main',
                    )}
                  >
                    {LEAD_TEMPERATURE_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Оценка суммы (₽)
              </label>
              {/* Единица хранения — КОПЕЙКИ (как projects.budget), ввод в рублях.
                  Поле держит СВОЮ строку, а не `defaultValue` от RHF: `reset()` в
                  эффекте приходит уже после монтирования, и неуправляемый инпут
                  показал бы сумму предыдущего лида. Строка сырая — «1500,» и «1500.»
                  переживают набор, курсор не прыгает. */}
              <input
                type="text"
                inputMode="decimal"
                placeholder="500000"
                value={valueInput}
                onChange={(e) => {
                  setValueInput(e.target.value);
                  setValue('estimated_value', parseBudgetInput(e.target.value), { shouldDirty: true });
                }}
                className={INPUT_CLASS}
              />
              {currentValue != null && (
                <p className="mt-0.5 text-xs text-text-mute tabular-nums">
                  = {formatBudget(currentValue)}
                </p>
              )}
            </div>
          </div>

          {/* ═══ Квалификация ═══ */}
          {/* ⚠️ Класс `modal-section-divider` в globals.css НЕ ОПРЕДЕЛЁН (мёртвый во всех
              пяти модалках) — `ml-auto` у кнопки без flex-контейнера ничего не делал, и
              заголовок склеивался с кнопкой в «КвалификацияРазвернуть». Раскладку строки
              задаём здесь, класс оставляем как маркер секции. */}
          <div className="modal-section-divider flex items-center gap-2">
            <span>Квалификация</span>
            <button
              type="button"
              onClick={() => setQualOpen(!qualOpen)}
              className="ml-auto text-xs text-text-mute transition-colors hover:text-text-main"
              aria-expanded={qualOpen}
            >
              {qualOpen ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>

          {qualOpen && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-dim">
                  Боль / задача клиента
                </label>
                <textarea
                  {...register('pain')}
                  rows={2}
                  placeholder="Штрафы за нарушение маркировки, ручной учёт в Excel..."
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-dim">
                  Бюджет
                </label>
                <div className="flex flex-wrap gap-1">
                  {leadBudgetStatuses.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setValue('budget_status', b, { shouldDirty: true })}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                        currentBudgetStatus === b
                          ? 'border-accent bg-accent-l text-accent'
                          : 'border-border text-text-mute hover:text-text-main',
                      )}
                    >
                      {LEAD_BUDGET_STATUS_CONFIG[b].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-dim">
                  Роль контакта
                </label>
                <select
                  {...register('decision_role')}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2
                             text-sm text-text-main
                             focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Не выяснена</option>
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-dim">
                  Группы «Честного Знака»
                  {chzCount > 0 && <span className="ml-1 text-accent">· {chzCount}</span>}
                </label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                  <div className="flex flex-wrap gap-1">
                    {CHZ_GROUP_NAMES.map((g) => {
                      const on = currentChz?.includes(g) ?? false;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleChz(g)}
                          aria-pressed={on}
                          className={cn(
                            'rounded-lg border px-2 py-0.5 text-xs transition-colors',
                            on
                              ? 'border-accent bg-accent-l text-accent'
                              : 'border-border text-text-mute hover:text-text-main',
                          )}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-text-dim">
                  Дедлайн маркировки
                </label>
                <input {...register('regulatory_deadline')} type="date" className={INPUT_CLASS} />
                <p className="mt-0.5 text-xs text-text-mute">
                  Дата обязательности по товарной группе — источник срочности для клиента.
                </p>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Заметки
            </label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Контекст звонка, что обсуждали..."
              className={INPUT_CLASS}
            />
          </div>
      </form>
    </Modal>
  );
}
