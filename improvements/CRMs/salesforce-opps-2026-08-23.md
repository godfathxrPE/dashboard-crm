# Salesforce Opportunity (Lightning, Sales Cloud) — глубокий ресерч страницы сделки

**Дата:** 2026-08-23
**Метод:** help.salesforce.com, Trailhead, admin.salesforce.com, Salesforce Ben, SFDC Penguin, профильные блоги (GSP, ShellBlack, Weflow, Cirrus Insight, Oliv, Sesame Software), release notes Spring '25 – Summer '26.
**Статус утверждений:** всё без пометки — подтверждено источниками из списка в конце; спорное/неточное помечено «[не подтверждено]».
**Связь:** углубляет `improvements/CRMs/salesforce-analysis-2026-07-12.md` (там — платформенный и ценовой уровень; здесь — механики и UI самой записи Opportunity). Выводы прошлого анализа (P0 SDP, P1 Quotes, P2 field audit) не пересказываются — уточняются механиками.

---

## 1. Анатомия страницы Opportunity (Lightning Record Page)

Страница собирается админом в **Lightning App Builder** из стандартных компонентов; типовой шаблон — «Header, Subheader, Right Sidebar». Канонический вид записи сделки:

```
┌────────────────────────────────────────────────────────────────────┐
│ HIGHLIGHTS PANEL: имя сделки + 4–7 полей compact layout            │
│ (Account, Amount, Close Date, Stage, Owner) + кнопки действий      │
│ (Edit, New Case, Clone, ▾ overflow)                                │
├────────────────────────────────────────────────────────────────────┤
│ PATH: шеврон стадий ▸▸▸▸▸ + [Mark Stage as Complete]               │
│  раскрытие стадии → Key Fields (≤5, inline-edit) +                 │
│  Guidance for Success (rich text ≤1000 символов)                   │
├──────────────────────────────────────┬─────────────────────────────┤
│ ОСНОВНАЯ КОЛОНКА — Tabs:             │ ПРАВЫЙ САЙДБАР:             │
│  • Activity: композер                │  • Contact Roles            │
│    (Log a Call | New Task |          │  • Opportunity Team         │
│     New Event | Email)               │  • Products related list    │
│    + Activity Timeline:              │  • Quotes related list      │
│      «Upcoming & Overdue»,           │  • Notes & Attachments      │
│      прошлое — по месяцам,           │  • Stage History            │
│      фильтры (тип/период/свои)       │  • Related Record /         │
│  • Details: Record Detail или        │    Recent Items / News      │
│    Dynamic Forms field sections      │  • Einstein Score card      │
│  • Related: related lists            │  (набор — на усмотрение     │
│  • Chatter: лента записи             │   админа)                   │
└──────────────────────────────────────┴─────────────────────────────┘
```

Ключевые свойства анатомии:

- **Highlights Panel** питается **Compact Layout** — один набор «ключевых полей» объекта, который переиспользуется в шапке записи, hover-карточках ссылок, мобильном приложении и карточках Kanban. С Winter '25 есть **Dynamic Highlights Panel**: до **12 полей**, обязательное primary-поле (Name), per-field conditional visibility (по роли, стадии, значению поля); ограничения — нет visibility-правил на primary, нет кросс-объектного primary, нет кнопки Follow.
- **Tabs-компонент** — контейнер: вкладки Details / Related / Activity (+ произвольные). Контент вкладок и аккордеонов **лениво грузится** только при открытии — приём производительности.
- **Activity-композер** — вкладки-действия Log a Call / New Task / New Event / Email прямо над таймлайном; email-вкладка работает при подключённой почте.
- **Activity Timeline** — секция «Upcoming & Overdue» (открытые задачи и события), ниже прошлые активности, сгруппированные по месяцам, с «View More». Фильтры (иконка-воронка): период, тип активности, «только мои». Есть Expand All. Поля внутри записей таймлайна админ настраивает compact layout'ами Task/Event/EmailMessage.
- **Details** — либо монолитный Record Detail (page layout), либо **Dynamic Forms**: field sections как первоклассные компоненты страницы с conditional visibility (см. §2.10).
- Правый сайдбар — related lists и виджеты: Contact Roles, Opportunity Team, Products, Quotes, Stage/Field History, плюс утилитарные Related Record (компакт-карточка связанной записи), Recent Items, News (новости по компании-аккаунту).
- Одна страница ≠ один вид: через App Builder делаются **разные страницы на роль/record type/приложение** + component visibility. Это сила (таргетирование) и слабость (зоопарк конфигураций).

---

## 2. Механики (14)

### 2.1 Path: шеврон стадий + Key Fields + Guidance for Success

**Как работает.** Горизонтальный шеврон всех стадий; текущая подсвечена, клик по стадии раскрывает панель с двумя блоками: **Key Fields** (до 5 полей, inline-редактируемых при праве записи) и **Guidance for Success** (rich text до 1000 символов, поддерживает ссылки и изображения). Кнопка **Mark Stage as Complete** двигает сделку вперёд; выбор Closed-стадии открывает диалог выбора Closed Won / Closed Lost. Hover по пройденной стадии показывает, сколько запись в ней провела. Path настраивается per record type (у «New Business» и «Renewal» разные пути).
**Данные.** Стадии — picklist Stage; key fields и guidance — конфигурация Path per stage; никакой отдельной таблицы прогресса.
**UI.** Компонент можно держать свёрнутым; опция «Remember user's Path preferences» хранит состояние per user. Key Fields + Guidance показываются и на карточках Kanban. Для Closed Won/Lost guidance не показывается.
**Аналог в dashboard-crm.** Кокпит стадий: группы фаз, датчик времени в стадии, server-enforced гейты, вероятность. Наш кокпит **сильнее** по enforcement (у SF гейты — обходимые validation rules), но у нас нет per-stage методических подсказок.
**Что перенять.** **Guidance for Success** — стадийная шпаргалка (что сделать, регламент ЧЗ/1С, ссылка на шаблон КП) прямо в кокпите; и явный список «ключевые поля этой стадии» — у нас это неявно зашито в completeness/gates, SF показывает их списком с inline-edit до того, как гейт ударил.

### 2.2 Celebrations (конфетти)

**Как работает.** В настройке Path админ включает celebrations и выбирает, **на каких стадиях** сыпать конфетти на весь экран, с частотой (например, «always» на Closed Won). Рекомендация самих админов — не злоупотреблять, иначе эффект выгорает.
**Аналог.** Win Wizard есть, празднования нет.
**Что перенять.** Одноразовый confetti-burst при завершении Win Wizard (CSS/canvas, ~0.05 спринта). Дёшево, заметно, любимо пользователями SF.

### 2.3 Highlights Panel + Compact Layout как «единая шапка»

**Как работает.** Compact layout объекта определяет поля шапки; они же — в hover-preview ссылок на сделку из любых списков, в мобильной шапке и на Kanban-карточках. Dynamic Highlights Panel (Winter '25) добавляет 12 полей и per-field видимость (например, поле «Причина проигрыша» — только на закрытых).
**Данные.** Чистая конфигурация отображения.
**Аналог.** Шапка карточки сделки + completeness-бейдж. Hover-карточек по ссылкам на сделку нет.
**Что перенять.** Принцип «**один набор ключевых полей — все поверхности**»: наша конфигурация ключевых полей сделки должна одинаково питать шапку, карточку канбана и (будущие) hover-превью, а не дублироваться в трёх компонентах.

### 2.4 Activity Timeline + композер

**Как работает.** См. §1. Существенно: activity — это Task/Event/EmailMessage, привязанные к сделке через WhatId; таймлайн — агрегатор с «Upcoming & Overdue» сверху (просроченное видно первым — это push к гигиене), прошлым по месяцам, фильтрами и Expand All. Админ выбирает default view организации: Activity Timeline или Related Lists.
**Аналог.** Вкладка «Активность» (timeline + композер) — паритет по структуре. У нас нет email-канала в композере (нет интеграции почты — осознанно).
**Что перенять.** Секция-группировка **«Предстоящее и просроченное»** над историей, если её ещё нет как отдельного яруса: SF-паттерн — просроченные задачи живут не в прошлом, а в будущем-ярусе с красной меткой. Плюс compact-конфигурация того, какие поля видны в свёрнутой строке таймлайна.

### 2.5 Einstein Activity Capture (EAC)

**Как работает.** Подключает Gmail/Microsoft 365 (почта + календарь), фоново матчит письма/встречи к контактам/лидам/сделкам по email-адресам участников и показывает их в таймлайне. Настройки шаринга: private / team / org. Классические ограничения: вложения не захватываются, направление — только в SF, кастомные объекты почти не матчатся.
**Перелом Summer '25:** «Sync Email as Salesforce Activity» — новые письма сохраняются **нативными EmailMessage/Task-записями** в БД Salesforce (раньше — внешний AWS-стор с 24-мес. retention, невидимый стандартным отчётам). Теперь письма попадают в Report Builder, API и record-triggered flows; расплата — расход storage; включение **необратимо**. Исторические данные автоматически не мигрируют.
**Аналог.** Нет (email-интеграции нет — осознанно).
**Что перенять.** Не механику, а **урок хранения**: «активности во внешнем сторе, невидимые отчётам» были главной болью EAC много лет, и SF капитулировал в пользу нативных записей. Для нас: любые будущие интеграции (звонки, транскрипты, telegram) — сразу первоклассными строками в Postgres, не сторонним стором.

### 2.6 Einstein Opportunity Scoring

**Как работает.** Скор 1–99 (вероятность выигрыша) на записи, в list views, отчётах, форкастах, Pipeline Inspection. При наведении — **contributing factors**: положительные (прошлые победы по аккаунту, быстрое движение по стадиям, высокая активность, открытые квоты) и отрицательные (прошлые проигрыши, передвинутый/просроченный close date, низкая активность, слабая отрасль). Модель строится на закрытых сделках орга (record details, history, activities, аккаунт, products/quotes/pricebook); требования к своей модели: по 200 closed-won и closed-lost за 2 года (жизнь ≥2 дня); пока данных мало — **глобальная модель** на анонимизированных данных клиентов SF. Модель пересчитывается раз в месяц, скоры записей — каждые несколько часов. Скоров нет на закрытых сделках; факторы видны только по доступным пользователю полям. Иногда скор без факторов («много мелких причин»). В Pipeline Inspection скор показывается ярусами High/Medium/Low с цветом, а не числом. Spring '26 — программа «Einstein Opportunity Scoring for Everyone»: расширение доступности на все Sales Cloud лицензии [детали редакций не подтверждены].
**Аналог.** Health score 0–8 — **rule-based, объяснимый по построению**. Наш путь для команды 5–15 правильный: 200+200 закрытых сделок за 2 года у нас физически нет.
**Что перенять.** Не ML, а **UX объяснения**: (а) факторы со знаком «+/−» при наведении/клике на health score — какие правила добавили и сняли балл; (б) ярусность High/Medium/Low цветом в списках вместо числа; (в) правило SF «не показываем скор на закрытых» — health score гасить после won/lost.

### 2.7 Pipeline Inspection + Einstein Deal Insights (вне записи, но про сделку)

**Как работает.** Отдельное представление пайплайна: сверху **metric tiles** изменений за период (Total / New / Moved In / Increased / Decreased / Moved Out / Lost / Won; форкаст-ярусы Commit / Best Case / Open Pipeline), клик по плитке фильтрует грид; изменения за 7 дней подсвечены зелёным/красным со стрелками. В гриде — inline-edit amount/close date, **красные часы**, если поле Next Step не обновлялось 7+ дней, счётчики «дней без активности», «дней в стадии», возраст сделки и **push count** — сколько раз переносили close date. Флажки «important» (до 200 сделок) как ручной фокус-лист. Панель Deal Insights (иконка Einstein) — кому не хватает встреч/вовлечённости, открытые кейсы; мини-таймлайн активности и блок **Who's Involved**: внешние контакты и внутренние участники с ролями и счётчиками активностей. Waterfall-чарт изменений пайплайна; flow-чарт движения между форкаст-категориями (Revenue Intelligence). Editions: Performance/Enterprise/Unlimited + permission set; требует historical trending. Summer '26 добавил колонку **Activity heatmap** — интенсивность in/outbound касаний за скользящие 30 дней (звонки, видео, встречи, письма).
**Аналог.** PipelineBoard + rotting + TodayView; поштучно многое есть, но нет «дельты пайплайна за период» и push count.
**Что перенять.** (а) **Push count** переносов плановой даты закрытия — из field history, бейдж на карточке «дата двигалась ×3»; (б) **staleness Next Step** — красный маркер, если «Следующий шаг» не менялся N дней (у нас поле уже есть — датчика нет); (в) плитки «изменения пайплайна с начала месяца» на overview.

### 2.8 Forecast Categories: слой уверенности поверх стадий

**Как работает.** Пять категорий: **Pipeline** (~25% ожидаемого закрытия в периоде), **Best Case** (33–50%), **Commit** (~90%, «слетает только в исключительных случаях»), **Closed** (выиграно), **Omitted** (проиграно/исключено из прогноза). Каждая стадия по умолчанию замаплена на категорию (несколько стадий → одна категория), **но реп может переопределить категорию на конкретной сделке, не трогая стадию** («Proposal», но клиент дал сильный сигнал → Commit). Поле видно/редактируется на записи; форкаст-отчёты группируют суммы по категориям; в Kanban можно группировать сделки по forecast category (это любой picklist — см. 2.9). Смысл: **стадия = процесс продажи, категория = намерение покупателя**; менеджмент говорит на языке категорий, не 14 стадий.
**Аналог.** Нет (probability из STAGE_CONFIG — функция стадии, не переопределяется).
**Что перенять.** Главный концептуальный кандидат: **лёгкий второй слой прогноза** — поле `forecast_category` (pipeline / best_case / commit / omitted) с дефолтом от стадии и ручным override. Для команды 5–15 это дешёвая замена полноценного форкастинга: weekly-отчёт «Commit vs Best Case vs Pipeline» по менеджерам + группировка канбана. Закрывает P6 (team forecast) прошлого анализа одним полем.

### 2.9 Kanban view

**Как работает.** Любой list view → «Display As: Kanban». Группировка колонками по **любому picklist** (Stage — дефолт, но можно forecast category), summarize by числовому полю (сумма Amount в шапке колонки). Drag&drop меняет стадию. На картах — ключевые поля; иконка Details раскрывает **Key Fields (inline-edit) + Guidance for Success** из Path. Жёлтые **алерты** на картах — подсказки «как продвинуть сделку» (нет открытых активностей и т.п.). Каждый record type — отдельная Kanban-вкладка. Задачи не поддерживаются.
**Аналог.** PipelineBoard (4 фазы) — наш дизайн осознанно глубже (14 стадий → 4 фазы).
**Что перенять.** (а) Группировка доски **по forecast category** как альтернативный режим (если введём 2.8); (б) алерт-иконка на карточке при «нет открытых задач/следующего шага» — у нас rotting есть, но сигнал «нет следующей активности» — отдельный и более ранний.

### 2.10 Dynamic Forms + conditional visibility

**Как работает.** Поля и field sections кладутся прямо на Lightning-страницу (без монолита page layout). Visibility rules: у **полей** — живая оценка при вводе (поле появляется сразу, как выполняется условие), у **секций** — при сохранении записи. Условия — по значениям полей записи, профилю/роли пользователя, устройству. Секции в табах/аккордеонах лениво грузятся. Не все объекты поддержаны (Campaign, Task, Product — нет).
**Аналог.** Наши формы — RHF+Zod, состав секций фиксированный.
**Что перенять.** Точечно: **условные поля по стадии/типу** на карточке сделки (поле «Причина проигрыша» — только на lost; блок «Параметры эксперимента» — только на стадиях experiment_*). Правило SF о разнице «живая оценка поля vs секция по сохранению» — хорошая эвристика: одиночные поля показывать реактивно, тяжёлые блоки — по факту смены стадии.

### 2.11 Opportunity Contact Roles

**Как работает.** Junction контакт↔сделка: Contact, Title, **Role** (picklist; стандартные значения включают Decision Maker, Evaluator, Influencer и др. — список расширяем), **Primary** (checkbox, один на сделку). Related list в сайдбаре. Роль обязательной из коробки не делается; кампании/Pardot требуют ≥1 contact role для атрибуции — поэтому админы принуждают флоу/валидацией. Истории смены ролей нет.
**Аналог.** Стейкхолдеры с ролями — **уже сильнее** (наши роли — доменные).
**Что перенять.** (а) **Primary-флаг** (один главный контакт сделки — для списков, писем, КП); (б) связка с 2.7: счётчик активностей per стейкхолдер («Who's Involved») — «с кем реально общаемся», выявляет single-threading.

### 2.12 Opportunity Teams + Splits

**Как работает.** Внутренняя команда сделки: участник = user + role + **opportunity access** (уровень доступа к записи per member). Есть default team (автодобавление на новые сделки). Splits: **revenue splits** — делят credit суммы, обязаны давать 100%; **overlay splits** — поверх, могут превышать 100% (пресейл, СЕ). Требует включения Team Selling.
**Аналог.** `project_members` — паритет по составу; splits не нужны (нет комиссионных схем на 5–15).
**Что перенять.** Практически ничего нового; разве что идею **default team** — автодобавление стандартного состава (РП + пресейл) при создании сделки определённого типа. Splits — не копировать.

### 2.13 Products / Line Items + Product Schedules; Quotes + Start Sync

**Как работает.** Продукты сделки = OpportunityLineItem (product, qty, unit price из Price Book), сумма сделки = Σ line items. **Product Schedules**: у продукта включаются revenue- и/или quantity-schedules — сумма/количество строки раскладывается на **равные инсталляции** (период: неделя/месяц/квартал/год × число инсталляций), инсталляции можно руками поправить, есть Recalculate для сверки итога; отчёты по «месяцу графика» дают график признания выручки по всему пайплайну. **Quotes**: на сделке много квот (варианты Bronze/Silver/Gold), у каждой — свои line items и PDF; кнопка **Start Sync** назначает одну квоту «синхронизируемой»: её строки становятся line items сделки, её итог — суммой сделки; синк другой квоты замещает строки и сумму. Остальные квоты остаются архивом переговоров.
**Аналог.** Line items нет (услуги внедрения); вкладка КП есть.
**Что перенять.** **Паттерн Start Sync, без line items**: у сделки много КП, ровно одно — «активное»; сумма и (если появится) состав работ сделки следуют за активным КП автоматически; смена активного КП — событие в timeline. Product schedules целиком не копировать, но идея «сумма сделки → помесячная раскладка» пригодится позже для cash-flow прогноза по внедрениям [за скоупом текущего спринта].

### 2.14 Stage History / Field History + validation rules на смене стадии

**Как работает.** **Opportunity History** — автоматический, ненастраиваемый журнал: каждая смена Stage / Amount / Probability / Close Date пишется без включения чего-либо; related list «Stage History» на записи; отчёт даёт длительность в каждой стадии и служит источником push count. **Opportunity Field History** — админ выбирает до **20 полей**; журнал old→new value, related list; long-text поля пишут только факт правки; журнал начинается с момента включения и не стирается при выключении. **Validation rules** — стандартный способ «гейтов»: формула блокирует сохранение при смене стадии без заполненных полей (ISPICKVAL(StageName,...) && ISBLANK(...)); показывает ошибку на сохранении. Ограничение по сравнению с нашим подходом: правила обходимы админом/интеграциями, срабатывают на этапе сохранения, а не в БД.
**Аналог.** `stage_transitions` (078) — история стадий есть; field-level истории amount/close_date нет (P2 прошлого анализа).
**Что перенять.** Уточнение P2: трекать именно **четвёрку SF** — stage, amount (budget), probability-override, close date (`next_action_date`/плановая дата) — этого достаточно для push count (2.7) и «кто менял сумму». Related list «История» на карточке — прямой аналог Stage History list.

---

## 3. Визуальные приёмы и антипаттерны Lightning

### Приёмы, которые работают (брать)

1. **Шапка-паспорт + один источник ключевых полей.** Highlights panel из compact layout переиспользуется в hover-превью, мобиле и канбане — «ключевые поля» определены один раз.
2. **Просроченное — сверху, не в истории.** «Upcoming & Overdue» как первый ярус таймлайна: долг по активностям невозможно не заметить.
3. **Стадия как контейнер знаний.** Path хранит и поля, и методичку стадии — контекст приходит к пользователю в момент перехода, а не живёт в вики.
4. **Ленивая загрузка вкладок/аккордеонов** — тяжёлые related lists не грузятся, пока не открыты.
5. **Ярусы вместо чисел.** Score в Pipeline Inspection — High/Medium/Low цветом; число 1–99 показывают только в контексте записи с факторами.
6. **Дельты с направлением.** Плитки Pipeline Inspection: изменение за 7 дней, зелёная/красная стрелка — тренд, не снапшот.
7. **Плотность как настройка.** Display density (Compact/Comfy) с Winter '19 — ответ на главную жалобу к Lightning.

### Антипаттерны (НЕ копировать)

1. **Расточительное белое пространство** ранних Lightning-страниц: гигантские зазоры между полями, рост скролла — годами главная жалоба админов (Admin Hero).
2. **Глубина кликов в related lists**: усечённые колонки, «View All» → отдельная страница, hover-карточки с задержкой. У нас: related-данные сразу вкладками с полноценными таблицами.
3. **Перегруз маркерами при полном фарше**: на одной записи могут одновременно гореть score, флаг important, красные часы Next Step, алерты канбана, Einstein-инсайты — 4 сигнальные системы с разной семантикой. Наш принцип «выделено — исключение» ценнее.
4. **Конфигурационный зоопарк**: страницы per профиль/record type/app + component visibility → пользователи видят разные CRM; поддержка дорожает. Для 5–15 человек — одна каноничная карточка со стадийной условностью полей (2.10), не per-role страницы.
5. **Новые вкладки браузера на каждое действие** (жалоба на Agentforce UX: «everything opens in new browser tabs»). Наши модалки/inline — правильнее.
6. **Медленная загрузка записей** — хроническая жалоба Lightning; каждый компонент — отдельный роунд-трип. Наш RSC+TanStack паттерн держать.
7. **Скор без объяснения не доверяют.** SF это знает — потому у скора всегда factors-панель; любой наш будущий «умный» индикатор обязан кликом раскрывать «почему».

---

## 4. Новое 2025–2026 (Einstein → Agentforce)

- **Spring '25 — ретайр Close Date Predictions** в Einstein Deal Insights (иконка у Close Date и вкладка Insights с предсказанием «не закроется в этом месяце» убраны); официальная замена — Einstein Opportunity Scoring. Показательно: SF консолидирует «умные сигналы» вокруг одного скора с факторами вместо россыпи предсказаний.
- **Summer '25 — EAC: Sync Email as Salesforce Activity.** Захваченные письма — нативные EmailMessage/Task (см. 2.5). Стратегическая капитуляция внешнего стора в пользу отчётности; включение необратимо, storage теперь платится.
- **Winter '25 — Dynamic Highlights Panel** (12 полей, conditional visibility) — шапка становится ролевой/стадийной.
- **Winter '26 — Agentforce в Pipeline Inspection:** агент читает недавние взаимодействия и **предлагает обновления stage и next steps** прямо в гриде (suggestive, HITL) — прямой референс для нашего P0 Smart Deal Progression. Также: до 5 параллельных SDR-агентов с разными критериями назначения; SDR analytics dashboard (beta); Einstein Account Research; **Einstein Summary** — генеративная сводка сделки/аккаунта (аналог нашей AI-сводки — у нас уже есть); invocable action «Get Conversation Insights» (вызовы конкурентов/болей из Flow/REST).
- **Summer '26:** колонка **Activity heatmap** в Pipeline Inspection (in/outbound касания за 30 дней; требует Conversation Insights + EAC); квалификация Agentforce расширена на Contacts/Person Accounts; **whitelist полей**, которые Sales Management-агент может автономно обновлять («Process Field Update Suggestions Flow» + Field API Names) — примечательная конвергенция с нашим wf `set_field` whitelist: SF пришёл к тому же защитному паттерну.
- **Agentforce Sales Coach** ($125/user/mo + Sales Cloud + Data Cloud; фактический стек $500–650/user/mo): LWC-компонент на записи Opportunity — pitch practice (до 5 минут голосом, фидбек по сделке/скиллам/знанию продукта) и role-play (AI играет клиента: возражения, торг по скидке). Персонализация из данных Account/Opportunity; сессии логируются задачами в timeline. Критика рынка: тренирует на симуляциях, а не на реальных звонках; нет менеджерских дашбордов; сложный сетап (6–12 мес.); низкое принятие. Наш `spin_review` на реальных транскриптах — методологически сильнее в нише.
- **Agentforce SDR** (GA дек. 2024, развивается весь 2025–26): автономный inbound-нёртинг лидов — отвечает, отрабатывает возражения, бронирует встречи 24/7; вся переписка — в Activity Timeline лида/контакта; хэндофф селлеру с полным контекстом; guardrails (не может менять Owner). Оплата — Conversations / 20 Flex Credits за действие. Для нас — вне домена (подтверждает прошлый вывод).
- **Ценовой контекст** (из анализа 2026-07-12, без изменений): Agentforce add-on $125/user/mo, Agentforce 1 Sales $550/user/mo, Flex Credits $500/100k.

**Мета-вывод 2025–2026:** SF движется от «россыпи Einstein-виджетов» к (1) одному объяснимому скору, (2) suggestive-агенту, предлагающему правки полей с HITL и whitelist'ом, (3) нативному хранению активностей. Все три вектора совпадают с уже принятыми решениями dashboard-crm (health score, HITL AI, activities в Postgres) — мы на правильной траектории, отставание только в объяснимости скора и push-метриках.

---

## 5. Топ-5 переносимых идей для dashboard-crm (масштаб 5–15)

1. **Guidance for Success в кокпите стадий** (~0.3 спринта). Rich-text подсказка per стадия (≤1000 знаков, ссылки на регламенты ЧЗ/1С/шаблоны КП) + явный блок «ключевые поля стадии» с inline-edit. Хранить в `stage_requirements` или новой org-таблице `(org_id, stage_id, guidance)` (стадии — глобальный словарь, атрибуты — отдельной таблицей, по конвенции). Гейты у нас уже сильнее SF — не хватает именно «зачем и как», а не «нельзя».
2. **Forecast category как override-слой** (~0.4 спринта). Поле `forecast_category` (pipeline/best_case/commit/omitted) с дефолтом из стадии и ручным переопределением; weekly-вью «Commit / Best Case / Pipeline × менеджер» на overview; опциональная группировка PipelineBoard по категории. Одно поле закрывает P6 (team forecast) и даёт язык прогноза без Einstein.
3. **Push count + staleness «Следующего шага»** (~0.3 спринта, поверх P2 field history). Из field history плановой даты закрытия — бейдж «дата переносилась ×N» (N≥2 — warning); красный маркер-часы, если `next_step` не обновлялся 7+ дней. Оба сигнала SF считает ключевыми маркерами гниющей сделки — у нас есть датчик времени в стадии, но нет именно этих двух измерений.
4. **Primary-стейкхолдер + «Who's Involved»** (~0.3 спринта). Флаг primary (один на сделку, частичный unique index) + счётчик активностей per стейкхолдер за 30 дней из timeline → подсветка single-threaded сделок («вся активность на одном контакте»). Прямой перенос Contact Roles primary + Pipeline Inspection Who's Involved.
5. **«Активное КП» по паттерну Start Sync** (~0.4 спринта, уточнение P1 Quotes). На вкладке КП: у сделки много КП, ровно одно `is_active`; сумма сделки автоматически следует за активным КП (триггер), смена активного — событие timeline «сумма обновлена из КП №N». Остальные КП — архив переговоров (audit trail «где КП №47 и кто согласовал»).

**Бонус (почти бесплатно):** конфетти на финале Win Wizard (2.2); гашение health score на закрытых сделках; факторы «+/−» в тултипе health score (2.6).

**Не переносить** (подтверждение прошлого анализа механиками): product catalog/line items и schedules целиком, splits, per-role страницы записи, Agentforce SDR/Sales Coach, Flex Credits-модель, отдельное Pipeline Inspection-приложение (наши overview+board его роль выполняют в масштабе 5–15).

---

## Источники

### Path, layout, timeline, Kanban, Dynamic Forms
- [Enable Salesforce Path In 6 Easy Steps — Salesforce Ben](https://www.salesforceben.com/implement-salesforce-path/)
- [Path: Set up Path in Salesforce Lightning Experience — SFDC Penguin](https://sfdcpenguin.com/blog/path-setup-and-best-practices/)
- [Guide Users with Path — Salesforce Help](https://help.salesforce.com/s/articleView?id=sf.path_overview.htm&language=en_US&type=5)
- [Pro Tip: Tailor the Activity Timeline — Salesforce Admins Blog](https://admin.salesforce.com/blog/2017/tailor-activity-timeline-lightning-experience-users)
- [Salesforce Activity Timeline — Weflow](https://www.weflow.ai/blog/salesforce-activity-timeline)
- [Known Issue: Activity Timeline «Upcoming & Overdue» — Trailblazer](https://trailblazer.salesforce.com/issues_view?id=a1p3A000001GG2NQAW)
- [Guide to Salesforce Kanban — Salesforce Ben](https://www.salesforceben.com/guide-to-salesforce-kanban/)
- [Custom Record Pages — Trailhead, Lightning App Builder](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_recordpage)
- [Salesforce Dynamic Forms: Overview & Deep Dive — Salesforce Ben](https://www.salesforceben.com/salesforce-dynamic-forms-overview-deep-dive-tutorial/)
- [Ultimate Guide to the Dynamic Highlights Panel — Salesforce Ben](https://www.salesforceben.com/the-ultimate-guide-to-the-salesforce-dynamic-highlights-panel/)

### Einstein / Agentforce
- [Einstein Opportunity Scoring: Deep Dive — Salesforce Ben](https://www.salesforceben.com/what-is-salesforce-einstein-opportunity-scoring/)
- [Understand How Einstein Scores Your Opportunities — Salesforce Help](https://help.salesforce.com/s/articleView?id=einstein_sales_opportunity_scoring_how_it_works.htm&language=en_US&type=5)
- [Einstein Opportunity Scoring for Everyone, Spring '26 — Salesforce docs (PDF)](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/sales_ai_for_everyone.pdf)
- [Ultimate Guide to Pipeline Inspection — Salesforce Ben](https://www.salesforceben.com/ultimate-guide-to-salesforce-pipeline-inspection/)
- [A Practical Map of Salesforce «Einstein» for Leads & Opportunities — Shirley Peng, Medium](https://medium.com/@shirley_peng/a-practical-map-of-salesforce-einstein-for-leads-opportunities-9133e9f758d5)
- [Einstein Deal Insights Close Date Predictions Retirement — Salesforce Help](https://help.salesforce.com/s/articleView?id=002372664&language=en_US&type=1)
- [Einstein Opportunity Insights (retired) — Tectonic](https://gettectonic.com/einstein-opportunity-insights/)
- [Agentforce Sales Coach Review — Oliv](https://www.oliv.ai/blog/agentforce-sales-coach)
- [Nurture Leads 24/7 With Agentforce for Sales — Salesforce Ben](https://www.salesforceben.com/nurture-leads-24-7-with-agentforce-for-sales/)
- [Sales Cloud: Top Salesforce Summer '26 Features — Salesforce Ben](https://www.salesforceben.com/sales-cloud-top-7-salesforce-summer-26-features/)
- [Winter '26 Release Notes Summary — SFDC Penguin](https://sfdcpenguin.com/blog/winter-26-release-note-summary/)

### EAC
- [Einstein Activity Capture — Cirrus Insight](https://www.cirrusinsight.com/blog/einstein-activity-capture)
- [EAC: The Move to Native Records — Sesame Software](https://www.sesamesoftware.com/post/salesforce-einstein-activity-capture-the-move-to-native-records-and-its-impact-on-data-storage)
- [How Einstein Activity Capture Works — Salesforce Help](https://help.salesforce.com/s/articleView?id=sales.aac_how_it_works.htm&language=en_US&type=5)

### Forecast, roles, teams, products, quotes, history
- [Salesforce Forecast Categories — GSP Solutions](https://gspsolutions.com/forecast-categories/)
- [Introduction to Opportunity Contact Roles — Salesforce Ben](https://www.salesforceben.com/introduction-to-salesforce-opportunity-contact-roles/)
- [Set Up and Customize Opportunity Contact Roles — Salesforce Help](https://help.salesforce.com/s/articleView?id=sales.sales_core_opp_contact_setup.htm&language=en_US&type=5)
- [Team Selling & Opportunity Splits — Trailhead](https://trailhead.salesforce.com/content/learn/modules/leads_opportunities_lightning_experience/sell-as-a-team-and-split-the-credit)
- [Products Part 2 — Revenue and Product Scheduling — ShellBlack](https://www.shellblack.com/whiteboard/products-part2-revenue-and-product-scheduling/)
- [How And Why To Use Salesforce Quotes — GSP Solutions](https://gspsolutions.com/salesforce-quotes/)
- [Opportunity History vs. Opportunity Field History — Salesforce Ben](https://www.salesforceben.com/salesforce-opportunity-history-vs-opportunity-field-history/)
- [Validation Rule to prevent Opportunity Stage change — Salesforce Help](https://help.salesforce.com/s/articleView?id=000396271&language=en_US&type=1)

### UX-критика Lightning
- [10 UX Issues in Lightning Experience — Admin Hero](https://www.adminhero.com/10-ux-issues-lightning-experience-need-fixing/)

### Внутренние
- `improvements/CRMs/salesforce-analysis-2026-07-12.md` — платформенный анализ, приоритеты P0–P6
