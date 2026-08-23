# Карточка сделки в AI-native CRM: Attio · Twenty · Clarify · Day.ai — глубокий ресерч

**Дата:** 2026-08-23
**Метод:** Attio Help Center + changelog 2025–2026, docs.twenty.com + код twentyhq/twenty (raw-файлы twenty-ui), docs.clarify.ai + clarify.ai (pricing, product roundup), day.ai + подкаст Sequoia + обзоры (Breakcold, Salesdorado, Lightfield, BVP). Углубление прошлых анализов `attio-analysis-2026-07-12.md` и `twenty-analysis-2026-07-12.md` — базовые gap-матрицы не пересказываются.
**Метки честности:** [COMPUTED] — из кода/официальных доков с точными значениями; [ESTIMATED] — оценка по скриншотам/описаниям; [обзор] — сторонний обзор (в т.ч. конкурентов — читать с поправкой); [не подтверждено] — не удалось верифицировать.

---

## 1. Анатомия record page по системам

### 1.1 Attio — Deal record page (эволюция 2025 → 2026)

Хронология изменений (по changelog):

| Когда | Что | Смысл для карточки |
|---|---|---|
| апр 2025 | AI insight templates для звонков | конфигурируемые AI-разборы звонков |
| июн 2025 | **Record overview page** + **Record widgets** | вкладка Overview: «весь контекст без хождения по вкладкам»; до 6 drag&drop-виджетов из любых атрибутов |
| дек 2025 | Auto summaries and labels | однострочные AI-сводки и авто-ярлыки на входящих письмах |
| янв 2026 | **Emails on Deals and Custom Objects** | письма впервые появились на сделке (раньше — только People/Companies) |
| фев 2026 | Files on Deals | файлы на сделке |
| май 2026 | **Record page redesign** («rebuilt for speed») | текущий layout, см. ниже |
| июн 2026 | New activity timeline | task events + фильтры + сворачивание automation-событий |
| июл 2026 | **Formula attributes** | вычисляемые атрибуты (Pro+) |

**Layout после редизайна (май 2026):**

```
┌──────────────────────────────────────────────────────────────┐
│ Название записи + key info + primary actions — ВСЁ top-left   │
│ (Compose email · Add to list · New note · Run workflow ·      │
│  New task · иконки подключённых apps; порядок настраивается)  │
├───────────────┬──────────────────────────────────┬───────────┤
│ Detail panel  │ Main area — вкладки:             │ Comments  │
│ (слева)       │ Overview | Activity | Emails |   │ (из       │
│ · Record      │ Files | Notes | Tasks | Calls |  │ header-   │
│   Details     │ relationship-вкладки             │ sidebar)  │
│   (атрибуты   │                                  │           │
│   секциями)   │ Overview: до 6 highlight-        │           │
│ · Lists       │ widgets сверху + сводка          │           │
│   (compact/   │ контекста (встречи, письма,      │           │
│   standard)   │ задачи)                          │           │
└───────────────┴──────────────────────────────────┴───────────┘
```

Ключевые свойства:

- **Detail panel перенесён влево** — «атрибуты там, куда взгляд падает первым»; секции ресайзятся перетаскиванием разделителей.
- **Поиск по атрибутам** в панели: полный список + фильтр по имени, без скролла. Секции атрибутов создаются («+ Add section»), перетаскиваются; «View all values» раскрывает свёрнутое.
- **Highlight widgets** — до 6 атрибутов на верху Overview («+ Add widget»); пример конфигурации Deal из changelog: stage, estimated value, linked people/company.
- **Конфигурация per-object, workspace-wide**: ⋮ → «Configure page»; право — админ или Full access к объекту. То есть карточку настраивает команда один раз, а не каждый себе.
- **Emails на Deal** — механика источника: письма подтягиваются (1) по домену привязанной компании и/или (2) по email привязанных людей; можно завести **несколько email-вкладок с разными источниками** (например, «вся переписка компании» и отдельно «переписка с юристом»).
- **Timeline (июнь 2026)**: события задач (overdue / upcoming / completed) в ленте; фильтр по типу события, выбор **запоминается per object**; automation-события **свёрнуты по умолчанию** — сигнал не тонет в логе роботов.
- **Comments** — отдельная правая панель из header, threads → reply/View thread, resolve (галочка, скрывает не удаляя, фильтр «Show resolved comments»), @mentions с in-app и email-уведомлениями, emoji-реакции. Фиды комментариев на record и на list entry — раздельные (у list может быть уже область видимости).
- **Tasks**: content + due date (натуральный язык: «call Tuesday at 7pm») + assignee + linked records через `@`; живут на Home («due today/tomorrow/overdue»), на странице Tasks и во вкладке записи; с июня 2026 — ещё и в timeline записи.
- **Merge**: авто-детекция дублей по domain (companies) / email (people); merge ручной, «правая» запись приоритетна, объединяются list entries, notes, tasks, comments, для людей — и письма. **Deals и custom objects мержить нельзя** (на момент фикса).

### 1.2 Twenty — record page как конструктор виджетов

С v2.0 (апрель 2026) страница записи — это **вкладки + виджеты на сетке**: «detail page is built from configurable tabs and widgets» — добавление/удаление/перестановка/ресайз drag&drop, layout свой у каждого объекта, сбрасывается к дефолту (v1.23).

Типы виджетов [COMPUTED из доков]: fields, related records, emails, timeline, tasks, notes, files, charts, iframes. Важные релизы вокруг карточки:

| Версия | Дата | Для record page |
|---|---|---|
| 1.12–1.14 | дек 2025 | side panel открывается рядом с контентом (не поверх), ресайзится |
| 1.15 | янв 2026 | «Updated by» на записи |
| 1.16 | янв 2026 | файлы прикрепляются к записям |
| 1.20–1.21 | мар–апр 2026 | создание/редактирование полей прямо со страницы записи; **email thread widget с inline-композером ответа** |
| 1.22 | апр 2026 | rich-text widget в layout |
| 2.0 | апр 2026 | конструктор layout, git-backed версии схемы, scaffold из Claude Code/Cursor |
| 2.8 | май 2026 | long-form текст редактируется в виджете с автосохранением |
| 2.9 | июн 2026 | relation-таблицы как полноценные таблицы внутри записи |
| 2.16 | июн 2026 | **live email/calendar вкладки** (авто-обновление) |
| 2.24 | июл 2026 | drag&drop виджетов между вкладками записи |
| 2.26 | июл 2026 | **related records внутри записи как table / kanban / calendar / grouped table**; preview записи в command bar до открытия |

Паттерн навигации: клик по записи → **side panel (500px [COMPUTED]) с быстрым обзором** → «Open» на полную страницу. Это двухступенчатый peek, которого нет у нас.

### 1.3 Clarify — карточка, которую пишет система

Объектная модель: People, Companies, **Deals**, **Meetings (first-class объект!)**, Lists («saved filters across people, companies, or deals — dynamic, not static»), Inbox.

Карточка сделки:

- **Rolling deal summary** — «Clarify generates a rolling summary of each deal — pulling from emails, meetings, and notes»; живёт прямо на карточке и доступна через чат-ассистента Rep. 20 кредитов за генерацию.
- **Deal detection** — сигналы покупки распознаются в письмах/встречах → сделка **создаётся автоматически** (20 кредитов/сделка); в обзорах отмечено и авто-движение по стадиям по паттернам активности [обзор Breakcold].
- **Официальная позиция по полям**: «AI suggestions are suggestions. Clarify never auto-updates your records» — предложения по полям показываются для approve, тихой перезаписи нет (10 кредитов за suggestion).
- **AI fields**: кастомное поле с промптом; через insert-menu в промпт подключаются источники — **транскрипты встреч, письма, данные записи** (без явного подключения AI видит только значения полей). **Регенерируются автоматически при создании/обновлении записи**, 3–30 кредитов за autofill. Это ключевое отличие от Attio (там пересчёт ручной).
- **Meetings**: записи звонков (Zoom/Meet/Teams) → транскрипт, топики, action items → задачи (10 кр/задача), summary 30 кр; meeting prep — сводка перед встречей из писем + прошлых action items + контекста сделки (30 кр). Ретроспективный синк прошлых встреч [обзор].
- **Rep (агент-ассистент)**: постоянный «Rep island» — чат-бар, вызывается кликом, `/` или Cmd+J, живёт при навигации; отвечает по письмам/встречам/заметкам/CRM + веб-поиск (бесплатно); обновляет записи, стадии, суммы, bulk-правки; письма отправляет только после «Allow once / Always allow».
- **Экономика**: unlimited seats, «pay for work done, not seats filled»: Free — 1 000 кредитов/мес, Starter — $50 / 5 000 кредитов (доп. 5k — $50), Growth — custom. Запись встреч и фоновый enrichment — бесплатны.
- Слабости по обзорам: один пайплайн, слабая аналитика, сложный модуль автоматизаций, непрозрачный прогноз расхода кредитов [обзор].

### 1.4 Day.ai — «Waymo of CRM»

Архитектура: **Context Graph / Customer Memory** — пассивная инжестия из звонков (Zoom), Gmail, календаря, Slack, Gong; «capture first, structure later» — свойства **ретроактивно** заполняются по всей истории коммуникаций при добавлении новой структуры. Через 4–8 часов после подключения система сама строит контакты, компании и сделки [подкаст Sequoia].

- **Pipeline на естественном языке**: пользователь описывает стадии и критерии словами; система двигает сделки по контексту разговоров; «no rigid setup», настройка ~10 минут [обзор Lightfield].
- **Принцип автономии** («fingers lightly on the wheel», внутренний документ «Rules of the Game»): «You have to see why the AI did what it did. You have to be able to override it as a person and know that you're overriding it, not have it flip back» — каждое авто-действие имеет provenance (ссылку на исходный разговор), override человека не перетирается.
- **Q&A**: ответы по всей клиентской истории на естественном языке, каждое утверждение линкуется на письмо/тред встречи.
- **Агенты** — ролевые (CRM Data Specialist — двигает сделки по стадиям, Sales Engineer, RevOps Analyst, BDR, Closer Coach), со «skills» и «job training», по расписанию/событиям; гардрейлы — черновики и флаги, не самовольные действия. Тарификация **by the agent, not by the seat**.
- **MCP-сервер** для Claude/Cursor — память о клиентах доступна из внешних AI-инструментов.
- Фича «Pages» (генеративные страницы-документы) из ранних версий на текущем сайте не акцентируется [не подтверждено на 2026].
- Критика [обзор Lightfield — конкурент]: «retrieval ceiling» — суммаризация последних касаний без глубокой динамики отношений; требуется навык промптинга; тарифы до $250/мес.

---

## 2. Механики: 16 разборов

Формат: **как работает / данные / UI / аналог в dashboard-crm / что перенять**.

### М1. Highlight widgets (Attio)
**Как:** до 6 атрибутов выведены плитками на верх Overview; drag&drop выбор из любых атрибутов; конфиг per-object на весь workspace. **Данные:** любой атрибут, включая derived (stage, value, next due task). **UI:** ряд плиток над timeline. **У нас:** кокпит стадий + health + completeness — фиксированный. **Перенять:** сделать «шапку» карточки конфигурируемой на уровне org (JSONB в `organizations.settings`, whitelist полей) — вертикальный кокпит остаётся, но админ выбирает 2–3 доп. плитки (сумма, дата КП, вероятность).

### М2. AI attributes (Attio) — авто-заполнение полей
**Как:** при создании атрибута включается тумблер «AI autofill»; 4 задачи: **Research Agent** (веб-ресерч), **Classify Record** (select/multi-select по данным записи), **Summarize Record**, **Prompt Completion** (кастомный промпт с переменными-атрибутами). Критично: **значения считаются только вручную** — hover по ячейке или bulk «Recalculate values with AI»; авто-рефреша нет; пустой ответ — без списания. **Данные:** только значения атрибутов записи (+веб для Research); **emails/calls/notes агенту атрибутов недоступны**. **UI:** ячейка со sparkle; web-агент отдаёт **confidence rating + reasoning + полные цитаты-источники** (март 2026). **Кредиты:** 10 за web-запись, 1 за остальные. **У нас:** AI-модалка (бриф/сводка), полей-автозаполнения нет. **Перенять:** формат выдачи — «значение + уверенность + источник» для любых AI-подсказок; и честное правило Attio: AI-поле не пишет само, пока человек не нажал.

### М3. AI fields (Clarify) — противоположная школа
**Как:** поле с промптом; источники подключаются явно через insert-menu (транскрипты, письма, поля записи); **регенерация автоматическая при create/update записи**; результат — suggestion на approve, не тихая запись. **Кредиты:** 3–30 за autofill. **Сравнение школ:** Attio — ручной пересчёт, авто-запись значения; Clarify — авто-пересчёт, ручное принятие. **Перенять:** гибрид для dashboard-crm — пересчёт по событию (новый транскрипт/смена стадии), но результат в **слой предложений** (см. М14), не в поле.

### М4. Formula attributes (Attio, июль 2026)
**Как:** вычисляемые атрибуты, «update automatically»; есть **history functions** («как значение менялось во времени»); работают в views, workflows, reports, sequences; формулу можно описать словами — «Start by describing your formula and let Attio build it». Кейсы: deal alerts, weighted pipeline, lead scoring. Pro+. **У нас:** health score 0–8 и days-in-stage уже считаются нативно. **Перенять:** идею «формула = атрибут, живущий в тех же строках панели» — weighted value (`amount * probability`) как generated column / view, отображаемый тихой строкой атрибутов, а не отдельным виджетом.

### М5. Timeline: фильтры, task events, свёрнутые роботы (Attio)
**Как:** в ленте — история + задачи (overdue/upcoming/completed); фильтр по типу события с памятью per object; **automation-события свёрнуты по умолчанию**. **Перенять:** это готовый спек для EntityTimeline: (1) фильтр-чипы по типу; (2) localStorage-память per entity type; (3) группировка событий автоматизаций/системных в свёрнутый кластер «N системных событий»; (4) будущие задачи в ленте над «сегодня».

### М6. Письма на сделке через правило маппинга (Attio, янв 2026)
**Как:** сделка не имеет своего email; вкладка Emails конфигурируется источником: домен привязанной компании ИЛИ адреса привязанных людей; допускается несколько вкладок с разными источниками. **Перенять (когда появится email-интеграция):** не хранить письма «на сделке», а **выводить по правилу** от связанных контактов/компании — у нас уже есть стейкхолдеры с ролями, правило «письма всех стейкхолдеров сделки» ложится на существующую схему без новой таблицы связей.

### М7. Communication intelligence (Attio)
**Как:** 9 read-only «smart attributes» из синка почты/календаря: first/last interaction (+email/calendar-варианты), next calendar interaction, **connection strength** («weighting the recency and frequency of the communication»), strongest connection (кто в команде ближе всех к контакту). **UI:** фиолетовая подсветка + sparkle — системные значения визуально отличимы от ручных. **У нас:** `last_touch`, `next_action_date` — деривативы есть. **Перенять:** (1) метрику «сила связи» из частоты+свежести активностей по стейкхолдерам (без почты — по звонкам/встречам/задачам); (2) **«strongest connection»** — кто из команды реально держит контакт; (3) визуальный язык: derived-значения помечать единым маркером.

### М8. Call Intelligence + insight templates (Attio, апр 2025 →)
**Как:** бот приходит в Meet/Zoom/Teams, транскрипция 100+ языков, hover по спикеру → карточка человека, transcripts можно перегенерировать; **insight templates** — секции вида «title + prompt + format (Text|List)», пресеты (Sales, Success, …), **default template применяется к каждой встрече автоматически**; шаринг сниппетов и секций звонка; авто-рассылка recap-писем. Инсайты — read-панель; авто-запись в атрибуты записи в доках не заявлена. **У нас:** транскрипты + SPIN/протокол-пресеты — это и есть наш insight template, но зашитый в код. **Перенять:** вынести пресеты в **org-словарь шаблонов** (title+prompt+format секциями) + default per тип встречи; hover-карточка участника в просмотре транскрипта.

### М9. Auto summaries and labels на письмах (Attio, дек 2025)
**Как:** каждому входящему письму — однострочная AI-сводка в превью + авто-ярлык класса (invoice, hiring, meeting request) «the moment they arrive». **Перенять:** тот же паттерн к «Активности»: однострочная AI-сводка для длинных элементов таймлайна (транскрипт, протокол) прямо в ленте — раскрытие по клику.

### М10. Ask Attio → действия с HITL-превью (апр 2026)
**Как:** запрос словами («создай задачу по итогам встречи», «обнови застрявшую сделку») → «Attio will show you exactly what it's about to do and wait for your go-ahead»; контекст диалога тянется через notes/tasks/records/emails; работает и из Slack. **Перенять:** формат подтверждения — **диф предполагаемых изменений** (поле → старое → новое) в AiWorkspaceModal как единый примитив для всех AI-операций записи.

### М11. Comments & mentions на записи (Attio)
**Как:** панель комментариев из header (не покидая записи), threads, resolve с фильтром resolved, @mentions (in-app + email), реакции; отдельные фиды record vs list entry из-за областей видимости. **У нас:** вкладка Чат на сделке есть. **Перенять:** (1) resolve-механику для тредов (обсуждение → решено, скрыто, но восстановимо); (2) комментарии, привязанные к **конкретному полю/элементу timeline**, а не только общий чат [ESTIMATED — у Attio привязка на уровне записи/entry].

### М12. Deal detection + рождение сделки из сигналов (Clarify)
**Как:** буying signals из писем/встреч → авто-создание сделки (20 кр), связка с компанией/людьми, стадия — из активности; «Free features: meeting recording, background enrichment». **Перенять концепт без почты:** «кандидаты в сделки» из активности — например, встреча/звонок по компании без открытой сделки → карточка-предложение «создать сделку?» в TodayView (не тихое создание — suggestions-модель).

### М13. Rolling deal summary (Clarify)
**Как:** скользящая сводка сделки из emails+meetings+notes, обновляется по мере событий, живёт на карточке, доступна агенту. **У нас:** AI-сводка по кнопке. **Перенять:** авто-инвалидация сводки при новом событии таймлайна: бейдж «сводка устарела (3 новых события)» + фоновая регенерация по правилу (например, после каждой встречи) со штампом «на 14:30, из 12 событий» — честный stale-индикатор.

### М14. Слой предложений вместо тихой записи (Clarify + Day.ai — общий закон)
**Как:** обе «автономные» CRM сходятся к одному: создавать записи можно тихо, **менять поля — только через предложение с provenance**; у Day.ai жёстче: видно «почему AI так решил», override не «flip back». **Перенять:** таблица `ai_suggestions` (org_id, entity, field, proposed_value, source_ref → ai_run/транскрипт, status pending/accepted/rejected, decided_by/at). Отклонённое предложение не повторяется для того же источника — это и есть «override не перетирается».

### М15. Record page как виджетный конструктор (Twenty)
**Как:** вкладки+виджеты на сетке, per-object layout, relation-виджеты рендерят связанные записи как table/kanban/calendar внутри карточки; side panel 500px как peek-уровень; поля создаются прямо со страницы записи. **Перенять:** не конструктор (мы вертикальные), а два приёма: (1) **peek-панель** сделки из пайплайна/списков — 480–520px,核 атрибуты + последние события + next step, «Open» на полную; (2) related-виджет «задачи сделки» с переключателем список/доска внутри карточки.

### М16. Merge и дедуп (Attio / Twenty)
**Как (Attio):** авто-детект по domain/email; merge ручной: выбрать дубль, порядок записей определяет приоритет («правая» остаётся), объединяются notes/tasks/comments/entries/emails; deals не мержатся. **(Twenty):** record merge с v1.3 (авг 2025) — «combining information and linked data»; дубликаты подсвечиваются при вводе email-получателей (v2.20). **Перенять:** дедуп только для `companies` (по ИНН/домену) и `contacts` (по email/телефону) — RPC `merge_records` с перевешиванием FK + журналом; для сделок не делать (Attio тоже не делает — прецедент).

---

## 3. Визуальные приёмы: как достигается «спокойный» data-dense UI

### 3.1 Twenty — точные токены [COMPUTED из twenty-ui, main@2026-08]

Источник: `packages/twenty-ui/src/theme/constants/*.ts` + `packages/twenty-front/src/index.css`.

**Типографика.** База: `font-size: 13px` на корне, `Inter, sans-serif`. Шкала — в rem от 13px:

| Токен | rem | px (при базе 13) | Роль |
|---|---|---|---|
| xxs | 0.625 | ~8 | микро-метки |
| xs | 0.85 | ~11 | meta, счётчики |
| sm | 0.92 | ~12 | secondary text, лейблы |
| md | 1 | **13** | body — весь рабочий текст |
| lg | 1.23 | 16 | заголовки секций |
| xl | 1.54 | 20 | заголовок страницы |
| xxl | 1.85 | 24 | hero-значения |

Веса — ровно три: 400 / 500 / 600 (`regular/medium/semiBold`). Line-height: 1.1 (плотные строки UI) и 1.5 (текст).

**Цвет текста — роли по 12-шаговой шкале серого** (Radix-структура, display-p3): primary=gray12 (20% чёрного), secondary=gray11 (40%), tertiary=gray9 (60%), light=gray8, extraLight=gray7. Четыре легитимных «серых» — вот откуда иерархия без жирного.

**Фоны:** primary=gray1 (белый), secondary=gray2 (0.988 — едва отличим), tertiary=gray4, quaternary=gray5. Панели отличаются от полотна на ~1% светлоты — глубина без границ.

**Границы:** light=gray4, medium=gray5, strong=gray6 (0.945/0.922/0.839) — все светлее любого текста.

**Радиусы:** xs 2 / sm 4 / md 8 / lg 16 / pill 999. Рабочие поверхности — 4 и 8.

**Тени — почти нулевые:** `light: 0 2px 4px alpha-gray2 + 0 0 4px alpha-gray5`; сильная тень зарезервирована за оверлеями (`strong`, `superHeavy`). Карточки в основном разделяются фоном и границей, не тенью.

**Иконки:** размеры 14/16/20/24, stroke 1.6/2/2.5 — иконка в тексте всегда 14–16px со stroke 2 (Tabler).

**Spacing:** `spacing(n) = n × 4px` (multiplicator 4), `betweenSiblingsGap: 2px`, table cell padding 8px по горизонтали, checkbox-колонка 32px, **side panel 500px**.

**Формула бейджа/тега** (TagLight): фон = шаг **3** цветовой шкалы, текст = шаг **11** той же шкалы (например, `blue3`/`blue11`). 30 именованных цветов, но все построены одной формулой — поэтому любые статусы выглядят родственно и не кричат. Акцент — indigo (шаг 9 как основной, 3–5 как заливки).

**Итог-рецепт «спокойствия» Twenty:** 13px база + 3 веса + 4 серых текстовых роли по одной шкале + границы светлее текста + фоновые перепады ~1% + тени только на оверлеях + один акцент + единая формула 3/11 для всех цветных меток.

### 3.2 Attio — принципы и оценки

Официально сформулированные принципы дизайн-команды (Verified Insider, интервью команды): **Restraint** («Nothing is asking for your attention. The best version always has less in it than the one before»), Honesty, Inevitability, Charm; зрелая дизайн-система «поднимает пол» качества и служит семантическим контекстом для AI.

Наблюдаемые приёмы [ESTIMATED по скриншотам/докам, точные px не подтверждены кодом]:

- Шрифт Inter (в вебе подтверждён; в приложении — [ESTIMATED]); body в таблицах/панелях ~13px, метки атрибутов ~11–12px muted.
- **Цвет как метка происхождения данных**: enriched/system-значения — лиловая подсветка + sparkle-иконка; «машинные» данные отличимы от ручных на взгляд. Это редкий и сильный приём.
- Атрибуты в панели: строка «иконка 14–16px + label muted + значение primary», вертикальный ритм плотный [ESTIMATED ~28–32px на строку].
- Automation-события в timeline свёрнуты — управление шумом на уровне контента, не только стилей.
- Кнопки действий записи — ряд icon-кнопок с подписью, порядок настраивается; никакого «primary-зоопарка» — одна акцентная кнопка на экран.

### 3.3 Что из этого — прямой чек-лист для dashboard-crm

1. Проверить, что «серых» текстов у нас ровно 3–4 роли и все с одной шкалы (у Twenty — 12/11/9/8).
2. Все статусные бейджи привести к формуле «шаг 3 фон / шаг 11 текст» от одной палитры (у нас CSS-переменные тем — формула ложится идеально).
3. Тени: оставить только на оверлеях/поповерах; карточки — граница gray4–5 + фон gray2.
4. Иконки Lucide: зафиксировать 14/16 + stroke 2 в рабочей зоне (у Twenty это токен, не соглашение).
5. Derived/AI-значения — единый маркер (sparkle/точка одного цвета), как лиловый у Attio.
6. Automation-события в таймлайне — сворачивать кластером по умолчанию.

---

## 4. Тренд «CRM без ручного ввода»: что реально работает в 2025–2026

**Спектр автономии** (по нарастанию):

| Система | Авто-создание записей | Авто-поля | Авто-стадии | Контроль |
|---|---|---|---|---|
| **Attio** | People/Companies из почты/календаря; сделки — нет | AI attributes **вручную/bulk**; enrichment авто, но не перетирает ручное | нет | HITL-превью действий Ask Attio; citations+confidence у web-агента |
| **Twenty** | нет (workflow-триггеры + AI-шаги) | AI-шаги workflow (enrichment, classification, summary) | нет | агенты в рамках ролевой permission-модели |
| **Clarify** | контакты, компании, **сделки** (deal detection), встречи | AI fields авто-регенерация, но **как suggestion** | по активности [обзор]; офиц.: «never auto-updates your records» | approve каждого изменения поля; Allow once/always для писем |
| **Day.ai** | всё, включая пайплайн, за 4–8 часов после коннекта | ретроактивное заполнение свойств по всей истории | стадии из контекста разговоров | provenance каждого решения; override не перетирается |

**Что реально работает (консенсус источников):**

1. **Auto-capture как фундамент** — синк почты/календаря/звонков создаёт записи и активности. Это решённая задача у всех четырёх; спор идёт выше.
2. **Поля — через предложения.** Даже «autonomous» Clarify официально не пишет в поля без approve. Тихая запись осталась только у enrichment-атрибутов Attio (и те не перетирают ручной ввод).
3. **Объяснимость = валюта доверия.** Attio: confidence + reasoning + citations; Day.ai: provenance до исходного разговора; Clarify: suggestion с источником. Без этого авто-значению не верят и его перепроверяют — выигрыш нулевой.
4. **Встреча стала first-class сущностью** (Clarify Meetings, Attio Calls + insight templates) — транскрипт больше не вложение, а узел данных, из которого растут задачи, сводки и поля.
5. **Rolling summary вытесняет статичное «описание сделки»** — сводка, которая штампуется временем и пересобирается по событиям.
6. **Экономика — кредиты за работу AI**, а не seats (Clarify unlimited seats; Attio workspace+seat credits; Day.ai — by agent). Для internal-tool это неважно, но объясняет, почему у вендоров пересчёт полей ручной/дозированный.

**Что НЕ работает / преувеличено:**

- «Полная автономия» — Breakcold о Clarify: «cannot fully run itself, at least not yet»; модуль автоматизаций сложен для нетехнических пользователей [обзор].
- Глубина понимания: критика Day.ai — «retrieval ceiling»: система суммирует последние касания, но не ловит смену тона чемпиона или предикторы проигрыша [обзор конкурента Lightfield — с поправкой].
- Чат как единственный интерфейс требует «skilled operator» [обзор].
- Прогнозы на неполных данных ненадёжны — авто-capture без дисциплины стадий даёт мусор на выходе [обзор].

**Проекция на dashboard-crm (домен без email-синка):** фундамент auto-capture у нас частично есть — транскрипты звонков/встреч (`transcripts`, `ai_runs`). Значит применимы слои 2–5 тренда: suggestions-модель, provenance (ссылка на ai_run/транскрипт), rolling summary, встреча как источник полей — **без** почтового синка, который сознательно вне домена.

---

## 5. Топ-7 переносимых идей для dashboard-crm

1. **Слой AI-предложений по полям сделки** (Clarify М3/М14 + Day.ai-принцип). Таблица `ai_suggestions` + полосa предложений на карточке: «Из встречи 21.08: бюджет → 2,4 млн; срок → Q4» с Accept/Reject по-полевому, source_ref на транскрипт, отклонённое не возвращается. Расширяет AiWorkspaceModal до диффа «поле → старое → новое» (Ask Attio М10). Это P0-кандидат: закрывает главный тренд без email-интеграции.
2. **Timeline v2 по Attio-спеку** (М5): фильтр-чипы по типу события с памятью per entity, task events (overdue/upcoming) в ленте, automation-события свёрнуты кластером. Дёшево (наш EntityTimeline готов), паритет с флагманом.
3. **Rolling summary со stale-штампом** (М13 + М9): сводка сделки с меткой «на 14:30 · 12 событий», бейдж устаревания при новых событиях, авто-регенерация после встречи; однострочные AI-сводки длинных элементов таймлайна.
4. **Insight templates как org-словарь** (М8): секции title+prompt+format(Text|List), default per тип встречи; SPIN/протокол становятся первыми пресетами, а не хардкодом. Плюс hover-карточка участника в транскрипте.
5. **Peek-панель сделки** (Twenty М15): side panel ~500px из пайплайна/списков — атрибуты ядра + последние 5 событий + next step + «Открыть карточку». Снимает половину переходов на полную страницу.
6. **«Сила связи» и «strongest connection» по стейкхолдерам** (М7): derived-метрика из свежести+частоты активностей по каждому стейкхолдеру; на карточке — кто из команды держит контакт и какие стейкхолдеры остывают. Без почты — по нашим звонкам/встречам/задачам.
7. **Токен-аудит по формуле Twenty** (раздел 3.3): 3–4 серых текстовых роли с одной шкалы, бейджи «фон шаг 3 / текст шаг 11», тени только на оверлеях, иконки 14/16 stroke 2, единый sparkle-маркер derived/AI-значений. Один спринт-полировка, системный эффект на все темы.

**Бонус-идеи вне топа:** merge для companies/contacts по домену/ИНН/email (М16); конфигурируемые highlight-плитки шапки (М1); «кандидаты в сделки» из активности без открытой сделки (М12); resolve-механика в чате сделки (М11); правило маппинга писем на сделку через стейкхолдеров — заготовка под будущую email-интеграцию (М6).

---

## Источники

### Attio (официальные)
- Changelog 2026: https://attio.com/changelog — entries: `record-page-redesign` (28.05), `new-activity-timeline` (29.06), `emails-on-deals-and-custom-objects` (14.01), `files-on-deals-and-custom-objects` (25.02), `formula-attributes-are-here` (28.07), `web-research-agent` (24.03), `ask-attio-to-take-action` (29.04), `the-new-workflows` (09.06), `new-workflow-blocks` (28.07)
- Changelog 2025: https://attio.com/changelog/2025 — `record-overview-page`, `record-widgets` (17.06), `auto-summaries-and-labels` (17.12), `ai-insight-templates-for-calls` (15.04), `default-ai-insight-templates-for-calls` (13.05), `call-transcripts-in-any-language` (14.08), `regenerate-transcripts` (14.10), `changelog-september-16-2025`
- Help: [Configure record pages](https://attio.com/help/reference/managing-your-data/records/configure-record-pages) · [Create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) · [AI attributes](https://attio.com/help/reference/attio-ai/ai-attributes) · [Communication intelligence](https://attio.com/help/reference/attio-101/productivity/communications-intelligence) · [Enriched data](https://attio.com/help/reference/managing-your-data/enriched-data) · [Comments and mentions](https://attio.com/help/reference/productivity-collaborating/comments-and-mentions) · [Tasks](https://attio.com/help/reference/productivity-collaborating/tasks) · [Merge and delete records](https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records) · [Insight templates](https://attio.com/help/reference/productivity-collaborating/call-intelligence/create-insight-templates-for-call-recordings)
- Blog: [Introducing AI Attributes](https://attio.com/blog/introducing-ai-attributes) · [Introducing Call Intelligence](https://attio.com/blog/introducing-call-intelligence)
- Дизайн-культура: [Design at Attio — Verified Insider](https://verifiedinsider.substack.com/p/design-at-attio)

### Twenty
- [Releases](https://twenty.com/releases) (v1.00 25.06.2025 → v2.26 31.07.2026) · [Layout concepts](https://docs.twenty.com/getting-started/core-concepts/layout) · [AI overview](https://docs.twenty.com/user-guide/ai/overview)
- Код [COMPUTED]: `twentyhq/twenty` main — `packages/twenty-ui/src/theme/constants/` (FontCommon, ThemeCommon, Text, Icon, BorderCommon, BorderLight, GrayScaleLight, FontLight, BackgroundLight, BoxShadowLight, TagLight, MainColorsLight, AccentLight), `packages/twenty-front/src/index.css` (base 13px, Inter)

### Clarify
- [clarify.ai](https://www.clarify.ai/) · [Pricing](https://www.clarify.ai/pricing) · [What is Clarify](https://docs.clarify.ai/en/articles/11702613-what-is-clarify) · [AI in Clarify](https://docs.clarify.ai/en/articles/12405071-ai-in-clarify) · [Rep sales agent](https://docs.clarify.ai/en/articles/13058854-rep-sales-agent) · [Product roundup May 2026](https://www.clarify.ai/blog/monthly-product-roundup-may-2026)
- Обзоры: [Breakcold review](https://www.breakcold.com/blog/clarify-ai-crm-review) · [Salesdorado review](https://salesdorado.com/en/crm/crm-software/review-clarify-ai/)

### Day.ai
- [day.ai](https://day.ai/) · [day.ai/product](https://day.ai/product) · [Sequoia Training Data — Christopher O'Donnell](https://sequoiacap.com/podcast/training-data-christopher-odonnell/) · [BVP Atlas — «Waymo of CRM»](https://www.bvp.com/atlas/lessons-from-day-ais-journey-to-becoming-the-waymo-of-crm)
- Обзоры (конкуренты, с поправкой): [Lightfield review](https://lightfield.app/blog/day-ai-review) · [Coffee.ai review](https://www.coffee.ai/articles/day-ai-crm-reviews-comparisons)

### Связанные документы репозитория
- `improvements/CRMs/attio-analysis-2026-07-12.md`, `improvements/CRMs/twenty-analysis-2026-07-12.md` — базовые gap-матрицы (не дублируются здесь)
