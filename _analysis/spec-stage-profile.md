# Спека кокпита и карты воронки (S-STAGE-PROFILE-1) — текстовая выжимка

> Оригинал: `_analysis/spec-stage-profile.html`. Это JS-бандл: контент лежит
> в `<script type="__bundler/template">` и разворачивается скриптом при открытии
> в браузере. Файл ниже — плоский текст того же документа, для чтения и грепа
> агентами; геометрию и цвета сверять с оригиналом, он источник.

S-STAGE-PROFILE-1 · Карта воронки «Профиль времени» — спека для Claude Code
This page requires JavaScript to display.
Unpacking...
"
S-STAGE-PROFILE-1 · Карта воронки «Профиль времени» — спека для Claude Code
S-STAGE-PROFILE-1
Кокпит стадии + карта «Профиль времени»
Два блока одного виджета W1 карточки сделки (ProjectDetail):
строка кокпита
— рестайл существующего
PipelineCockpit
под lime-макет (пропсы и логика остаются), и
карта воронки
— новый
StageProfile
вместо
StageRail
: стадия — столбик, высота = дни; пунктир — норма, заливка — факт. Оба ещё не в проде — спека покрывает оба.
Макет · default (warn 21/30)
Работа
что делаем сейчас · где в воронке · задачи
Закрытие · группа 4 из 4
9 из 11 · вероятность
80%
8
Защита КП
21 дн.
из 30 по норме
вход 15 авг
норма 14 сент
готовность 2/2
Договор
+2
Привлеч.
Квалиф.
Оценка
Закрытие
Карта воронки · IIoT
· 3 px = 1 день
факт
норма
сверх нормы
Свернуть
Привлечение
4
/ 7
Квалификация
9
/ 13
Оценка
5
/ 8
Закрытие
21
/ 54
1
2
1
3
2
норма 3 → контур становится линией нормы (dashed --yellow), верх заливки над ней --yellow -->
4
/ 3
2
3
21
/ 30
≈ 14
≈ 10
Первый контакт
Квалификация
Потребность
Обследование
Демо
Техзадание
Расчёт
Подготовка КП
Защита КП
Договор
Оплата
прошло
39 дн.
при норме 34 ·
+5 дн.
впереди ≈
33 дн.
по нормам · финиш ≈ 12 окт
На стадии:
защищаем КП у ЛПР, а не у контакта. Цель — встреча с исполнительным директором до конца нормы.
Состояния
кокпит · over + gate 1/2
· рамка и маркер нормы red · CTA приглушён (Lock), но кликабелен · коннектор border2
8
Защита КП
34 дн.
из 30 по норме
вход 2 авг
норма 1 сент · +4 дн.
готовность 1/2
Договор
+2
Привлеч.
Квалиф.
Оценка
Закрытие
over
· текущая 34 / 30 · возврат на «Демо» (2 захода)
Квалиф.
11
/ 9
Закрытие
34
/ 54
3
×2
5
/ 3
3
34
/ 30
≈ 14
≈ 10
Обследов.
Демо
Техзадание
Защита КП
Договор
Оплата
прошло
45 дн.
при норме 39 ·
+6 дн.
впереди ≈
24 дн.
· норма текущей исчерпана 4 дн. назад
won / allDone
· locked: узлы некликабельны, hover нет, «сегодня» нет
Квалиф.
9
/ 9
Закрытие
41
/ 54
3
2
4
26
9
6
Обследов.
Демо
Техзадание
Защита КП
Договор
Оплата
воронка пройдена за
50 дн.
при норме 63 ·
−13 дн.
выиграна 28 авг
Спека · A — строка кокпита (PipelineCockpit, рестайл)
A1 · Что меняется относительно текущего
PipelineCockpit.tsx
Пропсы, GateChip, поповер,
toggleMap
,
groupsWord
— без изменений. Меняется только разметка строки 2 и добавляется мини-карта. Компонент остаётся общим для лидов: всё новое включается наличием
gauge
/
miniMap
.
Элемент
Сейчас в проде
Макет lime
Чип «✓ N»
pill
bg-accent-l
, текст accent-text
h34 r12
bg-surface2
, текст
text-dim
12/600, галка
accent-text
. Лайм из фона уходит — он зарезервирован за «действием» (CTA) и «идёт» (заливка).
Ячейка текущей
r10, заливка на всю ячейку
FILL_BY_STATE
(бледный color-mix), «N дн.» в строке
r14, min-width 250, три строки: имя ↔ «N дн. из M по норме»; отдельная шкала h8 с маркерами «сегодня»/«норма»; подписи дат. Бледная заливка ячейки убирается — её роль берёт шкала.
BORDER_BY_STATE
остаётся.
Готовность
точки 7px accent / border2
точки 8px: met — accent + inset 1.5 accent-text (лайм на белом без обводки 1.29:1 — не читается); не met — surface3 + border2
CTA следующей
outline accent, текст accent-text, «· 90%»
h38 r13 сплошной accent + on-accent +
--shadow-accent
; вероятность из кнопки убрана (уже в metaRight и в карте).
next.locked
— surface2/text-dim + Lock, без тени.
Хвост «+N»
dashed pill, «+2 · 1 группа»
тот же, суффикс групп остаётся при
restGroupsCount
Мини-карта
нет
новый слот
miniMap?: { groups: { key, label, segments: ('done'|'current'|'todo')[] }[] }
, ml-auto; строит вызывающий из
stages
+
currentIndex
. Скрывается при ширине строки < 720 (ResizeObserver или container query
@container (max-width: 719px)
).
Шеврон
кнопка 24×24 после хвоста
в раскрытом состоянии переезжает в шапку карты как «Свернуть ⌃» (текст 11.5 text-dim); в свёрнутом — остаётся кнопкой после «+N»
Раскрытие карты
useState(false)
дефолт =
stages[currentIndex].phase_group === 'closing'
(карта важнее всего на финише); ручной выбор пользователя запоминать в
localStorage['cockpit-map:'+pipelineId]
groupLabel
mb-1
строка 1 = groupLabel ↔ metaRight на одной линии (justify space-between), mb 12; metaRight уходит из строки 2
A2 · Данные строки кокпита (ProjectDetail собирает, кокпит рисует)
Проп
Источник
Примечание
groupLabel
phaseLabel(stage.phase_group)
+ индекс группы среди уникальных phase_group активных стадий
«Закрытие · группа 4 из 4». Словарь —
lib/constants/phase-labels.ts
: attraction Привлечение · working Проработка · approval Согласование · closing Закрытие.
В макете группа «Квалификация/Оценка» — демо; в проде подписи из словаря.
pastCount / pastNames
stages.slice(0, currentIndex)
stages — активные (не is_won/is_lost), сортировка
order_index
current.name
stages[currentIndex].name
gauge
stageTimeGauge(project.stage_entered_at, resolveStageNorm(stage, org.settings.stage_target_days, org.settings.stage_dwell_defaults), now)
Тот же объект уходит в
StageProfile.gauge
. Дата нормы —
stageNormDateKey
.
gate
useStageRequirements(pipelineId)
→ требования стадии
next
+ результат RPC
check_stage_requirements
→
items[{label, met}]
,
title
«Для перехода на «Договор»»
Пусто → GateChip скрыт, коннектор accent. Whitelist полей —
GATE_FIELD_COLUMNS
.
next
stages[currentIndex+1]
→
{label: name, probability, locked: !gatePassed, onClick}
onClick открывает подтверждение перехода (как сейчас). Последняя активная стадия → next = won-стадия с label «Выиграна».
restCount / restGroupsCount
stages.length − currentIndex − 1
; уникальные phase_group после текущей, не равные текущей
metaRight
«{currentIndex+1} из {stages.length} · вероятность {stage.probability}%»
probability null → без второй части
miniMap
группы по phase_group подряд (та же группировка, что в StageRail.useMemo) → сегменты по индексу: < current done · = current · > todo
Цвет кольца current =
BORDER_BY_STATE[gauge.state]
locked
currentIndex === -1
(стадия is_won / is_lost)
Гейт, CTA, шкала и мини-кольцо скрыты; рамка ячейки
--border
; текст «Выиграна 28 авг» вместо счётчика дней
guidance
S-STAGE-STORY-1 / S-FORMAT-1, без изменений
блок «На стадии: …» под картой
A3 · Состояния строки
ok
(<70%): рамка и маркер нормы
--accent
, заливка шкалы accent, счётчик text-dim.
warn
(≥70%, days ≤ norm): рамка/маркер
--yellow
, заливка градиент accent→#E7C25A, счётчик
--yellow-text
600.
over
(days > norm): рамка/маркер
--red
, шкала заполнена red целиком (pct зажат в 100), маркер «сегодня» не рисуется (совпал бы с маркером нормы), правая подпись «норма {date} · +N дн.» red-text 600, иконка Clock перед счётчиком как сейчас.
gauge.norm == null
: шкалы нет, «N дн.» без «из M», рамка accent.
gauge == null
(лид): ячейка как в проде сейчас — одна строка, без шкалы; мини-карта не передаётся.
next.locked
: CTA surface2 + Lock, коннектор border2, title «Перейти — требования ещё не закрыты»; клик работает, отказ приходит с сервера.
locked
(терминал): см. A2. allDone — все сегменты мини-карты done, последний accent.
Узко
(< 720): мини-карта скрыта; < 560: ячейка текущей min-width 100% и строка переносится (flex-wrap) — CTA и «+N» уходят на вторую строку.
Спека · B — карта воронки (StageProfile)
1 · Место в коде и контракт
Новый презентационный компонент
src/components/shared/StageProfile.tsx
. Передаётся в
PipelineCockpit
через существующий проп
map
вместо
StageRail
— кокпит не трогаем.
StageRail
остаётся для лидов (у лида нет
stage_entered_at
и норм — профиль времени там нарисовать нечем).
Ноль запросов и знания о сущностях (как StageRail/Cockpit): все данные собирает
ProjectDetail
.
Пропсы — расширение
StageRailProps
, чтобы обработчики переехали без изменений:
interface StageProfileStage extends StageRailStage { probability?: number | null }
interface StageProfileProps extends StageRailProps {
stages: StageProfileStage[];
/** stageId → суммарно дней за все заходы (StageStory.totalByStage). Нет ключа — стадия не посещалась. */
factDays: Record<string, number>;
/** stageId → число заходов (из StageStory.segments); ≥2 — бейдж «×N». */
visits?: Record<string, number>;
/** stageId → норма дней (resolveStageNorm по каждой стадии). Пустой объект — контуры не рисуются. */
normDays: Record<string, number>;
/** Датчик текущей стадии — ТОТ ЖЕ объект, что уходит в PipelineCockpit.gauge. */
gauge: StageTimeGauge | null;
/** Возраст сделки (StageStory.ageDays) — для футера. */
ageDays?: number | null;
pipelineName?: string;
/** Прогноз финиша считается вызывающим: today + остаток нормы текущей + нормы будущих. */
forecastFinish?: string | null;
}
2 · Источники данных (что реально есть в проекте)
Что на экране
Откуда
Примечание
Факт дней прошлых стадий
useStageStory → StageStory.totalByStage
Суммарно за все заходы (cumulative). Первый сегмент открыт
projects.created_at
, а не журналом — уже учтено в
buildStageStory
.
Число заходов
StageStory.segments
, группировка по
stageId
isRevisit
на сегменте. Бейдж «×N» при N ≥ 2.
Факт текущей стадии
gauge.days
(stageTimeGauge)
Это ТЕКУЩИЙ заход, а totalByStage — все заходы. В столбике — gauge.days (согласовано с ячейкой кокпита по построению); в тултипе — «всего N за K заходов».
Норма стадии
resolveStageNorm(stage, targetDays, dwell)
В проде норма = порог phase_group: attraction 14 · working 21 · approval 21 · closing 30 (или org-оверрайд). Отдельных норм на стадию нет и колонки
target_days
не будет (S-R2-DWELL-CFG). Значит контуры внутри группы одинаковой высоты, а факты 1–4 дн. на фоне нормы 14 — короткие. Это ок: карта и должна показывать «запас», а не рисовать красиво.
Состояние текущей
gauge.state
: ok <70% · warn ≥70% · over days>norm
Та же логика, что ячейка кокпита. Ровно на норме — ещё warn.
Вероятность будущих
pipeline_stages.probability
Только в тултипе/aria — под столбиком место занято «≈ норма».
Возраст сделки
StageStory.ageDays
Сумма сегментов может быть меньше на число границ (floor) — показывать ageDays, не сумму.
Дата нормы / финиша
stageNormDateKey
(stage-norm.ts) + суммирование норм будущих
МСК-ключ дня, как у пунктира на таймлайне дедлайнов — одна ось.
3 · Математика масштаба
H = 90px
— рабочая высота столбика (колонка 110 минус число сверху).
maxDays = max(stage → max(fact ?? 0, norm ?? 0))
по всем стадиям;
pxPerDay = H / maxDays
. Подпись в шапке: «{round(pxPerDay,1)} px = 1 день». При нормах 14/21/30 → maxDays ≥ 30, pxPerDay = 3.
Высота заливки
max(3, fact × pxPerDay)
при fact > 0; fact = 0 (стадия пройдена в тот же день) — заглушка 2px и число «0».
Пересвет (fact > norm): заливка выше контура; контур превращается в горизонтальную dashed-линию нормы (без боковых граней). Цвет пересвета: прошлые —
--yellow
(история, сигнал приглушён); текущая over —
--red
(actionable, как рамка ячейки кокпита).
Текущая: заливка цвета состояния (
ok → --accent · warn → градиент #E7C25A→--accent · over → --red над нормой, --accent под
). Контур сплошной цвета состояния (
BORDER_BY_STATE
из PipelineCockpit: accent / yellow / red).
Линия «сегодня» — 2px
--text
на высоте факта текущей, выступает на 4px за столбик. Единственный элемент, который «двигается» день ко дню.
Заголовок группы: «{Σ факт} / {Σ норма}» по стадиям группы; для группы с текущей — Σ факт включает gauge.days, цвет числа = цвет состояния (yellow-text / red-text). Будущие группы — «— / {Σ норма}».
Футер слева:
ageDone = Σ факт прошлых
vs
normDone = Σ норма прошлых
, разница со знаком: «+N» yellow-text (текущая over — red-text), «−N» accent-text. Справа: «впереди ≈ {max(0, norm−days) + Σ норм будущих} дн. · финиш ≈ {date}»; при over — «норма текущей исчерпана N дн. назад».
4 · Токены (t-lime) — маппинг из макета
Роль
Токен
Где
Заливка факта, узел done, линия «сегодня», контур next
--text
#17171C
.fill · .node.done · .today
Контур нормы, ось, узел todo, разделители групп
--border2
#D5D0C6
.contour · .bars border-bottom · .group+.group
Hairline над картой
--border
.profile border-top
Все микроподписи 10–10.5px
--text-dim
НЕ #8A8A94 — в lime его нет намеренно (контраст на зонах < 3:1). Второстепенность делать opacity .7 внутри text-dim-строки или весом 400.
Текущая ok · узел current · «−N» в футере
--accent
заливка ·
--accent-text
текст
лайм — только как заливка, текстом лайм не печатать
warn / пересвет прошлых
--yellow
заливка ·
--yellow-text
текст
over текущей
--red
·
--red-text
Hover колонки
--surface2
r 8 8 0 0; при locked — нет
Focus-ring
--tw-ring-color
(= --accent-text в lime)
outline 2px offset −2, как у кнопок StageRail
Радиусы
3 3 0 0 (прошлые/контуры), 4 4 0 0 (текущая/next/todo)
крупнее у пустых — иначе пунктир «рвётся» на углах
Шрифт: Inter (
--font-app
),
font-feature-settings:'cv11'
, все числа
tabular-nums
. Другие темы: цвета берутся из тех же токенов автоматически, специальных веток не нужно; проверить только frost/aurora — там
--border2
может быть слишком светлым для пунктира, тогда
color-mix(in srgb, var(--border2) 70%, var(--text))
(прецедент —
--cal-line
).
5 · Интеракции
Колонка —
<button>
целиком (число + столбик), как узел StageRail. Клик по done →
onStageClick(id)
(откат, подтверждение — у вызывающего, как сейчас); по next/todo → переход вперёд. Текущая —
disabled
+
aria-current="step"
. Нет
onStageClick
⇒ карта read-only (все disabled, cursor default).
Tooltip (Radix, delay 300): «{имя} · {факт} дн. при норме {норма}» + список заходов «15 авг → 18 авг · 3 дн. · Олег» из
segments
; для будущих — «норма {N} дн. · вероятность {p}%».
aria-label
кнопки = первая строка тултипа + действие («вернуть на стадию» / «перейти»).
Клавиатура: Tab по колонкам слева направо; Enter/Space = клик. Порядок табуляции = порядок стадий, группы не перехватывают фокус.
Свернуть/развернуть — уже есть у PipelineCockpit; карта не хранит своё состояние.
Анимация появления:
.fill
scaleY 0→1, 500 ms,
cubic-bezier(.16,1,.3,1)
, transform-origin bottom, только при маунте и только под
prefers-reduced-motion: no-preference
. Смена стадии — без анимации (перерисовка мгновенная, чтобы не «прыгало» вместе с кокпитом).
6 · Состояния и краевые случаи
Случай
Поведение
gauge === null
или
normDays
пуст
Контуры и легенда «норма» скрыты, шапка без «px = 1 день», масштаб только по фактам; футер — только «прошло N дн.». (У сделок так не бывает; защита от неполных данных.)
gauge.days === null
(stage_entered_at пуст)
Текущая — пустой контур цвета accent, число «—», линии «сегодня» нет.
Стадия пропущена (перескок вперёд)
Ключа в factDays нет → столбика нет, узел done с пустым центром (кольцо --text), число «—», тултип «пройдена без захода».
Возврат (visits ≥ 2)
Бейдж «×N» 8.5/700 в правом верхнем углу колонки; факт = сумма заходов.
locked
(won/lost/converted)
Все кнопки disabled, hover нет, «сегодня» нет.
allDone
(won): все узлы done, последний — accent с галкой on-accent; футер «воронка пройдена за N при норме M · ±diff» + «выиграна {date}». lost: текущая остаётся с фактом до момента проигрыша, контур --border2, футер «закрыта {date}».
currentIndex = −1 без allDone
Как lost.
> 14 стадий / узкий контейнер
.profile-scroll overflow-x:auto
,
min-width = n × 64px
. Имена — max 2 строки (line-clamp 2), полное имя в тултипе. Группы и bars в одном скролл-контейнере — рассинхрон невозможен.
Одна группа / нет phase_group
Строка групп не рендерится (как
hasGroupLabels
в StageRail).
Очень длинная стадия (факт ≫ норм)
Она задаёт maxDays, остальные схлопываются до 3px-минимума — допустимо; при
pxPerDay < 1
подпись шапки «1 px = {N} дн.».
7 · Чек-лист приёмки
Кокпит: ok/warn/over дают рамку accent/yellow/red и совпадают с бейджем «залипла» на ProjectCard (общий порог). Гейт 1/2 → CTA с Lock, но клик открывает подтверждение. Лид (gauge null) рендерится без регрессий — снапшот LeadDetail не меняется по смыслу.
Мини-карта: число сегментов = числу активных стадий, группы = порядок phase_group; исчезает при ширине < 720 без переноса строки.
Столбик текущей и ячейка кокпита показывают одно число дней и одно состояние (общий
gauge
).
Заголовок группы «Σ факт» = сумме чисел над столбиками группы; футер «прошло» =
ageDays − gauge.days
± границы floor (см. комментарий к ageDays в stage-story.ts).
Пунктир нормы у всех стадий одной группы на одной высоте (пока нет org-оверрайда по stage_id).
Tab проходит все стадии, focus-ring виден на лайме и на белом; текущая пропускается (disabled).
Reduced-motion: заливка появляется без анимации.
Скрин при 11 стадиях на ширине карточки 900 и 640 — без переносов чисел, группы выровнены со столбиками.
Юнит-тесты на чистую функцию раскладки
buildStageProfile(stages, factDays, normDays, gauge)
→
{ pxPerDay, columns[], groups[], footer }
: пересвет прошлой, over текущей, пропущенная стадия, revisit, отсутствие норм.
"
