'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { companyFormSchema, type CompanyFormValues } from '@/lib/validators/company';
import { useCompanies, useCreateCompany, useUpdateCompany, type Company } from '@/lib/hooks/use-companies';
import { useCompanyLookup } from '@/lib/hooks/use-company-lookup';
import { innStatusLabel, isLookupableInn, isRiskyInnStatus } from '@/lib/utils/inn';
import { okvedToIndustry } from '@/lib/data/okved';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { PhoneFields } from '@/components/shared/PhoneFields';
import { Modal } from '@/components/shared/Modal';
import { primaryPhone, normalizePhones } from '@/lib/validators/phone';
// ⚠️ S-TG-3: локальная копия `normalizeCompanyName` удалена. Правило жило в ТРЁХ
//    местах (здесь, в use-quick-capture и — с этого спринта — в боте) и во всех
//    трёх молча не работало: `\b` в JS определён через `\w` = [A-Za-z0-9_], то есть
//    рядом с кириллицей границы слова НЕ существует и `\b(ооо|ао|…)\b` не срезал
//    ОПФ никогда. «ООО Ромашка» и «Ромашка» дублями не считались. Та же грабля,
//    что в S-CHAT-TASK-1. Теперь определение одно и починено.
import { normalizeCompanyName } from '@/lib/utils/capture-helpers';

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  editCompany: Company | null;
  /**
   * S-QUICK-CAPTURE-1: préfill полей формы при СОЗДАНИИ (виджет быстрого ввода).
   * В режиме редактирования игнорируется — там значения принадлежат записи.
   *
   * ⚠️ Ссылка обязана быть стабильной (state/useMemo у вызывающего): объект входит
   * в зависимости эффекта reset, и новый литерал на каждый рендер сбрасывал бы
   * форму под руками у пользователя.
   */
  prefill?: Partial<CompanyFormValues>;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main ' +
  'placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function CompanyModal({ isOpen, onClose, editCompany, prefill }: CompanyModalProps) {
  const router = useRouter();
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const lookup = useCompanyLookup();
  const { data: allCompanies = [] } = useCompanies();
  /** Реквизиты ЕГРЮЛ — свёрнуты, пока пусты: форма компании и без них длинная. */
  const [showLegal, setShowLegal] = useState(false);
  /**
   * Отметка «данные сверены с ЕГРЮЛ прямо сейчас». Ставится ТОЛЬКО успешным
   * lookup'ом и уходит в `inn_verified_at` при сохранении: если пользователь правил
   * реквизиты руками, дата сверки остаётся прежней — иначе «сверено с ЕГРЮЛ» врало бы.
   */
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  /** 23505 от uq_companies_org_inn — сервер отказал по дублю, даже если кэш этого не знал. */
  const [innConflict, setInnConflict] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
  });

  // Дубль по ИНН (точно) или названию (нормализованно) — предупреждение, не блок
  const nameVal = watch('name');
  const innVal = watch('inn');
  const statusVal = watch('inn_status');
  const duplicate = useMemo(() => {
    const inn = innVal?.trim() || null;
    const norm = nameVal ? normalizeCompanyName(nameVal) : '';
    if (!inn && norm.length < 3) return null;
    return allCompanies.find((c) =>
      c.id !== editCompany?.id && (
        (inn && c.inn && c.inn.trim() === inn) ||
        (norm.length >= 3 && normalizeCompanyName(c.name) === norm)
      ),
    ) ?? null;
  }, [nameVal, innVal, allCompanies, editCompany]);

  useEffect(() => {
    if (editCompany) {
      reset({
        name: editCompany.name,
        inn: editCompany.inn,
        industry: editCompany.industry,
        website: editCompany.website,
        phone: editCompany.phone,
        // phones может отсутствовать до применения 041 → fallback на legacy phone
        phones: editCompany.phones?.length
          ? editCompany.phones
          : editCompany.phone
            ? [{ type: 'work', value: editCompany.phone, is_primary: true }]
            : [],
        email: editCompany.email,
        address: editCompany.address,
        notes: editCompany.notes,
        owner_id: editCompany.owner_id ?? null,
        // 102 ещё на гейте → колонок может не быть в ответе select('*'): `?? null`.
        kpp: editCompany.kpp ?? null,
        ogrn: editCompany.ogrn ?? null,
        legal_name: editCompany.legal_name ?? null,
        legal_address: editCompany.legal_address ?? null,
        inn_status: editCompany.inn_status ?? null,
        inn_verified_at: editCompany.inn_verified_at ?? null,
        // 103 тоже ещё на гейте → та же защита `?? null`.
        okved: editCompany.okved ?? null,
      });
      // Заполненные реквизиты не прячем: они уже часть карточки.
      setShowLegal(Boolean(editCompany.legal_name || editCompany.kpp || editCompany.ogrn || editCompany.legal_address));
    } else {
      // `prefill` мержится ПОВЕРХ пустых значений и только здесь, в ветке
      // создания: в edit-режиме поля принадлежат записи.
      reset({
        name: '', inn: null, industry: null, website: null, phone: null, phones: [],
        email: null, address: null, notes: null, owner_id: null,
        kpp: null, ogrn: null, legal_name: null, legal_address: null,
        inn_status: null, inn_verified_at: null, okved: null,
        ...prefill,
      });
      // Реквизиты, приехавшие из ЕГРЮЛ вместе с préfill, обязаны быть видны до
      // сохранения — тот же дизайн-инвариант, что у кнопки «Заполнить».
      setShowLegal(Boolean(prefill?.legal_name || prefill?.kpp || prefill?.ogrn || prefill?.legal_address));
    }
    setVerifiedAt(null);
    setInnConflict(false);
  }, [editCompany, reset, prefill]);

  const canLookup = isLookupableInn(innVal);

  async function handleLookup() {
    const inn = innVal?.trim() ?? '';
    if (!isLookupableInn(inn)) return;
    try {
      const r = await lookup.mutateAsync(inn);
      if (!r.found) {
        toast.error('Компания с таким ИНН не найдена в ЕГРЮЛ');
        return;
      }
      // Дизайн-инвариант: автозаполнение ПРЕДЛАГАЕТ, а не перезаписывает молча —
      // всё легло в поля формы и видно до нажатия «Сохранить».
      // `shouldDirty` обязателен: без него Modal не считает форму изменённой и
      // закроется без предупреждения, унеся подтянутые данные.
      const put = (field: 'kpp' | 'ogrn' | 'legal_name' | 'legal_address' | 'inn_status' | 'okved', v: string | null) =>
        setValue(field, v, { shouldDirty: true });

      put('legal_name', r.legal_name);
      put('kpp', r.kpp);
      put('ogrn', r.ogrn);
      put('legal_address', r.legal_address);
      put('inn_status', r.status);
      // ОКВЭД — такой же факт реестра, как ОГРН: пишем всегда, поля в форме нет
      // (служебный код, его место на карточке).
      put('okved', r.okved);
      // `name` — рабочее имя компании. Заполняем ТОЛЬКО пустое поле: введённое
      // руками («Ориент») не заменяется юрформой из реестра.
      if (!getValues('name')?.trim() && r.short_name) {
        setValue('name', r.short_name, { shouldDirty: true });
      }
      // Фактический `address` не трогаем вовсе — юрадрес живёт в legal_address.

      // ═══ S-OKVED-1: отрасль, контакты ═══
      // Отрасль выводим из кода локальным справочником и кладём ТОЛЬКО в пустое поле:
      // проставленная менеджером важнее выведенной из реестра — он видел клиента, а
      // справочник видел две цифры. В `industry` уходит текст, никогда не код.
      const industry = okvedToIndustry(r.okved);
      const industryFilled = Boolean(industry) && !getValues('industry')?.trim();
      if (industry && industryFilled) {
        setValue('industry', industry, { shouldDirty: true });
      }
      // Контакты реестра — по тому же правилу «только в пустое». На тарифе
      // «Подсказки» их, скорее всего, не будет вовсе, и это нормальный исход.
      if (!getValues('email')?.trim() && r.emails[0]) {
        setValue('email', r.emails[0], { shouldDirty: true });
      }
      if (!getValues('phones')?.length && r.phones.length) {
        // Нормализацию (тримминг, ровно один primary) доделает `onSubmit`.
        setValue(
          'phones',
          r.phones.map((value, i) => ({ type: 'work' as const, value, is_primary: i === 0 })),
          { shouldDirty: true },
        );
      }

      setVerifiedAt(new Date().toISOString());
      setShowLegal(true);
      // Подстановка отрасли не должна быть молчаливой: поле «Отрасль» может быть вне
      // зоны видимости, а изменилось оно не от того, что человек его трогал.
      const industryNote = industry && industryFilled ? ` · Отрасль: ${industry}` : '';
      toast.success(
        r.management_name
          ? `Реквизиты подставлены. Руководитель: ${r.management_name}${industryNote}`
          : `Реквизиты подставлены из ЕГРЮЛ${industryNote}`,
      );
    } catch {
      // Текст показывает глобальный mutationCache.onError (toast). Форму не трогаем:
      // сбой поиска не должен стирать то, что человек уже ввёл.
    }
  }

  const onSubmit = async (values: CompanyFormValues) => {
    // Нормализуем phones + зеркалим primary в legacy `phone` (backward-compat).
    const phones = normalizePhones(values.phones);
    const payload = {
      ...values,
      phones,
      phone: primaryPhone(phones),
      // Дата сверки обновляется только если в этой сессии формы был успешный lookup.
      inn_verified_at: verifiedAt ?? values.inn_verified_at ?? null,
    };
    setInnConflict(false);
    try {
      if (editCompany) {
        await update.mutateAsync({ id: editCompany.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      // Ошибку показывает глобальный mutationCache.onError (toast). Модалку НЕ
      // закрываем — даём исправить и повторить.
      //
      // 23505 по uq_companies_org_inn (102) — дубль, которого не было в кэше:
      // поднимаем флаг, а карточку-виновника покажет баннер ниже, когда
      // onSettled-инвалидация обновит список компаний.
      const code = (err as { code?: string } | null)?.code;
      const text = `${(err as { message?: string } | null)?.message ?? ''}`;
      if (code === '23505' && text.includes('uq_companies_org_inn')) setInnConflict(true);
    }
  };

  if (!isOpen) return null;

  const fields: { name: keyof CompanyFormValues; label: string; placeholder: string; type?: string }[] = [
    { name: 'name', label: 'Название *', placeholder: 'ООО «Рога и Копыта»' },
    { name: 'inn', label: 'ИНН', placeholder: '7707083893' },
    { name: 'industry', label: 'Отрасль', placeholder: 'IT, Производство...' },
    { name: 'email', label: 'Email', placeholder: 'info@company.ru', type: 'email' },
    { name: 'website', label: 'Сайт', placeholder: 'https://company.ru' },
    { name: 'address', label: 'Адрес', placeholder: 'Москва, ул. Примерная, 1' },
  ];

  const legalFields: { name: keyof CompanyFormValues; label: string; placeholder: string }[] = [
    { name: 'legal_name', label: 'Юридическое название', placeholder: 'ООО «РОГА И КОПЫТА»' },
    { name: 'kpp', label: 'КПП', placeholder: '770701001' },
    { name: 'ogrn', label: 'ОГРН', placeholder: '1027700132195' },
    { name: 'legal_address', label: 'Юридический адрес', placeholder: 'г Москва, ул Примерная, д 1' },
  ];

  const statusLabel = innStatusLabel(statusVal);
  const statusRisky = isRiskyInnStatus(statusVal);

  return (
    <Modal
      title={editCompany ? 'Редактировать компанию' : 'Новая компания'}
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface-hover">
            Отмена
          </button>
          <button type="submit" form="company-form" disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {isSubmitting ? 'Сохраняю...' : editCompany ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <form id="company-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-text-dim">{f.label}</label>
              {f.name === 'inn' ? (
                <div className="flex items-center gap-2">
                  <input
                    {...register('inn')}
                    type="text"
                    inputMode="numeric"
                    placeholder={f.placeholder}
                    className={INPUT_CLASS}
                  />
                  {/* Кнопка настоящим `disabled`, а не серой на вид (грабля SDP):
                      пока в поле не 10/12 цифр, запрос слать нечем. */}
                  <button
                    type="button"
                    onClick={handleLookup}
                    disabled={!canLookup || lookup.isPending}
                    title={canLookup ? 'Подтянуть реквизиты из ЕГРЮЛ' : 'ИНН — 10 или 12 цифр'}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2
                               text-sm text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main
                               disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    {lookup.isPending
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Download size={14} />}
                    Заполнить
                  </button>
                </div>
              ) : (
                <input
                  {...register(f.name)}
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                  autoFocus={f.name === 'name'}
                  className={INPUT_CLASS}
                />
              )}
              {errors[f.name] && <p className="mt-0.5 text-xs text-red">{errors[f.name]?.message}</p>}

              {/* Статус юрлица — риск-сигнал пресейла, а не украшение: договор
                  с ликвидируемым юрлицом подписывать нельзя. */}
              {f.name === 'inn' && statusLabel && (
                statusRisky ? (
                  <p className="mt-1 flex items-center gap-1.5 rounded-lg border border-yellow/40 bg-yellow-l/40 px-2 py-1 text-xs text-text-dim">
                    <AlertTriangle size={12} className="shrink-0" style={{ color: 'var(--yellow-text, var(--yellow))' }} />
                    Юрлицо в статусе «{statusLabel}» — проверьте перед договором
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-text-mute">Статус в ЕГРЮЛ: {statusLabel}</p>
                )
              )}
            </div>
          ))}

          <PhoneFields control={control} register={register} watch={watch} setValue={setValue} defaultType="work" />

          {/* ═══ Реквизиты ЕГРЮЛ ═══
              Свёрнуты, пока пусты: в 90% случаев компанию заводят по названию и
              телефону, и четыре пустых поля реквизитов только удлиняют форму.
              Успешный lookup раскрывает блок сам — подставленное обязано быть видно
              до сохранения (дизайн-инвариант фичи). */}
          <div className="rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setShowLegal((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-text-dim transition-colors hover:text-text-main"
            >
              {showLegal ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Реквизиты ЕГРЮЛ
            </button>
            {showLegal && (
              <div className="space-y-3 border-t border-border/60 px-3 py-3">
                {legalFields.map((f) => (
                  <div key={f.name}>
                    <label className="mb-1 block text-xs font-medium text-text-dim">{f.label}</label>
                    <input {...register(f.name)} type="text" placeholder={f.placeholder} className={INPUT_CLASS} />
                    {errors[f.name] && <p className="mt-0.5 text-xs text-red">{errors[f.name]?.message}</p>}
                  </div>
                ))}
                <p className="text-xs text-text-mute">
                  Юрназвание и юрадрес не заменяют «Название» и «Адрес» — рабочее имя
                  компании и фактический адрес остаются как есть.
                </p>
              </div>
            )}
          </div>

          {/* Дубль — предупреждение, не блок. После отказа сервера по
              uq_companies_org_inn (102) тот же баннер называет вещи прямо. */}
          {duplicate && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow/40 bg-yellow-l/40 px-3 py-2 text-xs">
              <AlertTriangle size={13} className="shrink-0" style={{ color: 'var(--yellow-text, var(--yellow))' }} />
              <span className="text-text-dim">
                {innConflict ? 'Компания с таким ИНН уже есть:' : 'Похоже на существующую компанию:'}{' '}
                <span className="font-medium text-text-main">{duplicate.name}</span>
                {duplicate.inn && <span className="text-text-mute"> · ИНН {duplicate.inn}</span>}
              </span>
              <button
                type="button"
                onClick={() => { onClose(); router.push(`/companies/${duplicate.id}`); }}
                className="ml-auto shrink-0 text-accent hover:underline"
              >
                Открыть
              </button>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Дополнительная информация..."
              className={INPUT_CLASS}
            />
          </div>

          {/* Owner */}
          <AssigneeSelect
            label="Ответственный"
            value={watch('owner_id') ?? null}
            onChange={(v) => setValue('owner_id', v)}
          />
      </form>
    </Modal>
  );
}
