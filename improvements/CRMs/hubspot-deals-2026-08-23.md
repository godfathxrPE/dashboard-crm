# HubSpot Sales Hub — глубокий ресерч карточки сделки (deal record), 2025–2026

**Дата:** 2026-08-23
**Метод:** WebFetch официальной Knowledge Base (knowledge.hubspot.com), product updates (октябрь 2025, релизы 2026), community, продуктовые страницы hubspot.com. Углубление прошлого анализа `improvements/CRMs/hubspot-analysis-2026-07-12.md` — стратегический слой не пересказывается, здесь микро-уровень UI/UX карточки сделки.
**Метки честности:** [KB] — подтверждено официальной базой знаний; [product] — продуктовая страница HubSpot; [community/3rd-party] — вторичный источник; [не подтверждено] — из памяти модели, текущими источниками не сверено.

---

## 1. Анатомия карточки сделки

### 1.1 Три колонки + шапка

Каркас record page у HubSpot одинаков для всех объектов (contact/company/deal/ticket) — **левый сайдбар · средняя колонка · правый сайдбар** [KB: work-with-records].

**Левый сайдбар (identity + свойства):**
- Highlight-секция: имя записи (редактируется по hover → карандаш), primary/secondary display properties. Для сделки это имя сделки + ключевые атрибуты; stage и pipeline редактируются из панели.
- Ряд **кнопок-иконок активностей**: Note, Email, Call, Task, Meeting (+ ещё в «More»). Порядок кнопок настраивается через диалог «Reorder activity buttons» [KB].
- Кнопка **Follow/Unfollow** (подписка на изменения записи) и меню **Actions**: View all properties, View property history, View association history, Summarize (Breeze), Merge, Clone, Delete, View record access [KB].
- Карточка **«About this deal»**: список свойств (до 50 на секцию), inline-edit по hover, персональная настройка «only apply to your view» — каждый пользователь может настроить свой набор, если админ разрешил [KB: customize-properties-in-record-sections].
- **Property history по одному полю**: hover над свойством → «Details» → предыдущие значения, источник изменения (workflow / user / API) и timestamp [KB]. Это микро-фича, которой обычно нет у конкурентов: аудит на уровне отдельного поля прямо из карточки.
- Карточка **Deal splits** (Enterprise) — см. §2.13.

**Средняя колонка (работа):**
- **Табы**: Overview + Activities + до 3 кастомных (максимум 5 на объект). Activities-таб нельзя удалить/редактировать. Система запоминает, какой таб ты открывал последним, и открывает его [KB: customize-records].
- **Overview**: набор карточек — Data highlights (до 4 свойств крупно), Recent activities, Deal score card, association-таблицы, отчёты. Настраивается кнопкой customize.
- **Activities**: единый timeline (см. §2.4).
- Карточки в средней колонке можно ставить **рядом (side-by-side)** и группировать в **сворачиваемые секции** [KB].

**Правый сайдбар (связи + инструменты):**
- Association-карточки: Contacts (с buying roles/labels), Companies (primary company), Tickets; у каждой — свой конфиг отображаемых свойств (до 6), поиск, сортировка, collapse, меню «…» → preview / edit label / remove [KB: use-cards-on-records].
- Инструментальные карточки: **Attachments**, **Line items**, **Quotes**, **Playbooks**, **Conversations** (треды help desk), Salesforce sync [KB: work-with-records].

### 1.2 Конструктор record page (Professional/Enterprise)

- Единица кастомизации — **карточка (card)**. Библиотека из ~16 типов: Property list, Data highlights, Activities, Activity totals, Associations, Association table (до 12 колонок, до 5 quick-фильтров), Association property list (до 24 свойств), Association label list, **Stage tracker**, **Association stage tracker**, **Property date tracker** (прогресс-бар между двумя датами, настраиваемый цвет), Property history (график одного числового свойства), Quick actions, Report, Statistics, Company summary [KB: create-cards-on-records].
- Лимиты: **до 50 карточек** на колонку, **до 5 табов**, до 5 фильтров на карточку [KB: customize-records].
- **Conditional cards и conditional tabs**: показ/скрытие по критерию свойства («показать карточку, если Phone начинается с 617») [KB]. Per-pipeline кастомизация карточек в явном виде не документирована — раскрой по пайплайну делается именно через conditional-логику по свойству Pipeline [KB: customize-records; вывод — наш].
- **Default view + team views**: дефолт для всех, отдельные view для команд (Pro/Enterprise). Права: Super Admin или «Customize record page layout» [KB].
- Пользовательская свобода регулируется поштучно: админ включает/выключает право юзеров передвигать карточки и редактировать property-list-карточки [KB].

### 1.3 Новый дефолтный layout (март–апрель 2026)

Для новых аккаунтов Free/Starter с 30.03.2026 и Pro/Enterprise с середины апреля 2026 HubSpot раскатал **новую структуру табов**: **About · Activities · Catch-up · Intelligence · Revenue** [KB: understand-the-default-record-layout]:
- **About** — «customer journey»: Breeze record summary (AI-сводка прямо в табе), ключевые свойства, signals, подписки, NPS/CSAT.
- **Activities** — timeline + смены стадий, form submissions, аналитические события.
- **Catch-up** — инсайты, health, data quality (пустые поля, дубли) — для contact/company.
- **Intelligence** — enrichment и данные о посещениях сайта.
- **Revenue** — commerce-объекты: quotes, invoices, subscriptions + LTV.
Смысл сдвига: **AI-сводка и «здоровье данных» становятся первым экраном записи**, а не действием в меню.

---

## 2. Механики — как работает каждая

### 2.1 Stage tracker + смена стадии (прогресс-бар)

**Как работает.** Stage tracker — карточка с горизонтальным прогресс-баром стадий: пройденные сегменты закрашены («progress bar with three stages completed»), текущая подсвечена. Стадия меняется кликом по значению стадии (dropdown) — сам бар в первую очередь индикатор, редактирование идёт через property-контрол [KB: use-cards-on-records]. Рядом карточка показывает stage calculated properties — в т.ч. **время в текущей стадии** (Pro/Enterprise).

**Валидация при смене стадии.** Два слоя:
1. **Required properties на стадию**: при переносе в стадию, где настроены обязательные свойства, всплывает **модалка дозаполнения** — пока не заполнил, стадия не сохранится. Работает и при drag на board. Известная дыра, подтверждённая community: обязательность **обходится при создании сделки сразу в этой стадии** и при апдейтах через workflow/API [community: «Mandatory properties on Deal STAGES get skipped»].
2. **Pipeline rules** (Pro/Enterprise) [KB: set-up-pipeline-rules]: limit deal creation to specific stages · **restrict skipping stages** (кроме перехода в Closed) · **restrict backwards movement** · restrict editing закрытых сделок (только Super Admin/выбранные команды) · **approval process** для стадий (Enterprise). UI: в dropdown стадий недоступные стадии **видимы, но disabled**. Все правила, кроме approvals, обходятся Super Admin'ом, workflow и API.

**Аналог у нас.** Кокпит стадий + server-enforced гейты (`check_stage_requirements`, 078). Мы **сильнее**: наш гейт — триггер в БД, не обходится клиентом; у HubSpot enforcement дырявый (create-in-stage, API).
**Что перенять.** (а) Disabled-стадии в UI с объяснением, *почему* недоступны, — у нас гейт срабатывает на попытке, а HubSpot показывает запрет заранее; (б) правило «restrict backwards movement» как опция пайплайна; (в) режим «limit creation stages» — сделку нельзя завести сразу в поздней стадии.

### 2.2 Stage calculated properties + close date automation

**Как работает.** На каждую стадию система автоматически ведёт 5 свойств: **Date entered [stage] · Date exited [stage] · Latest time in [stage] · Cumulative time in [stage]** (сумма по повторным заходам) **· Time in current stage** [KB: stage-calculated-properties]. Доступны в фильтрах, отчётах, workflow; включаются/выключаются per-stage. Pro/Enterprise.
**Close date automation** (все тарифы, per-pipeline, вкладка Automate): при переходе в closed-стадию Close date **автоматически = сегодня**; опционально — очистка Close date при реоткрытии [KB: set-up-close-date-automation].

**Аналог у нас.** `stage_transitions` (078) хранит историю переходов — мы можем вычислить всё то же SQL-ом, но не материализуем.
**Что перенять.** «Cumulative time in stage» — важный сигнал пинг-понга сделки (двигали туда-обратно); у нас датчик показывает только текущий заход (`stage_entered_at`). Вьюха/RPC поверх `stage_transitions` с cumulative-метрикой + бейдж «возвращалась в стадию N раз». Close-date-автоматика: при «Выиграна» проставлять `actual_close_date` сервером (у нас уже делает триггер — паритет), при реоткрытии — политика очистки.

### 2.3 Кастомизация карточек и conditional-логика свойств

**Как работает.** Библиотека card-типов (§1.2). Отдельно — **conditional property logic** для enum/date-свойств (Pro/Enterprise): controlling property → при выбранном значении показать дополнительные свойства и/или **сделать их required**; операторы «is equal to / is any of / is known». Применяется при ручном создании/редактировании записи, в т.ч. в мобильном приложении и sales-расширении, но **не** в workflow/API [KB: set-up-conditional-logic-for-enumeration-properties]. Второй вид — **conditional options**: сужение списка значений зависимого dropdown по значению контролирующего [KB: set-up-conditional-options-for-properties].

**Аналог у нас.** Нет; наши формы фиксированы, есть Zod-валидация.
**Что перенять.** Точечно: «Тип внедрения = ЧЗ» → показать/требовать поля «Товарные группы», «Кол-во точек». В нашем стеке — декларативный JSON-конфиг зависимостей полей в `organizations.settings` + RHF `watch`. Это дешёвая версия per-vertical форм, снижает шум пустых полей (наш «completeness» это уже частично решает).

### 2.4 Activity timeline: фильтры, pin, поиск, комменты

**Как работает** [KB: customize-activities-on-a-record-timeline; pin-an-activity; work-with-records]:
- Порядок: **upcoming activities сверху**, дальше хронология вниз.
- **Фильтры**: по типу активности (notes, emails, calls, tasks, meetings + LinkedIn/SMS/WhatsApp), по пользователю, по **HubSpot team** (Pro/Enterprise), по времени.
- **Поиск по timeline** — ищет в темах писем, телах заметок/звонков/встреч/задач.
- **Collapse all / Expand all** одним контролом.
- **Pin: ровно одна активность на запись**, закреп виден всем пользователям аккаунта, требует edit-прав на запись и активность. Actions → Pin.
- **Комментарии на активностях** с @-упоминаниями (уведомление коллеге) — обсуждение живёт на самой активности, не отдельным чатом.
- У каждой активности меню Actions: history изменений, comment, pin, delete.
- Отдельная карточка **Upcoming activities**: три ближайших будущих активности, настраиваемый период.

**Аналог у нас.** EntityTimeline + композер; фильтров меньше, pin нет, комментов на активностях нет (обсуждение — вкладка Чат).
**Что перенять.** (1) **Pin одной активности** — идеально ложится на наш `pinned_note` (уже в whitelist workflow `set_field`!): закреп «сводки договорённостей» над лентой. (2) Поиск по телу активностей (у нас ленты длинных внедрений уже длинные). (3) Блок «предстоящее» над хронологией — у нас эту роль играет «Следующий шаг», но встречи/задачи будущего в ленте не поднимаются наверх.

### 2.5 Email на карточке: logged vs tracked

**Как работает** [KB: log-email-with-bcc-or-forwarding; understand-email-open-click-tracking]:
- **Log** = положить письмо в CRM. Каналы: BCC-адрес HubSpot в исходящем, forwarding-адрес для входящих, авто-лог через расширение Gmail/Outlook. Письмо с вложениями попадает в timeline.
- **Track** = пиксель открытий/кликов + realtime-уведомления. Лог без трека не даёт opens/clicks; трек — только через расширение.
- **Ключевая механика ассоциации:** залогированное письмо автоматически цепляется к контакту, его primary company **и к 5 последним открытым сделкам контакта** [KB]. То есть письмо появляется в ленте сделки без ручного выбора.
- Реплаи через forwarding-адрес встают в тот же timeline.

**Аналог у нас.** Email-интеграции нет (осознанно).
**Что перенять.** Не сам email-контур, а **правило авто-ассоциации**: любая наша активность/файл/транскрипт, привязанная к контакту, должна авто-предлагаться в ленту открытых сделок этого контакта. И задел на будущее: если появится почтовый мост — механика «BCC-адрес организации» дешевле полной интеграции.

### 2.6 Звонки и встречи: outcomes, запись, транскрипт, коучинг

**Как работает** [KB: manually-log-activities; review-call-recordings-and-transcripts; schedule-a-meeting-on-a-record]:
- Логирование задним числом: дата/время, направление (in/out), call type, **outcome** (дефолтные: Busy, Connected, Left voicemail…; кастомные добавляются), attendees (до 50 в UI встречи), чекбокс **«создать follow-up task»** прямо из формы логирования.
- Meeting outcomes: **Scheduled, Completed, Rescheduled, No show, Canceled**.
- Запись звонка → страница ревью: **транскрипт с дорожками спикеров**, поиск по ключевым словам с прыжком в место транскрипта, **threaded-комментарии к фрагменту** (hover по строке транскрипта → comment, @-mention) — коучинг внутри звонка (Pro/Enterprise seats). **AI call summary** по шаблону: цель звонка, ключевые пункты, решения, сентимент, next steps; шаблоны «для сейлза»/«для саппорта». Enterprise — tracked terms (упоминания конкурентов и т.п.).
- Запись/транскрипт авто-ассоциируются с primary company участников и связанными сделками — появляются в ленте сделки.

**Аналог у нас.** `transcripts` + AI-пресеты (протокол, SPIN) — по анализу мы глубже (доменные пресеты). Нет: outcome на активности, коуч-комментов к фрагменту транскрипта, follow-up-чекбокса.
**Что перенять.** (1) **Outcome как поле активности** (связались/недозвон/перенос) — дешёвый источник статистики контактности; (2) чекбокс «создать задачу-фоллоу-ап» в композере активности; (3) якорные комментарии к фрагменту транскрипта — сильная идея для разбора звонков РОПом.

### 2.7 Guided actions и Deal Insights в sales workspace

**Как работает** [KB: create-and-manage-deals-in-the-sales-workspace; customize-guided-actions]:
- **Guided actions** — «HubSpot-powered recommendations» очередью в sales workspace; у сделки видно число guided actions и **risks**. Админ (Super Admin, Sales Pro+) включает/выключает конкретные типы, меняет дефолтное действие (звонок → письмо) и **пороги** (например, re-engage через 3 → 4 дня). Полный каталог типов в KB не публикуется; workspace перезапущен 27.04.2026.
- **Deal Insights** (октябрь 2025 — CRM-карточка на record page, Sales Pro+): AI-обзор сделки по данным и **последним 100 взаимодействиям**, 4 секции: **Recent activity** (сводки 5 последних взаимодействий, для звонков/встреч — AI-конспекты) · **Risks** (падение deal score, неуверенность покупателя, нет запланированного follow-up) · **Buyer goals** · **Company research** (данные Owler). Кнопки Copy / Helpful / Not helpful.

**Аналог у нас.** TodayView (очередь), health score 0–8 (правила), AI-модалка (бриф, сводка).
**Что перенять.** (1) **Настраиваемые пороги** health-правил per-org (наши 0–8 захардкожены; HubSpot даёт админу крутилки); (2) блок «Риски» как *объяснение* health score прямо на карточке: не цифра, а список конкретных причин с датами; (3) фидбек-кнопки Helpful/Not helpful на AI-выводах — дешёвая петля качества промптов.

### 2.8 AI Deal Score

**Как работает** [KB: use-deal-scores]:
- Шкала **0–100 = вероятность выигрыша в процентах** («score of 85 predicts an 85% likelihood»).
- Факторы: свойства сделки (amount, close date, create date, смены стадий, изменение probability, **время с последнего обновления next step**, смена owner) + сигналы вовлечённости (звонки/письма/встречи по контактам, время с последнего контакта, просроченные задачи, opens/clicks/replies писем).
- UI: колонка со цветным бейджем в index view; **Deal score card** на Overview-табе карточки: текущий скор + дельта с timestamp, **топ-5 факторов со знаками +/−**, **график тренда скора**, панель «View score history» со всеми апдейтами и повлиявшими факторами. Hover по бейджу — разбивка факторов.
- Тайминг: новый скор ~36 ч (до 48), апдейт значимых изменений ≤6 ч (порог ±3%), принудительный пересчёт раз в 2 недели.
- Sales Pro/Enterprise; факторы и история — только с Sales seat.

**Аналог у нас.** Health 0–8 — правила, прозрачен, но без тренда и без истории.
**Что перенять.** Не ML (на 5–15 юзерах нет данных), а **UI-обвязку**: (1) факторы со знаками +/− как стандартный способ показать «почему такой скор»; (2) **история скора с графиком** — health-значение писать в лог при изменении (у нас событийная модель уже есть) и рисовать спарклайн; (3) дельта «▲/▼ с прошлой недели» на бейдже.

### 2.9 Breeze Assistant: Summarize / «catch me up»

**Как работает** [KB: summarize-records]:
- Actions → **Summarize** на любой записи (все тарифы!) → справа открывается панель **Breeze Assistant** с AI-сводкой. Для сделки: имя/дата создания/компания/owner, pipeline и стадия, amount, close date, тип, последняя активность, forecast category, next steps.
- Дальше — **чат с ассистентом по данным записи** («expand on the summary», вопросы по данным).
- Требуются включённые AI-настройки; при включённой Sensitive Data звонки/письма не суммаризуются.
- В новом layout 2026 сводка Breeze — уже **карточка в табе About**, т.е. сводка стала пассивной частью карточки, а не действием.

**Аналог у нас.** AI-модалка (бриф к встрече, сводка) — по паттерну паритет.
**Что перенять.** Сдвиг «AI-сводка как действие → AI-сводка как первый экран»: кэшированная краткая сводка сделки в шапке/About с refresh-кнопкой, а модалка — для глубоких сценариев.

### 2.10 Smart Deal Progression (GA, 2026)

**Как работает** [product: smart-deal-progression]: после встречи (Meeting Notetaker) AI по транскрипту и контексту сделки предлагает: **обновления свойств** (включая кастомные, через Data Agent), **задачи** из action items, **черновик follow-up-письма**. Реп получает уведомление (deal board, CRM inbox, post-meeting), редактирует и **применяет одним кликом**. Sales/Service Pro+.

**Аналог у нас.** AI-модалка выдаёт текст, но не пишет в поля.
**Что перенять.** P0 прошлого анализа подтверждается и уточняется: ключ — **structured output → diff-превью → apply**. Наш аналог: пресет возвращает JSON `{field_updates, tasks[], followup_draft}`, UI показывает диф полей (старое → новое), пользователь снимает галочки, apply одной транзакцией. Whitelist полей уже есть в workflow (`next_step`, `next_action_date`, `probability`…) — переиспользовать его как границу того, что AI может трогать.

### 2.11 Line items и деньги сделки

**Как работает** [KB: use-line-items-with-deals]:
- Карточка **Line items** в правом сайдбаре: Add/Edit → полноэкранный **редактор-таблица**: колонки quantity, unit price, **unit discount**, term, billing frequency (колонки настраиваются); строки можно edit/clone/reorder/delete.
- Два пути: выбор из **product library** (поиск по имени/SKU, фильтры, чекбоксы) или **custom line item** (name, description, billing frequency, tax rate, pricing model, unit price/cost, quantity; опция «сохранить в библиотеку»).
- Над таблицей — **живая сводка: TCV · ACV · ARR · MRR · Margin**; unit price до 6 знаков, округление по валюте. Recurring: MRR = цена × 4.33 недель и т.п. Deal Amount пересчитывается из line items (у API-импорта — нет, известный носок).
- Из line items кнопкой **Create** → quote / invoice / **payment link** / subscription.

**Аналог у нас.** Нет продуктов; сумма — поле + КП.
**Что перенять.** Минимальную версию под домен: справочник услуг внедрения (обследование, лицензии, настройка, обучение) + line items на КП с автосуммой в бюджет сделки при accept (у нас accept→budget уже есть — расширить до позиций). Разделение one-time vs recurring (сопровождение) даст нам ARR-метрику по клиентам — HubSpot-паттерн TCV/MRR-сводки над таблицей позиций стоит скопировать буквально.

### 2.12 Quotes: статусы, e-sign, оплата

**Как работает** [KB: create-and-send-quotes; use-e-signatures-with-quotes; октябрь 2025 updates]:
- Из карточки: Quotes card → **+ Add** → выбор шаблона → редактор.
- **Статусная модель: Draft → Pending approval → Shared → Signed / Expired**; экспирация — дефолтный срок в настройках + переопределение per-quote; с октября 2025 — автообновление статуса по expiration-правилам.
- **E-signature**: выбор buyer-подписантов (можно разрешить переназначение), countersigners с нашей стороны; PDF ≤ 40 MB. Вложения: до 10 файлов по 30 MB.
- **Оплата из квоты**: карта/сохранение метода, billing/shipping-адреса, сборы на чекауте.
- Октябрь 2025: **квоты можно создавать прямо из deal index** (без открытия карточки) и появился **трекинг активности квоты — просмотры, скачивания, время вовлечения** (Commerce Pro+).
- Тариф: создание/редактирование квот — Revenue Hub seat (Pro/Enterprise).

**Аналог у нас.** Вкладка КП со статусами и accept→budget — концептуальный паритет ядра.
**Что перенять.** (1) **Просмотры/время чтения КП** — сигнал для health и триггер follow-up («КП открыли 3 раза за день — звони»); (2) статус **Expired по сроку действия** с автопереводом и напоминанием; (3) Pending approval — если появится роль РОПа в согласовании скидок.

### 2.13 Контакты сделки: buying roles, labels, primary company; deal splits

**Как работает** [KB: associate-records; split-deal-credit-among-users; community/3rd-party]:
- **Association labels** (Pro/Enterprise) описывают отношение записи к записи; на контактной карточке сделки label редактируется из меню «…». Кастомные labels создаются в настройках; лимиты ассоциаций зависят от тарифа.
- **Primary company** — системный one-way label; активности записи авто-ассоциируются только с primary company.
- **Buying roles** — роли контактов в сделке; подтверждённые источником роли: **Decision Maker, End User, Blocker, Budget Holder, Champion** [3rd-party: orangemarketing]; полный дефолтный список из 8 (плюс Executive Sponsor, Influencer, Legal & Compliance) — [не подтверждено текущими источниками]. Роль — множественная (контакт может быть и Champion, и Budget Holder).
- **Org chart / relationship map — НЕ нативно**: рынок закрывают сторонние приложения (OrgChartHub и др.) [3rd-party].
- **Deal splits** (Enterprise): карточка в левом сайдбаре; «Split evenly» или по процентам, **сумма строго 100%**, owner всегда включён, админ задаёт max участников и min долю; сплиты видны в форекасте и отчётах через «Deal Split Owner/Amount».

**Аналог у нас.** Стейкхолдеры с ролями — есть; ЛПР/ЛВР-модель наша даже вертикальнее. Org chart нет у обоих. Deal splits нам не нужны (нет комиссий).
**Что перенять.** (1) Паттерн **primary** (главный контакт сделки — кому по умолчанию пишем/звоним) как флаг на стейкхолдере; (2) health-правило от buying roles: «в сделке > X ₽ нет Decision Maker» — у HubSpot это риск в Deal Insights, у нас ложится в completeness/health.

### 2.14 Playbooks на карточке

**Как работает** [KB: use-playbooks]:
- Карточка **Playbooks** в правом сайдбаре: поиск + список; при настроенных правилах рекомендаций сверху блок **Recommended** (например, по текущей стадии сделки — рекомендация через CRM-карточку, настроенную Super Admin'ом).
- Открытый playbook — интерактивный скрипт: вопросы трёх типов: **open text** → в заметку; **список вариантов ответа** (Enterprise); **update a property** — ответ пишется прямо в свойство сделки (Enterprise). Ответы автосохраняются как черновик.
- Завершение: playbook **логируется как engagement в timeline**; для call-playbook — выбор call outcome и типа звонка; можно прикрепить к недавно залогированному звонку, чтобы не плодить дубли.
- Sales/Service Pro (базово) / Enterprise (property-capture).

**Аналог у нас.** Нет; ближайшее — SPIN-пресеты AI и чеклисты внедрения (083/084).
**Что перенять.** Идея «**вопросы скрипта = поля сделки**»: наш квалификационный опросник первой встречи (объём маркировки, типографика ЧЗ, версия 1С…), где каждый ответ пишет в поле — закрывает completeness за один звонок. Это соединение нашего checklist-паттерна (уже есть RPC-механика) с формой на карточке сделки.

### 2.15 Sequences, task queues, meeting scheduler — с точки зрения карточки

**Как работает** [KB: enroll-contacts-in-a-sequence; create-tasks; schedule-a-meeting-on-a-record]:
- **Sequences** (Sales/Service Pro+): автокаденция писем + task-шагов. С карточки — иконка «Enroll in a sequence» в левой панели записи контакта; массово до 50 контактов, ≤3 писем/мин, дневные лимиты по тарифу. Сделка сама не энроллится — только её контакты.
- **Task queues**: задачи объединяются в очереди, реп прогоняет очередь подряд (next-next-next); при создании задачи — выбор очереди. Типы задач: Call, Email, To-do (+ LinkedIn SalesNav). Напоминания email, дефолтный срок в настройках.
- **Meeting scheduler**: иконка встречи на карточке → диалог с календарём (нужен подключённый Google/O365): title, время, attendees, локация (Zoom/Meet/телефон/адрес), до 3 напоминаний, описание для гостя + internal notes. Контакту нужен email — уйдёт приглашение с .ics. Pro+: планирование от имени другого хоста, ротация хостов.

**Аналог у нас.** Задачи есть (борд), очередей нет; календаря нет.
**Что перенять.** **Task queue как режим TodayView** («прогнать очередь»: открывается первая задача с контекстом сделки, done → следующая) — дешёвая и сильная механика фокуса. Sequences — по-прежнему отложить до email-контура.

### 2.16 Forecast: категории и AI-проекции

**Как работает** [KB: use-the-forecast-tool; improve-forecasting-with-ai-projections]:
- **Forecast category** — свойство сделки (группировка сверх стадий: pipeline/best case/commit — список настраивается при setup); фигурирует в Breeze-сводке сделки. Ручные **forecast submissions**: период, сумма, заметка, выбор сделок → Submit.
- **AI projections** (beta, Pro+): Breeze анализирует closed-won за 3 месяца → диапазон (most likely / upper / lower), пересчёт по дням 1/7/14/21/28, таблица точности прогноза против факта.

**Аналог у нас.** Weighted pipeline по вероятности стадии.
**Что перенять.** Однопольная **forecast category** (commit/best case/pipeline) поверх стадий — это ручной сигнал уверенности продавца, ортогональный стадии; для команды 5–15 полезнее ML-прогнозов. AI-проекции — не сейчас (мало данных).

---

## 3. Визуальные приёмы: как HubSpot держит плотную карточку читаемой

Оценки визуального слоя — качественные, по документации и скриншотам KB [ESTIMATED]:

1. **Всё — карточка.** Единица композиции везде одна: белая карточка с заголовком, collapse-контролом и меню «…». Пользователь учится один раз. Обратная сторона — вертикальная монотонность: 10 карточек в сайдбаре выглядят одинаково важными.
2. **Трёхколонник со специализацией: identity | work | context.** Левое — «кто это», центр — «что происходит», право — «с чем связано». Плотность растёт слева направо по числу объектов, но падает по детализации.
3. **Табы против скролла.** Средняя колонка не скроллится бесконечно — режется табами (≤5), причём система **запоминает последний открытый таб**. Conditional tabs скрывают нерелевантное целыми экранами.
4. **Тихие лейблы, громкие значения.** Свойства: label маленьким muted-серым, значение обычным тёмным; редактирование по hover (иконка карандаша появляется только при наведении) — интерфейс молчит, пока не нужен.
5. **Прогрессивное раскрытие иерархии данных:** highlight (2–4 свойства крупно) → About-карточка (настроенный список) → «View all properties» (полная простыня на отдельном экране) → property history (аудит). Четыре уровня погружения вместо одной портянки.
6. **Иконки-глаголы в ряд** (Note/Email/Call/Task/Meeting) — журнал действий всегда в одном месте, порядок настраивается.
7. **Цвет функционален**: оранжевый — бренд/CTA, статусные бейджи (deal score) — цветные, остальное — серо-синяя гамма. На карточке почти нет декоративного цвета.
8. **Недостатки (фиксируем честно):** (а) перегруз — на Enterprise-аккаунте карточка сделки легко несёт 15+ карточек и требует настройки, из коробки шумно; дефолт спасают только collapse и conditional-логика; (б) ключевые механики размазаны по тарифам — UI показывает замки/апселлы; (в) три места правды о «здоровье» сделки (deal score card, Deal Insights, guided actions) не сведены в одно — новый layout 2026 (About/Catch-up) как раз попытка это склеить; (г) enforcement-модель мягкая: UI строгий, API/workflow дырявые.

---

## 4. Новое в 2025–2026 (подтверждённое)

| Когда | Что | Суть |
|---|---|---|
| Октябрь 2025 | **Deal Insights CRM card** | AI-инсайты (риски, паттерны, buyer goals) прямо на record page, Sales Pro+ [community: Oct 2025 updates] |
| Октябрь 2025 | **Quote activity tracking** | Просмотры/скачивания/время чтения квоты; квоты из deal index; auto-expiration [community] |
| Октябрь 2025 | Новый конструктор workflows | Редизайн создания автоматизаций [community] |
| 2025→2026 | **Deal scores** | 0–100 вероятность, факторы ±, тренд, история; из беты в GA [KB] |
| Март 2026 | **Smart Deal Progression GA** | Транскрипт → предложенные апдейты полей/задачи/письмо, apply одним кликом [product] |
| Март–апрель 2026 | **Новый default record layout** | Табы About / Activities / Catch-up / Intelligence / Revenue; Breeze-сводка как карточка первого экрана [KB] |
| 27.04.2026 | **Перезапуск sales workspace** | Обновлённая версия workspace с guided actions [KB: customize-guided-actions] |
| 2026 | **AI forecast projections (beta)** | Диапазон прогноза по closed-won за 3 мес., таблица точности [KB] |
| INBOUND 2025 | Breeze Agents, Data Hub и пр. | Стратегический слой — разобран в анализе 2026-07-12, не дублирую |

Общий вектор 2025–2026: **AI мигрирует из «кнопки сбоку» в ткань карточки** (сводка = первый таб, риски = карточка, транскрипт = предложенные изменения полей), а данные о «здоровье» (score, риски, data quality) становятся штатными элементами record page.

---

## 5. Топ-5 переносимых идей для dashboard-crm

1. **Post-meeting apply-flow (Smart Deal Progression у нас).** Пресет `meeting_protocol` возвращает structured JSON: `{field_updates, tasks[], followup_draft}` → UI-диф «старое → новое» с чекбоксами → apply одной транзакцией через существующий whitelist полей. Самый высокий ROI: фундамент (transcripts, ai_runs, AiWorkspaceModal) готов, HubSpot подтвердил паттерн в GA. (~0.5–1 спринт)
2. **История health score + факторы ±.** Логировать значение health при каждом изменении, показывать спарклайн-тренд и «почему»: список факторов со знаками (как Deal score card: топ-факторы, дельта, view history). Наш скор из чёрного ящика становится обучающим инструментом. (~0.5 спринта)
3. **Pin активности + поиск по timeline.** Ровно одна закреплённая активность над лентой (уже есть `pinned_note` — обобщить до «закрепить любую активность»), поиск по телам заметок/протоколов, «предстоящее» отдельным блоком сверху. (~0.3 спринта)
4. **Квалификационный playbook = поля сделки.** Интерактивный опросник первой встречи на карточке: каждый ответ пишет в свойство (объём, типографика ЧЗ, версия 1С, роль контакта) и логируется как активность. Закрывает completeness за один звонок; механика чеклистов (083/084) переиспользуется. (~0.7 спринта)
5. **Cumulative time in stage + возвраты.** Поверх `stage_transitions`: суммарное время по стадии за все заходы и счётчик возвратов; бейдж «пинг-понг» в кокпите стадий как риск-сигнал. Плюс опции пайплайна «нельзя назад» / «нельзя создать сразу в поздней стадии». (~0.3 спринта)

Бонус-наблюдение для роадмапа КП: **трекинг просмотров КП** (открытия/время чтения) — единственный сигнал из этого ресерча, который соединяет наш блок КП с health score и follow-up; HubSpot добавил его только в октябре 2025, т.е. паттерн свежий и проверенный.

---

## Источники

### Knowledge Base (fetched 2026-08-23)
- https://knowledge.hubspot.com/records/work-with-records — анатомия record page
- https://knowledge.hubspot.com/object-settings/customize-records — конструктор: табы, карточки, view'ы, лимиты
- https://knowledge.hubspot.com/object-settings/create-cards-on-records — библиотека типов карточек
- https://knowledge.hubspot.com/records/use-cards-on-records — поведение карточек для пользователя (stage tracker и др.)
- https://knowledge.hubspot.com/records/understand-the-default-record-layout — новый layout 2026 (About/Catch-up/Intelligence/Revenue)
- https://knowledge.hubspot.com/object-settings/customize-properties-in-record-sections — настройка About-секции
- https://knowledge.hubspot.com/object-settings/set-up-pipeline-rules — pipeline rules
- https://knowledge.hubspot.com/properties/stage-calculated-properties — stage calculated properties
- https://knowledge.hubspot.com/object-settings/set-up-close-date-automation-for-objects — close date automation
- https://knowledge.hubspot.com/properties/set-up-conditional-logic-for-enumeration-properties — conditional property logic
- https://knowledge.hubspot.com/properties/set-up-conditional-options-for-properties — conditional options
- https://knowledge.hubspot.com/crm-setup/customize-activities-on-a-contact-company-deal-ticket-record-timeline — фильтры timeline
- https://knowledge.hubspot.com/records/pin-an-activity-on-a-record — pin
- https://knowledge.hubspot.com/records/manually-log-activities-on-records — логирование активностей, outcomes
- https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address — log vs track email
- https://knowledge.hubspot.com/calling/review-call-recordings-and-transcripts — записи, транскрипты, коучинг
- https://knowledge.hubspot.com/meetings-tool/schedule-a-meeting-on-a-record — планирование встречи с карточки
- https://knowledge.hubspot.com/prospecting/create-and-manage-deals-in-the-sales-workspace — deal в sales workspace, Deal Insights
- https://knowledge.hubspot.com/prospecting/customize-guided-actions — настройка guided actions
- https://knowledge.hubspot.com/records/use-deal-scores — AI deal score
- https://knowledge.hubspot.com/records/summarize-records — Breeze summarize / assistant
- https://knowledge.hubspot.com/records/use-line-items-with-deals — line items
- https://knowledge.hubspot.com/quotes/create-and-send-quotes — quotes, статусы, e-sign, оплата
- https://knowledge.hubspot.com/playbooks/use-playbooks — playbooks на записи
- https://knowledge.hubspot.com/sequences/enroll-contacts-in-a-sequence — sequences
- https://knowledge.hubspot.com/tasks/create-tasks — задачи и очереди
- https://knowledge.hubspot.com/records/associate-records — ассоциации, labels, primary company
- https://knowledge.hubspot.com/records/split-deal-credit-among-users — deal splits
- https://knowledge.hubspot.com/forecast/use-the-forecast-tool — forecast tool
- https://knowledge.hubspot.com/forecast/improve-forecasting-with-ai-projections — AI-проекции
- https://knowledge.hubspot.com/records/create-deals — создание сделок

### Продукт и релизы
- https://www.hubspot.com/products/sales/smart-deal-progression — Smart Deal Progression (GA)
- https://community.hubspot.com/t5/Releases-and-Updates/October-2025-Product-Updates/ba-p/1219426 — октябрь 2025

### Вторичные (для перекрёстной проверки)
- https://www.orangemarketing.com/account-based-marketing-using-hubspot — список buying roles (частично)
- https://community.hubspot.com/t5/HubSpot-Ideas/Mandatory-properties-on-Deal-STAGES-get-skipped-when-creating-a/idi-p/312836 — дыра required properties
- https://orgcharthub.com/ и обзоры — отсутствие нативного org chart

### Внутренние
- `/mnt/user-data/uploads/dashboard-crm/improvements/CRMs/hubspot-analysis-2026-07-12.md` — стратегический слой (не дублируется)
