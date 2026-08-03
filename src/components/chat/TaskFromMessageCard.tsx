'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateTask } from '@/lib/hooks/use-tasks';
import { useInvalidateTasksByMessage } from '@/lib/hooks/use-tasks-by-message';
import { useEntitySearch, type EntityOption } from '@/lib/hooks/use-entity-search';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { entityKey, type EntityPart } from '@/lib/utils/entity-links';
import type { EntityTitles } from '@/lib/hooks/use-entity-titles';
import { parseTaskIntent } from '@/lib/utils/task-intent';
import { datetimeLocalToIso, isoToDatetimeLocal } from '@/lib/utils/date-helpers';
import type { ConversationKind } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-CHAT-TASK-1: карточка подтверждения «задача из сообщения».
//
// ⚠️ ЗАДАЧА НИКОГДА НЕ СОЗДАЁТСЯ МОЛЧА (решение 2 спринта). Любой вход — и клик по
//    сообщению, и слэш-команда — заканчивается ЗДЕСЬ: разобранные поля на экране,
//    кнопки «Создать» / «Отмена». Ложная задача из болтовни дискредитирует фичу
//    быстрее, чем её отсутствие.
//
// ⚠️ ПАНЕЛЬ, А НЕ МОДАЛКА. Сообщение-источник обязано остаться на экране: человек
//    сверяет разобранное с тем, что написано. Карточка живёт между лентой и композером —
//    одно место для обоих входов (у слэш-команды сообщения ещё нет и якорить не к чему).
//
// ⚠️ ПРИВЯЗКА: ЧЕТЫРЕ ИСТОЧНИКА, ПЕРВЫЙ НЕПУСТОЙ ВЫИГРЫВАЕТ
//    (FIX S-CHAT-TASK-1-BIND — переписывает решение 1 исходного спринта).
//      1. явный выбор человека;
//      2. чип-ссылка в сообщении — самый явный сигнал, что дал автор;
//      3. канал проекта — контекст бесплатный и точный: канал знает свой `project_id`,
//         угадывать нечего;
//      4. кандидат из текста — и только если совпадение РОВНО ОДНО.
//
//    Исходно сущность бралась только из чипа. Это защищало от привязки не к той сделке,
//    но чипы появляются, лишь когда человек вставляет URL из адресной строки — в
//    переписке так не пишут, и привязка не срабатывала почти никогда. Запрет на
//    угадывание остался: «Ориент» даёт четыре совпадения, и в этом случае мы не выбираем
//    ничего — показываем список. Изменилось то, что теперь есть ЧТО показать.
//
// ⚠️ ОТКУДА ВЗЯЛАСЬ ПРИВЯЗКА — ВИДНО СТРОКОЙ ПОД ПОЛЕМ. Прямое продолжение
//    «распознано: …» у даты: система обязана показывать не только ответ, но и его
//    происхождение, иначе «оно само что-то выбрало» неотличимо от ошибки.
// ═══════════════════════════════════════════════════════

/** Читаемый момент по МСК — таймзона браузера может быть любой (решение спринта). */
const MSK_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

/** Код ошибки PostgREST без `any`: payload внешний, разбираем через guard. */
function pgErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

/**
 * Куда пишется привязка. Не `entityType` из поиска: `deal` и `project` — одна и та же
 * строка `projects` и одна и та же колонка `project_id`, а различает их только подпись.
 * Хранить в состоянии карточки различие, которого нет в БД, значит развести их однажды.
 */
type BindTarget = 'project' | 'company' | 'contact';

interface Bind {
  target: BindTarget;
  id: string;
  label: string;
}

/** Откуда взялась привязка — показывается человеку строкой под полем. */
type BindSource = 'chip' | 'channel' | 'text' | 'manual';

const TARGET_OF: Record<EntityPart['entityType'], BindTarget> = {
  deal: 'project',
  project: 'project',
  company: 'company',
  contact: 'contact',
};

/** Ключ для `Combobox`: тип нужен, потому что id сделки и компании могут совпасть. */
const bindKey = (target: BindTarget, id: string) => `${target}:${id}`;

export interface TaskFromMessageCardProps {
  /** Тело для разбора: сообщение целиком либо остаток строки после `/задача`. */
  body: string;
  /**
   * Сообщение-источник — ВСЕГДА есть (FIX S-CHAT-TASK-SLASH).
   *
   * Раньше тут допускался `null` у слэш-команды: она открывала карточку, не отправив
   * сообщения. На этом пути unique-индекс `uq_tasks_source_message` не работал вообще —
   * в проде оказались два одинаковых дубля. Теперь команда сперва пишет в канал, и
   * карточка получает id реального сообщения. Тип не ослаблять.
   */
  sourceMessageId: string;
  /** Чипы, найденные в теле (`entityRefsOf(parseEntityLinks(...))`). */
  entityRefs: EntityPart[];
  /** Названия чипов. Чип без названия невидим по RLS — в привязку не предлагаем. */
  entityTitles: EntityTitles;
  /** Названия чипов ещё в пути — до ответа чип нельзя считать ни годным, ни негодным. */
  entityTitlesLoading: boolean;
  /**
   * Канал, в котором открыта карточка. `kind === 'project'` даёт привязку по умолчанию:
   * сообщение в канале «Ориент Продактс — внедрение» почти всегда про эту сделку, и
   * `project_id` канал знает точно.
   */
  conversation: { kind: ConversationKind; projectId: string | null; title: string };
  /** Дефолтный исполнитель — АВТОР сообщения, а не нажавший (решение 6). */
  defaultAssigneeId: string | null;
  onClose: () => void;
}

export function TaskFromMessageCard({
  body,
  sourceMessageId,
  entityRefs,
  entityTitles,
  entityTitlesLoading,
  conversation,
  defaultAssigneeId,
  onClose,
}: TaskFromMessageCardProps) {
  const router = useRouter();
  const createTask = useCreateTask();
  const invalidateByMessage = useInvalidateTasksByMessage();

  // Разбор считается ОДИН раз на открытие карточки: пересчёт на каждый рендер затирал
  // бы правки человека (и «сегодня» переползало бы через полночь прямо под курсором).
  const intent = useMemo(() => parseTaskIntent(body), [body]);

  const [text, setText] = useState(intent.text);
  const [deadlineLocal, setDeadlineLocal] = useState(isoToDatetimeLocal(intent.deadline) ?? '');
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);

  // ── Привязка ───────────────────────────────────────────────────────────────
  // Чипы, чьи названия RLS реально отдала: вести задачу на сущность, которой человек
  // не видит, — обещание, которого мы не сдержим.
  const chipBind = useMemo<Bind | null>(() => {
    for (const r of entityRefs) {
      const title = entityTitles.get(entityKey(r.entityType, r.id));
      if (title) return { target: TARGET_OF[r.entityType], id: r.id, label: title };
    }
    return null;
  }, [entityRefs, entityTitles]);

  const channelBind = useMemo<Bind | null>(
    () =>
      conversation.kind === 'project' && conversation.projectId
        ? { target: 'project', id: conversation.projectId, label: conversation.title }
        : null,
    [conversation],
  );

  const [bind, setBind] = useState<Bind | null>(null);
  const [bindSource, setBindSource] = useState<BindSource>('manual');
  // Чем кончился поиск по подсказке из текста. «Ничего не нашлось» и «нашлось
  // несколько» — разные сообщения человеку: первое значит «имя мы не узнали», второе —
  // «узнали, но выбрать за тебя не имеем права».
  const [hintOutcome, setHintOutcome] = useState<'none' | 'many' | null>(null);
  // Поиск стартует с подсказки из текста: заставлять человека набрать то, что система
  // уже прочитала, — худший вид «умного» интерфейса.
  const [search, setSearch] = useState(intent.nameHint ?? '');
  const { options: searchOptions, isLoading: searchLoading } = useEntitySearch(search);

  // Начальная привязка вычисляется РОВНО ОДИН раз. Дальше истина — состояние: иначе
  // приехавшие позже названия чипов или новый результат поиска затирали бы выбор
  // человека прямо под курсором.
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (resolvedRef.current) return;

    // Чип есть, но названия ещё летят — ждём: сейчас он неотличим от невидимого по RLS.
    if (entityRefs.length > 0 && entityTitlesLoading) return;

    if (chipBind) {
      resolvedRef.current = true;
      setBind(chipBind);
      setBindSource('chip');
      return;
    }
    if (channelBind) {
      resolvedRef.current = true;
      setBind(channelBind);
      setBindSource('channel');
      return;
    }
    if (!intent.nameHint) {
      resolvedRef.current = true;
      return;
    }
    if (searchLoading) return;

    resolvedRef.current = true;
    // Ровно одно совпадение — предвыбираем. Несколько («Ориент» их даёт четыре) —
    // не выбираем НИЧЕГО: это тот самый случай, ради которого запрещено угадывание,
    // и решается он показом списка, а не молчаливым выбором первой строки.
    if (searchOptions.length === 1) {
      const only = searchOptions[0];
      setBind({
        target: only.entityType === 'company' ? 'company' : 'project',
        id: only.id,
        label: only.label,
      });
      setBindSource('text');
      return;
    }
    setHintOutcome(searchOptions.length === 0 ? 'none' : 'many');
  }, [
    entityRefs.length,
    entityTitlesLoading,
    chipBind,
    channelBind,
    intent.nameHint,
    searchLoading,
    searchOptions,
  ]);

  const optionOf = (o: EntityOption): ComboboxOption => ({
    value: bindKey(o.entityType === 'company' ? 'company' : 'project', o.id),
    label: o.label,
    sub: o.sub,
  });

  // Выбранное всегда в списке опций, даже если текущий поиск его не нашёл — иначе
  // Combobox не находит `value` среди `options` и показывает плейсхолдер, то есть
  // привязка выглядит потерянной.
  const bindValue = bind ? bindKey(bind.target, bind.id) : null;
  const options = useMemo(() => {
    const list = searchOptions.map(optionOf);
    if (bind && !list.some((o) => o.value === bindValue)) {
      list.unshift({ value: bindValue as string, label: bind.label });
    }
    return list;
  }, [searchOptions, bind, bindValue]);

  function handleBindChange(value: string | null) {
    setBindSource('manual');
    if (!value) {
      setBind(null);
      return;
    }
    const picked = searchOptions.find((o) => optionOf(o).value === value);
    if (!picked) return; // выбрать можно только то, что в списке
    setBind({
      target: picked.entityType === 'company' ? 'company' : 'project',
      id: picked.id,
      label: picked.label,
    });
  }

  const bindHint =
    bindSource === 'chip'
      ? 'из ссылки в сообщении'
      : bindSource === 'channel'
        ? 'из канала проекта'
        : bindSource === 'text' && intent.nameHint
          ? `найдено по тексту: ${intent.nameHint}`
          : bind
            ? 'выбрано вручную'
            : intent.nameHint && hintOutcome === 'many'
              ? `по тексту «${intent.nameHint}» нашлось несколько — выберите вручную`
              : intent.nameHint && hintOutcome === 'none'
                ? `по тексту «${intent.nameHint}» ничего не нашлось — выберите вручную`
                : 'без привязки — выберите вручную, если нужна';

  const deadlineIso = datetimeLocalToIso(deadlineLocal || null);
  const canCreate = text.trim().length > 0 && !createTask.isPending;

  function handleCreate() {
    if (!canCreate) return;
    createTask.mutate(
      {
        text: text.trim(),
        deadline: deadlineIso,
        assigned_to: assigneeId,
        source_message_id: sourceMessageId,
        // Ровно ОДНА связь. `column_id` не передаём — резолвит trg_aa_resolve_board;
        // `lane`/`priority` берут дефолты БД.
        project_id: bind?.target === 'project' ? bind.id : null,
        company_id: bind?.target === 'company' ? bind.id : null,
        contact_id: bind?.target === 'contact' ? bind.id : null,
      },
      {
        onSuccess: () => {
          invalidateByMessage();
          toast.success('Задача создана', {
            // `?who=all` не для красоты: на /tasks по умолчанию стоит фильтр «мои», а
            // исполнитель здесь — автор сообщения, то есть чаще всего НЕ открывающий.
            action: { label: 'Открыть', onClick: () => router.push('/tasks?who=all') },
          });
          onClose();
        },
        onError: (err) => {
          // 23505 — uq_tasks_source_message: задача по этому сообщению уже есть, просто
          // читателю она не видна по RLS (создал и назначил её кто-то другой).
          if (pgErrorCode(err) === '23505') {
            invalidateByMessage();
            toast.error('По этому сообщению задача уже создана');
            onClose();
            return;
          }
          toast.error('Не удалось создать задачу');
        },
      },
    );
  }

  return (
    <div className="mb-2 shrink-0 rounded-[var(--radius-m)] border border-accent/40 bg-surface p-3 shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex items-center gap-2">
        <ListPlus size={14} className="text-accent" aria-hidden="true" />
        <span className="text-xs font-semibold text-text-main">Задача из сообщения</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="ml-auto rounded p-0.5 text-text-mute transition-colors hover:text-text-main"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-meta text-text-mute">Задача</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            maxLength={500}
            placeholder="Что надо сделать"
            className="rounded-lg border border-input bg-bg px-2 py-1.5 text-sm text-text-main
                       focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-meta text-text-mute">Срок</span>
          <input
            type="datetime-local"
            value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
            className="rounded-lg border border-input bg-bg px-2 py-1.5 text-sm text-text-main
                       focus:border-accent focus:outline-none"
          />
          {/*
            Поле datetime-local показывает ЛОКАЛЬНОЕ время браузера (конвенция проекта —
            та же пара isoToDatetimeLocal/datetimeLocalToIso, что в TaskModal), а разбор
            считался в МСК. Для человека вне МСК это разные числа, поэтому итог дублируем
            явно с пометкой «МСК» — иначе он увидит 13:00 там, где договаривались на 15:00.
          */}
          {deadlineIso ? (
            <span className="text-meta text-text-mute">
              {MSK_FMT.format(new Date(deadlineIso))} МСК
              {intent.matchedDatePhrase && ` · распознано: «${intent.matchedDatePhrase}»`}
            </span>
          ) : (
            <span className="text-meta text-text-mute">Без срока</span>
          )}
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-meta text-text-mute">Привязка</span>
          <Combobox
            options={options}
            value={bindValue}
            onChange={handleBindChange}
            onSearchChange={setSearch}
            initialSearch={intent.nameHint ?? ''}
            loading={searchLoading}
            placeholder="Сделка, проект или компания"
            disabled={createTask.isPending}
          />
          <span className="text-meta text-text-mute">{bindHint}</span>
        </div>

        <AssigneeSelect
          value={assigneeId}
          onChange={setAssigneeId}
          label="Исполнитель"
          disabled={createTask.isPending}
        />

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity
                       hover:opacity-90 disabled:opacity-40"
          >
            {createTask.isPending ? 'Создаём…' : 'Создать'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-text-mute transition-colors hover:text-text-main"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ссылка «задача создана» — заменяет иконку «в задачу» у сообщения, из которого задача
 * уже родилась (решение 5: одно сообщение → одна задача, повторный клик ведёт К НЕЙ,
 * а не открывает вторую форму).
 *
 * Ведёт на `/tasks?who=all` — точечного deep-link на задачу в проекте нет, а фильтр
 * «мои» по умолчанию скрыл бы задачу, назначенную автору сообщения.
 */
export function TaskCreatedLink({ taskText }: { taskText: string }) {
  return (
    <Link
      href="/tasks?who=all"
      title={`Задача создана: ${taskText}`}
      aria-label={`Задача создана: ${taskText}`}
      className="rounded p-0.5 text-accent transition-colors hover:text-text-main"
    >
      <ListPlus size={12} />
    </Link>
  );
}
