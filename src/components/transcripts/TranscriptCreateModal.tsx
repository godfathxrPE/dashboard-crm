'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Phone, CalendarDays } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useLeads } from '@/lib/hooks/use-leads';
import { useProjects } from '@/lib/hooks/use-projects';
import { useIsProjectActive } from '@/lib/hooks/use-pipelines';
import { useCreateCall } from '@/lib/hooks/use-calls';
import { useCreateMeeting } from '@/lib/hooks/use-meetings';
import { useSaveTranscript, type TranscriptEntity, type TranscriptSource } from '@/lib/hooks/use-ai-run';
import { contactBelongsToCompany, contactsForCompany, deriveFromContact } from '@/lib/forms/derive-links';
import { datetimeLocalToIso, localDateTimeKey } from '@/lib/utils/date-helpers';
import {
  transcriptCreateSchema,
  suggestMeetingTitle,
  type TranscriptCreateValues,
} from '@/lib/validators/transcript-create';
import { TranscriptInput } from './TranscriptInput';

// ═══════════════════════════════════════════════════════
// S-TR-CREATE-1: мастер «+ Транскрипт» — расшифровка заводится из раздела
// «Транскрипты», без ручного захода в звонок.
//
// Родитель создаётся ПОД КАПОТОМ: `transcripts` полиморфно висит на call|meeting,
// и политика `transcripts_insert` проверяет EXISTS по родителю. Поэтому мастер
// сначала заводит `calls`/`meetings` с выбранными привязками, а потом вешает на
// него транскрипт. Альтернатива «самостоятельный транскрипт с nullable entity_*»
// отвергнута владельцем: она переписывает RLS transcripts и обе политики ai_runs
// и ломает инвариант «транскрипт принадлежит разговору».
// ═══════════════════════════════════════════════════════

/** Что создал мастер — родитель транскрипта и его привязки для AI-модалки. */
export type CreatedTranscriptParent = {
  entityType: TranscriptEntity;
  entityId: string;
  projectId: string | null;
  companyId: string | null;
  contactId: string | null;
};

interface TranscriptCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Мастер закрылся успехом — родитель создан, транскрипт лежит на нём. */
  onCreated: (parent: CreatedTranscriptParent) => void;
}

/** `datetime-local` → пара колонок `meetings`: `date` (date) + `time` (time). */
function splitDatetimeLocal(v: string): { date: string; time: string | null } {
  const [date, time] = v.split('T');
  return { date, time: time ? time.slice(0, 5) : null };
}

export function TranscriptCreateModal({ isOpen, onClose, onCreated }: TranscriptCreateModalProps) {
  const createCall = useCreateCall();
  const createMeeting = useCreateMeeting();
  const saveTranscript = useSaveTranscript();

  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: leads } = useLeads();
  const { data: projects } = useProjects();
  const isProjectActive = useIsProjectActive();

  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState('');
  const [source, setSource] = useState<TranscriptSource>('paste');
  /**
   * Родитель уже создан, а транскрипт ещё нет: повторный сабмит обязан НЕ плодить
   * второй звонок. Строку не удаляем и молча не откатываем — за ней уже может
   * стоять действие человека (звонок реально был).
   */
  const [created, setCreated] = useState<CreatedTranscriptParent | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    control, handleSubmit, register, reset, setValue, getValues, watch, trigger,
    formState: { errors, isSubmitting },
  } = useForm<TranscriptCreateValues>({
    resolver: zodResolver(transcriptCreateSchema),
    defaultValues: {
      kind: 'call',
      company_id: null, contact_id: null, project_id: null, lead_id: null,
      date: localDateTimeKey(),
      title: null,
    },
  });

  const kind = watch('kind');
  const selectedCompanyId = watch('company_id');
  const selectedLeadId = watch('lead_id');
  const date = watch('date');
  const hasCrmLink = Boolean(watch('company_id') || watch('contact_id') || watch('project_id'));

  // Чистый лист на каждое открытие: модалка живёт в дереве раздела, и остатки
  // прошлого ввода иначе всплыли бы во второй расшифровке.
  useEffect(() => {
    if (!isOpen) return;
    reset({
      kind: 'call',
      company_id: null, contact_id: null, project_id: null, lead_id: null,
      date: localDateTimeKey(),
      title: null,
    });
    setStep(1);
    setText('');
    setSource('paste');
    setCreated(null);
    setSaveError(null);
    titleTouchedRef.current = false;
  }, [isOpen, reset]);

  const companyOptions: ComboboxOption[] = useMemo(
    () => (companies ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.inn ?? undefined })),
    [companies],
  );
  // Каскад: выбранная компания сужает контакты (связь M:N через contact_company).
  const contactOptions: ComboboxOption[] = useMemo(
    () => contactsForCompany(contacts, selectedCompanyId).map((c) => ({
      value: c.id,
      label: [c.first_name, c.last_name].filter(Boolean).join(' '),
      sub: c.phone ?? c.companies?.[0]?.company.name ?? undefined,
    })),
    [contacts, selectedCompanyId],
  );
  // …и сделки (`projects.company_id`). Combobox требует, чтобы выбранное лежало в
  // options, поэтому чужая сделка при смене компании снимается — см. handleCompanyChange.
  const projectOptions: ComboboxOption[] = useMemo(
    () => (projects ?? [])
      .filter(isProjectActive)
      .filter((p) => !selectedCompanyId || p.company_id === selectedCompanyId)
      .map((p) => ({ value: p.id, label: p.name })),
    [projects, isProjectActive, selectedCompanyId],
  );
  // `useLeads` уже отдаёт только НЕ конвертированные.
  const leadOptions: ComboboxOption[] = useMemo(
    () => (leads ?? []).map((l) => ({
      value: l.id,
      label: l.title,
      sub: l.company_name_raw ?? l.contact_name_raw ?? undefined,
    })),
    [leads],
  );

  const companyName = useMemo(
    () => (companies ?? []).find((c) => c.id === selectedCompanyId)?.name ?? null,
    [companies, selectedCompanyId],
  );

  // Автозаголовок встречи — пока человек не тронул поле руками. После правки
  // подстановка молчит: перетирать введённое название сменой компании нельзя.
  const titleTouchedRef = useRef(false);
  useEffect(() => {
    if (kind !== 'meeting' || titleTouchedRef.current) return;
    setValue('title', suggestMeetingTitle(companyName, date ?? ''), { shouldDirty: false });
  }, [kind, companyName, date, setValue]);

  // Ручной выбор CRM-связи снимает лид (паттерн CallModal): либо лид, либо
  // компания/контакт/сделка — двойной привязки не заводим.
  const dropLeadOnCrmLink = (val: string | null) => {
    if (val && selectedLeadId) setValue('lead_id', null, { shouldDirty: true });
  };

  const applyDerived = (contactId: string | null | undefined) => {
    const derived = deriveFromContact(contactId, { contacts, projects, isActiveProject: isProjectActive });
    if (derived.company_id && !getValues('company_id')) setValue('company_id', derived.company_id, { shouldDirty: true });
    if (derived.project_id && !getValues('project_id')) setValue('project_id', derived.project_id, { shouldDirty: true });
  };

  const handleCompanyChange = (val: string | null, onChange: (v: string | null) => void) => {
    onChange(val);
    dropLeadOnCrmLink(val);
    if (!val) return;
    const contactId = getValues('contact_id');
    const current = (contacts ?? []).find((c) => c.id === contactId);
    if (contactId && (!current || !contactBelongsToCompany(current, val))) {
      setValue('contact_id', null, { shouldDirty: true });
    }
    const projectId = getValues('project_id');
    const project = (projects ?? []).find((p) => p.id === projectId);
    if (projectId && project?.company_id !== val) {
      setValue('project_id', null, { shouldDirty: true });
    }
  };

  const handleContactChange = (val: string | null, onChange: (v: string | null) => void) => {
    onChange(val);
    dropLeadOnCrmLink(val);
    if (val) applyDerived(val);
  };

  // Выбор сделки без компании подставляет её компанию — иначе строка списка
  // покажет сделку без компании там, где компания однозначно известна.
  const handleProjectChange = (val: string | null, onChange: (v: string | null) => void) => {
    onChange(val);
    dropLeadOnCrmLink(val);
    if (!val) return;
    const project = (projects ?? []).find((p) => p.id === val);
    if (project?.company_id && !getValues('company_id')) {
      setValue('company_id', project.company_id, { shouldDirty: true });
    }
  };

  const goToText = async () => {
    // Шаг 1 валидируем полем в поле: `handleSubmit` дошёл бы до сабмита, а нам
    // нужно только пропустить дальше.
    const ok = await trigger(kind === 'meeting' ? ['date', 'title'] : ['date']);
    if (ok) setStep(2);
  };

  const hasText = text.trim().length > 0;

  const onSubmit = async (values: TranscriptCreateValues) => {
    if (!hasText) return;
    setSaveError(null);

    // 1. Родитель. Если он уже создан прошлой попыткой — второй раз не создаём.
    let parent = created;
    if (!parent) {
      try {
        if (values.kind === 'call') {
          const call = await createCall.mutateAsync({
            company_id: values.company_id,
            contact_id: values.contact_id,
            project_id: values.project_id,
            lead_id: values.lead_id,
            date: datetimeLocalToIso(values.date) ?? values.date,
            // Транскрипт есть — значит разговор состоялся.
            status: 'done',
          });
          parent = {
            entityType: 'call', entityId: call.id,
            projectId: values.project_id, companyId: values.company_id, contactId: values.contact_id,
          };
        } else {
          const { date: day, time } = splitDatetimeLocal(values.date);
          const meeting = await createMeeting.mutateAsync({
            title: values.title?.trim() || suggestMeetingTitle(companyName, values.date),
            date: day,
            time,
            company_id: values.company_id,
            contact_id: values.contact_id,
            project_id: values.project_id,
          });
          parent = {
            entityType: 'meeting', entityId: meeting.id,
            projectId: values.project_id, companyId: values.company_id, contactId: values.contact_id,
          };
        }
        setCreated(parent);
      } catch {
        // Ошибку показывает глобальный mutationCache.onError (toast). Модалку не
        // закрываем — даём исправить и повторить.
        return;
      }
    }

    // 2. Транскрипт — той же функцией, что сохраняет расшифровку в AiRunPanel
    //    (S-AI-VIS-1): правило «тот же текст той же сущности → та же строка»
    //    одно на всех вызывающих.
    try {
      await saveTranscript.mutateAsync({
        entityType: parent.entityType, entityId: parent.entityId, text, source,
      });
    } catch {
      setSaveError(
        parent.entityType === 'call'
          ? 'Звонок создан, транскрипт не сохранился — откройте его и вставьте текст повторно'
          : 'Встреча создана, транскрипт не сохранился — откройте её и вставьте текст повторно',
      );
      return;
    }

    // Список раздела сбрасывает общая точка инвалидации транскриптов
    // (`invalidateTranscriptKeys` внутри `useSaveTranscript`), своей строки тут не нужно.
    onCreated(parent);
  };

  if (!isOpen) return null;

  const isDirty = hasText || Boolean(selectedCompanyId || watch('contact_id') || watch('project_id') || selectedLeadId);

  return (
    <Modal
      title="Новый транскрипт"
      description={
        step === 1
          ? 'Шаг 1 из 2 · К чему относится разговор'
          : 'Шаг 2 из 2 · Текст разговора'
      }
      onClose={onClose}
      isDirty={isDirty}
      footer={
        step === 1 ? (
          <>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface-hover">
              Отмена
            </button>
            <button type="button" onClick={() => void goToText()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Дальше
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setStep(1)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface-hover">
              Назад
            </button>
            <button type="submit" form="transcript-create-form" disabled={!hasText || isSubmitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting
                ? 'Сохраняю…'
                : created
                  ? 'Повторить сохранение текста'
                  : kind === 'call' ? 'Создать звонок' : 'Создать встречу'}
            </button>
          </>
        )
      }
    >
      <form id="transcript-create-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {/* ─── Шаг 1: привязка ─── */}
        <div className={step === 1 ? 'space-y-3' : 'hidden'}>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Разговор</label>
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <SegmentedControl
                  ariaLabel="Тип разговора"
                  options={[
                    { value: 'call' as const, label: 'Звонок', icon: Phone },
                    { value: 'meeting' as const, label: 'Встреча', icon: CalendarDays },
                  ]}
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    // У встречи ветки лида нет — `meetings.lead_id` не существует.
                    if (v === 'meeting') setValue('lead_id', null, { shouldDirty: true });
                  }}
                />
              )}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Дата и время *</label>
            <input {...register('date')} type="datetime-local"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
            {errors.date && <p className="mt-0.5 text-xs text-red">{errors.date.message}</p>}
          </div>

          {kind === 'meeting' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Название встречи *</label>
              <input
                {...register('title', {
                  onChange: () => { titleTouchedRef.current = true; },
                })}
                placeholder="Встреча с ООО «Рога»"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              {errors.title && <p className="mt-0.5 text-xs text-red">{errors.title.message}</p>}
            </div>
          )}

          <div className="modal-section-divider"><span>Связи</span></div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Компания</label>
            <Controller
              name="company_id"
              control={control}
              render={({ field }) => (
                <Combobox options={companyOptions} value={field.value ?? null}
                  onChange={(val) => handleCompanyChange(val, field.onChange)}
                  placeholder="— не указана —" />
              )}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Контакт</label>
            <Controller
              name="contact_id"
              control={control}
              render={({ field }) => (
                <Combobox options={contactOptions} value={field.value ?? null}
                  onChange={(val) => handleContactChange(val, field.onChange)}
                  placeholder="— не указан —" />
              )}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Сделка</label>
            <Controller
              name="project_id"
              control={control}
              render={({ field }) => (
                <Combobox options={projectOptions} value={field.value ?? null}
                  onChange={(val) => handleProjectChange(val, field.onChange)}
                  placeholder="— не указана —" />
              )}
            />
          </div>

          {/* Лид — только у звонка и только пока нет CRM-связей. У встречи колонки
              `lead_id` нет вовсе, поэтому селектор скрыт целиком. */}
          {kind === 'call' && (!hasCrmLink || selectedLeadId) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Лид</label>
              <Controller
                name="lead_id"
                control={control}
                render={({ field }) => (
                  <Combobox options={leadOptions} value={field.value ?? null} onChange={field.onChange}
                    disabled={hasCrmLink}
                    placeholder="— не указан —" />
                )}
              />
            </div>
          )}

          <p className="text-meta text-text-mute">
            Все связи необязательны: разговор без привязок тоже создастся.
          </p>
        </div>

        {/* ─── Шаг 2: текст ─── */}
        <div className={step === 2 ? '' : 'hidden'}>
          <TranscriptInput
            text={text}
            onTextChange={setText}
            source={source}
            onTranscribed={(result) => { setText(result); setSource('audio'); }}
            onFileLoaded={(content) => { setText(content); setSource('file'); }}
            withAudio
            withFile
            rows={10}
            minHeight="220px"
            placeholder="Вставьте текст разговора — или расшифруйте аудио на соседней вкладке…"
          />

          {saveError && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {created && !saveError && (
            <p className="mt-2 text-meta text-text-mute">
              {created.entityType === 'call' ? 'Звонок' : 'Встреча'} уже создан{created.entityType === 'call' ? '' : 'а'} —
              повторный сабмит сохранит только текст.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
