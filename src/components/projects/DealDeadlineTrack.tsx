'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useStagesForPipeline } from '@/lib/hooks/use-pipelines';
import { useStageNormDateKey } from '@/lib/hooks/use-stage-gauge';
import { buildDeadlineTrack, type MarkState, type TrackMark } from '@/lib/domain/deadline-track';
import { mskDayCaption, mskEndOfDayIso } from '@/lib/utils/date-helpers';
import { TaskModal } from '@/components/tasks/TaskModal';
import type { Project } from '@/lib/hooks/use-projects';
import type { Task } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-DEAL-DEADLINES-1 (W3): таймлайн дедлайнов на две недели.
//
// Виден ВСЕГДА — едет в `alwaysVisible` секции доски (задача 0), а не в её
// `children`: смысл виджета в том, чтобы ответить «что горит» ДО того, как
// человек раскрыл списки. Спрятанный за кнопку, он этого не делает.
//
// Геометрия — из спеки W3, но в rem и токенах: hex спеки снят под `minimal`,
// а тем восемь. Семантика состояний — `--danger`/`--warning`/нейтраль;
// `--accent` («лайм») тратится ТОЛЬКО на колонку «сегодня» — лайм-бюджет Р2.
//
// Таймлайн — картинка данных, поэтому рядом со строкой-заголовком идёт сводка:
// она же легенда (цвет + подпись состояния), она же текстовая альтернатива для
// скрин-ридера.
//
// FIX-DEADLINES-1-VISUAL (приёмка владельца против макета W3): имя блока и
// легенда стоят НАД картинкой, у оси есть базовая линия, подпись нормы держится
// у своего пунктира, состояние задачи несёт слово и тон, а не только цвет точки.
//
// FIX-DEADLINES-1-AXIS: «развести маркеры» относилось к ГРАФИКУ, а не к списку.
// Крупная здесь ось — число дня 12px в кружке 24px, ряд 32px, колонка «сегодня»
// 44px (шире кружка, иначе «08» вылезает за свою подложку). Строка задачи
// вернулась к 18px спеки W3, подпись осталась 10px: она подпись под шкалой.
//
// FIX-DEADLINES-1-EMPTY: при нуле меток рисуется ВСЯ конструкция — eyebrow,
// легенда, колонка «сегодня», базовая линия и ось; пусто только поле дорожек.
// Это сознательная ОТМЕНА решения спринта «пустая ось на всю ширину хуже, чем
// её отсутствие»: оно принималось рассуждением, а приёмка на живых сделках
// показала обратное — пропажа блока читается как поломка виджета, тогда как ось
// с отмеченным сегодняшним днём сама несёт сообщение «две недели впереди чисты».
// Поле дорожек держит `min-h-[4.5rem]` (четыре дорожки по 1.125rem): одна задача
// полоской в 18px выглядит случайной чертой, а не графиком.
// ═══════════════════════════════════════════════════════

/** Свыше этого числа меток дорожки схлопываются по дню (спека W3). */
const COLLAPSE_ABOVE = 6;

const STATE_DOT: Record<MarkState, string> = {
  // Просрочено — заливка danger и широкое кольцо: самая тяжёлая точка на оси.
  overdue: 'bg-danger ring-4 ring-danger/25',
  // «Сегодня» — единственное место лаймового бюджета. Двойное кольцо (контур
  // цветом текста + свечение акцентом) отделяет точку от лаймовой колонки, на
  // которой она стоит: одноцветная точка на своей же заливке исчезает.
  today: 'bg-accent ring-2 ring-text-main shadow-[0_0_0_0.375rem_var(--accent-l2)]',
  // Впереди — нейтраль: поверхность плюс контур. Цвета у «нормально» нет.
  ahead: 'bg-surface ring-2 ring-border2',
  // Ожидание — warning приглушённо: это не проблема, а «мяч не у нас».
  waiting: 'bg-warning/30 ring-2 ring-warning',
};

/** Тот же цвет без колец — для глифов легенды и чипов, где кольцо съело бы точку. */
const STATE_CHIP: Record<MarkState, string> = {
  overdue: 'bg-danger',
  today: 'bg-accent',
  ahead: 'bg-surface ring-1 ring-border2',
  waiting: 'bg-warning',
};

const STATE_LABEL: Record<MarkState, string> = {
  overdue: 'просрочена',
  today: 'сегодня',
  ahead: 'впереди',
  waiting: 'ожидание',
};

/**
 * Тон подписи задачи. Состояние обязано читаться не только цветом точки —
 * поэтому подпись несёт и слово (см. JSX), и тон.
 *
 * ⚠️ `today` идёт `--text-main`, а НЕ акцентом: на подписи акцент в `t-washi`
 * стал бы красным и совпал с просрочкой — то есть цвет соврал бы о состоянии.
 * Акцент остаётся у колонки и точки, где рядом нет конкурирующей семантики.
 */
const STATE_TEXT: Record<MarkState, string> = {
  overdue: 'text-danger-text',
  today: 'text-text-main',
  ahead: 'text-text-dim',
  waiting: 'text-warning-text',
};

/** Порядок тяжести для схлопнутой дорожки: у дня состояние худшей задачи. */
const STATE_WEIGHT: Record<MarkState, number> = { overdue: 3, today: 2, waiting: 1, ahead: 0 };

export interface DealDeadlineTrackProps {
  project: Project;
  /** Задачи доски — приходят из `ProjectBoardSection`, своего запроса нет. */
  tasks: Task[] | undefined;
}

/** Дорожка: одна задача либо схлопнутый день с «+N». */
interface Row {
  key: string;
  mark: TrackMark;
  state: MarkState;
  extra: number;
}

export function DealDeadlineTrack({ project, tasks }: DealDeadlineTrackProps) {
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Норма стадии — ТОТ ЖЕ путь, что рисует заливку ячейки кокпита
  // (`resolveStageNorm`), только спроецированный в календарный день. Вторая
  // формула нормы развела бы пунктир с кокпитом (задача 3).
  const allStages = useStagesForPipeline(project.pipeline_id);
  const stage = allStages.find((s) => s.id === project.stage_id) ?? null;
  const normDateKey = useStageNormDateKey(project.stage_entered_at, stage);

  const track = useMemo(
    () => buildDeadlineTrack(tasks ?? [], normDateKey, new Date()),
    [tasks, normDateKey],
  );

  const counts = useMemo(() => {
    const acc: Record<MarkState, number> = { overdue: 0, today: 0, ahead: 0, waiting: 0 };
    for (const m of track.marks) acc[m.state]++;
    return acc;
  }, [track.marks]);

  // Свыше COLLAPSE_ABOVE меток дорожки объединяются по дню: полтора десятка
  // строк по 18px — уже не «что горит», а второй список задач.
  const rows = useMemo<Row[]>(() => {
    if (track.marks.length <= COLLAPSE_ABOVE) {
      return track.marks.map((mark) => ({ key: mark.taskId, mark, state: mark.state, extra: 0 }));
    }
    const byDay = new Map<string, Row>();
    for (const mark of track.marks) {
      const cur = byDay.get(mark.dateKey);
      if (!cur) {
        byDay.set(mark.dateKey, { key: mark.dateKey, mark, state: mark.state, extra: 0 });
        continue;
      }
      cur.extra++;
      // День наследует состояние худшей своей задачи — иначе просрочка
      // спрячется за «впереди», попав в стек вторым элементом.
      if (STATE_WEIGHT[mark.state] > STATE_WEIGHT[cur.state]) cur.state = mark.state;
    }
    return [...byDay.values()];
  }, [track.marks]);

  const outsideNote =
    track.outsideCount > 0 ? `ещё ${track.outsideCount} за окном` : null;

  function openTask(taskId: string) {
    const task = tasks?.find((t) => t.id === taskId);
    if (task) setEditTask(task);
  }

  return (
    <div>
      {/* Имя блока и легенда — ОДНОЙ строкой и ДО картинки: легенда это ключ к
          шкале, её читают перед тем, как разбирать точки, а не после.
          Eyebrow не берёт класс `.zone-eyebrow`: тот задаёт уровень ЗОНЫ
          («Работа», «Риски»), а здесь заголовок виджета внутри секции. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-meta font-bold uppercase tracking-[0.06em] text-text-dim">
          Дедлайны · 2 недели
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-mute">
          <Legend count={counts.overdue} state="overdue" word="просрочено" />
          <Legend count={counts.today} state="today" word="сегодня" />
          <Legend count={counts.ahead} state="ahead" word="впереди" />
          {counts.waiting > 0 && <Legend count={counts.waiting} state="waiting" word="ждёт" />}
          {outsideNote && <span>· {outsideNote}</span>}
        </span>
      </div>

      <div className="relative">
        {/* Колонка «сегодня» — на всю высоту дорожек и оси, под ними по z.
            `-translate-x-1/2` центрирует её по todayPct, иначе полоса уходит
            вправо от своей же метки на оси. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 w-[2.75rem] -translate-x-1/2 rounded-xl bg-accent/20"
          style={{ left: `${track.todayPct}%` }}
        />

        {/* Норма стадии — общая ось с кокпитом. Вне окна `normPct` равен null,
            и пунктира нет вовсе: линия, прижатая к краю, читалась бы как
            «норма сегодня». */}
        {track.normPct !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-dashed border-warning/70"
            style={{ left: `${track.normPct}%` }}
          />
        )}

        {/* Подпись нормы стоит У САМОГО пунктира, а не сноской под виджетом:
            оторванная, она читается как примечание ко всему блоку, и связь с
            вертикальной линией теряется. Правее 60% уходит влево от линии —
            тот же приём, что у меток. */}
        {/* Строка под подпись нормы резервируется ТОЛЬКО когда норма в окне:
            иначе у сделки без нормы стадии сверху висели бы пустые 14px. */}
        {track.normPct !== null && track.normDateKey && (
        <div className="relative h-[0.875rem]">
          {(
            <span
              className="absolute bottom-0 whitespace-nowrap text-[0.59375rem] text-warning-text"
              style={
                track.normPct > 60
                  ? { right: `${100 - track.normPct}%`, paddingRight: '0.25rem' }
                  : { left: `${track.normPct}%`, paddingLeft: '0.25rem' }
              }
            >
              норма стадии · {mskDayCaption(mskEndOfDayIso(track.normDateKey))}
            </span>
          )}
        </div>
        )}

        {/* `min-h-[4.5rem]` — ровно четыре дорожки по 1.125rem. Высота растёт
            естественно: пятая задача добавляет пятую строку, минимум только не
            даёт полю схлопнуться в черту при одной задаче и держит поле, когда
            дорожек нет вовсе. */}
        <div className="relative min-h-[4.5rem]">
          {rows.length === 0 ? (
            // Пустое поле объясняет себя словом, а не пропажей: шкалу задают
            // eyebrow, легенда и ось вокруг, а строка говорит, что на ней пусто.
            //
            // ⚠️ «ещё N за окном» здесь НЕ печатается, хотя план правки этого
            // требовал: фразу уже несёт легенда строкой выше, и на пустом поле
            // выходило «Дедлайнов нет · ещё 1 за окном» дважды на одном экране.
            // Одна величина — одно место (то же правило, что увело вердикт
            // здоровья из шапки в S-HEALTH-V2-1).
            <p className="absolute inset-0 flex items-center justify-center px-2 text-center text-meta text-text-mute">
              Дедлайнов в ближайшие две недели нет
            </p>
          ) : (
          rows.map((row) => {
            // Подпись в правой половине оси уходит ВЛЕВО от точки: у метки на
            // 100% (дедлайн `now+12` — штатный, не край случая) она иначе
            // рисуется за границей контейнера и обрезается.
            const flip = row.mark.pct > 55;
            return (
              // 18px спеки W3. Промежуточная правка поднимала строку до 26px,
              // читая «развести маркеры» как «дать воздух списку» — прочтение
              // неверное: расти должен ГРАФИК (ось ниже), а строка задачи это
              // список, и её рост только удлиняет виджет.
              <div key={row.key} className="relative h-[1.125rem]">
                {/* Кнопка — сама метка (точка + подпись), а не строка целиком:
                    дорожка тянется во всю ширину, и клик по её пустому концу,
                    открывающий задачу, был бы сюрпризом. */}
                <button
                  type="button"
                  onClick={() => openTask(row.mark.taskId)}
                  aria-label={
                    `${row.mark.title}` +
                    (row.extra > 0 ? ` и ещё ${row.extra}` : '') +
                    `, ${mskDayCaption(mskEndOfDayIso(row.mark.dateKey))}` +
                    `, ${STATE_LABEL[row.state]}`
                  }
                  className={cn(
                    'absolute top-1/2 flex max-w-[60%] -translate-y-1/2 items-center rounded-full',
                    flip && 'flex-row-reverse',
                  )}
                  // Отрицательное поле в полточки центрирует саму точку по
                  // `pct`: без него метка стоит правее (или левее) своего дня.
                  style={
                    flip
                      ? { right: `${100 - row.mark.pct}%`, marginRight: '-0.375rem' }
                      : { left: `${row.mark.pct}%`, marginLeft: '-0.375rem' }
                  }
                >
                  <span
                    className={cn('block size-3 shrink-0 rounded-full', STATE_DOT[row.state])}
                  />
                  {/* Подпись сдвинута на 12px от точки и не переносится: дорожка
                      одну строку и рассчитана. 10px — мельче спеки W3 (11px) и
                      мельче числа дня (12px) СОЗНАТЕЛЬНО: главное здесь шкала,
                      а подписи задач идут под неё подписями, а не наоборот. */}
                  <span
                    className={cn(
                      'flex min-w-0 items-baseline whitespace-nowrap text-[0.625rem]',
                      STATE_TEXT[row.state],
                      flip ? 'mr-3' : 'ml-3',
                    )}
                  >
                    {/* Обрезается ТОЛЬКО название. Гейт FIX-VISUAL: когда
                        `truncate` стоял на всей подписи, многоточие съедало
                        хвост — то есть ровно слово состояния, ради которого
                        пункт 5 и делался. На коротких именах («тест») это не
                        видно, на длинных смысл терялся первым. */}
                    <span className="truncate">{row.mark.title}</span>
                    {/* Состояние словом: цвет как ЕДИНСТВЕННЫЙ носитель смысла —
                        a11y-дефект, и в `t-aura` (графитовый акцент) он виден
                        глазами. В `aria-label` состояние уже есть, и label
                        заменяет содержимое кнопки целиком — повтора не будет. */}
                    {/* Отступ до разделителя — `ml-1`, а НЕ пробел в тексте:
                        ведущий пробел в начале строчного контекста браузер
                        отбрасывает, и на экране выходило «в отпуске· впереди».
                        Видно только на длинных подписях — и повторится при любой
                        следующей перестановке, если отдать его тексту. */}
                    <span className="ml-1 shrink-0 text-text-mute">
                      {row.extra > 0 && <span className="tabular-nums">+{row.extra} </span>}
                      · {STATE_LABEL[row.state]}
                    </span>
                  </span>
                </button>
              </div>
            );
          })
          )}
        </div>

        {/* Базовая линия отделяет дорожки от чисел — без неё ряд дней висит
            вплотную под последней подписью, и ось не читается как ось.
            Отступ над числами даёт её `padding`, отдельного не заводим. */}
        <div className="relative border-t border-border pt-1" aria-hidden="true">
          {/* Ось дней: 15 меток в кругах. Числа tabular — иначе метки «11» и «18»
              разной ширины дёргают центровку кругов. */}
          <div className="relative h-[2rem]">
            {track.days.map((day) => (
              <span
                key={day.key}
                className={cn(
                  'absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2',
                  'items-center justify-center rounded-full text-[0.75rem] tabular-nums',
                  day.isToday
                    ? 'bg-accent font-bold shadow-[0_0_0_0.25rem_var(--accent-l2)]'
                    : 'text-text-mute',
                )}
                // `--on-accent` — единственный токен «контраст к акценту»; в
                // Tailwind он не объявлен, поэтому инлайном, как в MonthGrid и
                // WeekLanes. На лайме `text-white` дало бы 1.29:1.
                style={{ left: `${day.pct}%`, ...(day.isToday && { color: 'var(--on-accent)' }) }}
              >
                {day.key.slice(8, 10)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Локальный инстанс модалки — тот же приём, что у `ProjectBoard`:
          `GlobalModals` умеет только СОЗДАНИЕ задачи (`editTask={null}`), а
          доска, из которой можно было бы открыть существующую, при свёрнутой
          секции не смонтирована — то есть именно в том состоянии, ради
          которого таймлайн и виден. */}
      <TaskModal
        isOpen={editTask !== null}
        onClose={() => setEditTask(null)}
        editTask={editTask}
        defaultProjectId={project.id}
      />
    </div>
  );
}

function Legend({ count, state, word }: { count: number; state: MarkState; word: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('block size-2 shrink-0 rounded-full', STATE_CHIP[state])} />
      <span className="tabular-nums">{count}</span> {word}
    </span>
  );
}
