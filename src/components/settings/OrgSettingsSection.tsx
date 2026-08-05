'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { SlidersHorizontal } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useOrgSettings, useUpdateOrgSettings } from '@/lib/hooks/use-org-settings';
import { DEFAULT_RECONNECT_DAYS } from '@/lib/constants/reconnect';
import { resolveDwellThreshold } from '@/lib/utils/deal-health';
import {
  orgSettingsFormSchema,
  buildStageDwellDefaults,
  stageDwellToForm,
  buildCompletenessPatch,
  completenessToForm,
  readCompletenessOverrides,
  DWELL_PHASE_GROUPS,
  RECONNECT_DAYS_MAX,
  RECONNECT_DAYS_MIN,
  STAGE_DWELL_MAX,
  STAGE_DWELL_MIN,
  type OrgSettingsFormValues,
} from '@/lib/validators/org-settings';
import {
  DEFAULT_RULES,
  resolveRules,
  COMPLETENESS_WEIGHT_MAX,
  COMPLETENESS_WEIGHT_MIN,
} from '@/lib/domain/deal-completeness';

const inputCls =
  `w-24 rounded border border-input bg-surface px-2 py-1.5 text-sm text-text-main
   focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50`;

/**
 * Настройки организации (R2-P0-D + S-R2-DWELL-CFG): порог тишины и нормативы «дней в стадии».
 *
 * ⚠️ UPDATE на `organizations` — owner-only (`org_update_owner`). Admin и ниже видят
 * ЗНАЧЕНИЯ, но не форму: пустой disabled-инпут без объяснения читается как баг, поэтому
 * не-owner получает read-only строки с явной подписью «правит владелец организации».
 */
export function OrgSettingsSection() {
  const { data: role } = useOrgRole();
  const { data: settings, isLoading } = useOrgSettings();
  const update = useUpdateOrgSettings();

  const isOwner = role === 'owner';
  const current = settings?.reconnect_days ?? DEFAULT_RECONNECT_DAYS;
  const dwell = settings?.stage_dwell_defaults;
  const completenessOverrides = useMemo(() => readCompletenessOverrides(settings), [settings]);

  // Строковые значения полей норматива: ключа нет ⇒ пустая строка ⇒ «как по умолчанию».
  const dwellValues = useMemo(() => stageDwellToForm(dwell), [dwell]);
  const completenessValues = useMemo(
    () => completenessToForm(completenessOverrides),
    [completenessOverrides],
  );
  // Действующие правила — тем же резолвером, что и бейдж на карточке сделки:
  // read-only список для не-владельца не может разойтись с поведением.
  const effectiveRules = useMemo(
    () => resolveRules(DEFAULT_RULES, completenessOverrides),
    [completenessOverrides],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OrgSettingsFormValues>({
    resolver: zodResolver(orgSettingsFormSchema),
    values: { reconnect_days: current, stage_dwell: dwellValues, completeness: completenessValues },
  });

  // Значения приезжают асинхронно — синхронизируем «чистое» состояние формы,
  // иначе isDirty остаётся true сразу после загрузки.
  useEffect(() => {
    reset({ reconnect_days: current, stage_dwell: dwellValues, completeness: completenessValues });
  }, [current, dwellValues, completenessValues, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        reconnect_days: values.reconnect_days,
        // Патч мержится в settings поверх текущих (`{...current, ...patch}`), поэтому
        // reconnect_days и чужие ключи не страдают. Сам stage_dwell_defaults заменяется
        // целиком — так очистка поля действительно убирает ключ.
        stage_dwell_defaults: buildStageDwellDefaults(values.stage_dwell, dwell),
        // completeness_rules живёт в jsonb через passthrough (в интерфейсе OrgSettings
        // его нет: database.ts руками не правится) — патч собирает валидатор.
        ...buildCompletenessPatch(values.completeness, completenessOverrides),
      });
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    }
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal size={14} className="text-text-dim" />
        <h2 className="text-xs font-semibold text-text-dim">Настройки организации</h2>
      </div>

      {isOwner ? (
        <form onSubmit={onSubmit} className="space-y-4">
          {/* ── Порог тишины ── */}
          <div className="space-y-2">
            <label htmlFor="reconnect_days" className="block text-xs font-medium text-text-dim">
              Порог тишины, дней
            </label>
            <input
              id="reconnect_days"
              type="number"
              min={RECONNECT_DAYS_MIN}
              max={RECONNECT_DAYS_MAX}
              step={1}
              disabled={isLoading}
              {...register('reconnect_days', { valueAsNumber: true })}
              className={inputCls}
            />
            {errors.reconnect_days && (
              <p className="text-xs text-red">{errors.reconnect_days.message}</p>
            )}
            <p className="text-xs text-text-mute">
              Контакт считается «остывающим», если последнее состоявшееся касание старше этого
              числа дней. Влияет на «Сегодня → Остывают» и чип «Остывают» в контактах и компаниях.
              Допустимо {RECONNECT_DAYS_MIN}–{RECONNECT_DAYS_MAX}.
            </p>
          </div>

          {/* ── Норматив дней в стадии (S-R2-DWELL-CFG) ── */}
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-text-dim">Норматив дней в стадии</p>
            <div className="flex flex-wrap gap-3">
              {DWELL_PHASE_GROUPS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label
                    htmlFor={`stage_dwell_${key}`}
                    className="block text-xs text-text-mute"
                  >
                    {label}
                  </label>
                  <input
                    id={`stage_dwell_${key}`}
                    type="number"
                    inputMode="numeric"
                    min={STAGE_DWELL_MIN}
                    max={STAGE_DWELL_MAX}
                    step={1}
                    disabled={isLoading}
                    // Плейсхолдер — действующий порог при пустом поле. Берём из того же
                    // резолвера, что и бейдж: подсказка не может разойтись с поведением.
                    placeholder={String(resolveDwellThreshold(key, {}))}
                    {...register(`stage_dwell.${key}`)}
                    className={inputCls}
                  />
                  {errors.stage_dwell?.[key] && (
                    <p className="text-xs text-red">{errors.stage_dwell[key]?.message}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-text-mute">
              Через сколько дней в стадии сделка помечается «залипла» на карточке воронки.
              Пустое поле — как по умолчанию (значение в подсказке). Допустимо{' '}
              {STAGE_DWELL_MIN}–{STAGE_DWELL_MAX}.
            </p>
          </div>

          {/* ── Полнота сделки (S-R3-TRUST-1) ── */}
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-text-dim">Полнота сделки</p>
            <div className="space-y-2">
              {DEFAULT_RULES.map((rule) => (
                <div key={rule.key} className="flex items-start gap-3">
                  <input
                    id={`completeness_${rule.key}`}
                    type="number"
                    inputMode="numeric"
                    min={COMPLETENESS_WEIGHT_MIN}
                    max={COMPLETENESS_WEIGHT_MAX}
                    step={1}
                    disabled={isLoading}
                    placeholder={String(rule.weight)}
                    {...register(`completeness.${rule.key}`)}
                    className={`${inputCls} w-16 shrink-0`}
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`completeness_${rule.key}`}
                      className="block text-xs text-text-dim"
                    >
                      {rule.label}
                    </label>
                    <p className="text-[0.6875rem] leading-snug text-text-mute">{rule.cost}</p>
                    {errors.completeness?.[rule.key] && (
                      <p className="text-xs text-red">{errors.completeness[rule.key]?.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-text-mute">
              Вес правила в оценке полноты карточки сделки. Пустое поле — вес по умолчанию
              (значение в подсказке), <strong className="font-medium">0 — не учитывать</strong>.
              Допустимо {COMPLETENESS_WEIGHT_MIN}–{COMPLETENESS_WEIGHT_MAX}. Полнота ничего
              не блокирует — она только показывает, что не работает из-за пустого поля.
            </p>
          </div>

          <button
            type="submit"
            disabled={!isDirty || isSubmitting || isLoading}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white
              transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isSubmitting ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-text-dim">Порог тишины</span>
              <span className="text-sm font-medium text-text-main tabular-nums">{current}</span>
              <span className="text-xs text-text-dim">дней</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-text-dim">Норматив дней в стадии</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {DWELL_PHASE_GROUPS.map(({ key, label }) => (
                <span key={key} className="text-xs text-text-mute">
                  {label}{' '}
                  <span className="font-medium tabular-nums text-text-main">
                    {resolveDwellThreshold(key, dwell)}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-text-dim">Полнота сделки</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {effectiveRules.map((rule) => (
                <span key={rule.key} className="text-xs text-text-mute">
                  {rule.label}{' '}
                  <span className="font-medium tabular-nums text-text-main">{rule.weight}</span>
                </span>
              ))}
            </div>
          </div>
          <p className="text-xs text-text-mute">
            Настройки организации правит владелец организации.
          </p>
        </div>
      )}
    </div>
  );
}
