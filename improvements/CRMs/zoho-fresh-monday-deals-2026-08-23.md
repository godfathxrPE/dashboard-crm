# Zoho CRM · Freshsales · Monday CRM — карточка сделки: глубокий ресерч 2025–2026

**Дата:** 2026-08-23
**Метод:** веб-ресерч (help.zoho.com, zoho.com, crmsupport.freshworks.com, support.freshsales.io, support.monday.com, monday.com, + верифицируемые сторонние обзоры 2025–2026), поверх прошлых анализов `zoho-analysis-2026-07-12.md` и `monday-analysis-2026-07-12.md` (углубление, не пересказ). По Freshsales прошлого анализа не было — разобран с нуля.
**Фокус:** анатомия карточки сделки, стадийные механики, AI-скоринг и его подача, визуальные приёмы/антипаттерны — в проекции на dashboard-crm (кокпит стадий, server-enforced гейты, health 0–8, Win Wizard, AI-модалка).
**Условные метки:** [OFFICIAL] — официальная документация вендора; [3P] — сторонний обзор; [не подтверждено] — не удалось верифицировать.

---

## 0. Резюме

Три системы дают три разных ответа на вопрос «что такое карточка сделки»:

- **Zoho** — *процессный документ*: стадия заблокирована Blueprint'ом, движение только через кнопки-переходы с обязательным сбором данных; вокруг — плотный набор related lists и Zia-панель. Старый UI выведен из эксплуатации 15–24 июля 2026, все теперь на next-gen UI («CRM for Everyone»: левый сайдбар, Teamspaces, Interactions tab, dark mode).
- **Freshsales** — *живой датчик*: карточка и канбан постоянно сигналят состоянием (красный rotting, теги Freddy «Likely to close / At risk / Gone cold», тренд-стрелки, 30-дневный график активности). Самая внятная в тройке подача AI-инсайта на карточке.
- **Monday** — *конструктор из виджетов*: item card = набор настраиваемых виджетов (Info, Emails & Activities, Connected boards, Deal Insights). AI размазан по колонкам (AI blocks/autofill) и агентам; Deal Insights Widget (beta, Ultimate) — сигнальная, не ML-модель: явный список позитивных/негативных сигналов с настраиваемыми порогами.

Главный вывод для dashboard-crm: **наш health score 0–8 архитектурно ближе всех к Monday Deal Insights (rule-based, объяснимые сигналы) — и это правильная модель для команды 5–15**; ML-скоринг Zia/Freddy требует десятки closed-won и всё равно вырождается в «confident, wrong prioritization» при плохой гигиене данных. Переносить стоит не ML, а **подачу**: тег-вердикт + топ-сигнал + тренд + разбивку сигналов, и Blueprint-подобный transition-модал.

---

## 1. Анатомия карточки сделки

### 1.1 Zoho CRM — Deal record

Компоновка record details page (классическая структура, сохранившаяся в next-gen UI с переездом навигации в левый сайдбар):

```
┌──────────────────────────────────────────────────────────────┐
│ Business card: имя сделки, Amount, Stage, Close date, Owner  │
│  + секция «Best time to contact» (только если Zia посчитала) │
│  [Blueprint активен] → стадия read-only, кнопки-переходы     │
├──────────────────────────────────────────────────────────────┤
│ Вкладки: Overview | Timeline (+ Interactions в next-gen)     │
├───────────────────────────────┬──────────────────────────────┤
│ Details (поля по layout)      │ Related lists:               │
│ Notes (+ кнопка Summarize     │  Stage History (история      │
│  note(s) — Zia, Ent 20+)      │   стадий + длительность)     │
│ Attachments                   │  Activities / Open & Closed  │
│                               │  Cadences (если enrolled)    │
│                               │  Contacts, Quotes, Emails    │
├───────────────────────────────┴──────────────────────────────┤
│ Zia-панель / Ask Zia (иконка в вертикальном сайдбаре)        │
│ Zia Notification panel + bell: аномалии, прогнозы, alerts    │
└──────────────────────────────────────────────────────────────┘
```

Ключевые факты:

- **Blueprint на карточке**: при входе сделки в Blueprint поле Stage **блокируется** — двигать можно только транзишн-кнопками с глагольными именами («Start Discovery», не «Needs Analysis») [OFFICIAL+3P, Zenatta]. Blueprint при переходе **перекрывает права доступа к полям**: read-only-поле становится редактируемым внутри транзита [OFFICIAL, FAQ].
- **Stage History** — стандартный related list сделки с историей стадий и длительностью; аналитика «Average time per state / Duration of states» — в отчётах Blueprint Usage [OFFICIAL]. Отдельного продукта «StageView» у Zoho нет — это related list + отчёты; в экосистеме Zia Agents есть use case «Stage History Summarizer» (агент суммаризует историю стадий) [OFFICIAL, zoho.com/agents].
- **Next-gen UI (2025–2026)**: старый UI отключён принудительно 15.07.2026 (Free/Std/Pro) и 21–24.07.2026 (Ent/Ultimate); баннеры с мая 2025. Изменения: левый вертикальный сайдбар, Teamspaces + Team Modules, вкладка **Interactions** (хронология касаний по всем каналам), новые вьюхи модулей (Chart/Grid/Timeline/Split), dark mode, интеграция Zoho Projects прямо в Teamspaces [OFFICIAL].
- Цветовое кодирование won/lost в пайплайне — зелёный/красный [OFFICIAL, changelog record page].

### 1.2 Freshsales — Deal card (kanban) + Deal landing page

**Канбан-карточка** (Spark UI, list view Deals):
- Компактный режим — только значения полей; расширенный — значения + лейблы; **максимум 6 настраиваемых полей** на карточке, имя сделки обязательно [OFFICIAL].
- Вьюхи через дропдаун: Table / Pipeline (по стадиям) / **Forecast (по месяцу/кварталу закрытия)** / Group by [OFFICIAL].
- Колонка стадии показывает число сделок и сумму; цветовая логика: синий — в работе, зелёный — won, красный — lost [OFFICIAL].
- **Rotting**: протухшая сделка — карточка **целиком красная**; на landing page — счётчик «сколько дней гниёт»; клик по иконке — список всех протухших в пайплайне [OFFICIAL].
- **Freddy-тег** на карточке в pipeline view («Likely to close» и т.п.) + Freddy-иконка на landing page [OFFICIAL].

**Deal landing page** [3P, CRM.org, + OFFICIAL Freddy-док]:
- Сводная панель: имя, сумма, стадия, связанный контакт; ключевые даты подняты наверх.
- Единый activity timeline: письма (двусторонняя синхронизация, треды), звонки (встроенный телефон логирует прямо в запись), SMS/WhatsApp, Freshchat, заметки, задачи — хронологически.
- Freddy deal insights card: тег + числовой скор с тренд-стрелками + топ-сигнал + 30-дневный график активности (hover — тип активности) + предложенные next best actions (email/звонок/встреча) + кнопки да/нет для фидбэка.
- Статусы отправок sequences (opened/clicked) видны в timeline.

### 1.3 Monday CRM — Item card сделки

- Item card открывается из item'а; технически это **вкладка в Updates Section**, собираемая из виджетов [OFFICIAL]. На практике продаётся как «expanded deal card».
- Виджеты: **Information** (все колонки борда), **Emails & Activities** (только monday CRM — таймлайн писем/звонков/встреч + композер), **Connected Boards / Table** (связанные item'ы, лимит 100), Subitems, Updates, плюс чарты/battery/Gantt по связанным бордам. Виджеты таскаются и ресайзятся (drag handle, синяя точка) [OFFICIAL].
- **Deal Insights Widget** (beta, Ultimate, раскатка постепенная, возможна доплата после беты) — сигнальная панель здоровья сделки в item card бордов с E&A [OFFICIAL] (детали в §3).
- Спец-колонки Deals-борда: Deal Value (number), Close Probability (%), **Forecast Value = формула Value × Probability**, Deal Stage (status с маппингом won/lost), Expected Close Date, Last Interaction; виджеты Deal Stages/Funnel для пайплайна [OFFICIAL+3P].
- Ограничение: пользователи-viewers **не могут открывать item cards** (ограничение GraphQL-прав) [OFFICIAL].
- Активность/AI: AI-actions в 9 видов на колонках (autofill), Notetaker, Timeline Summary одной кнопкой по всей истории общения [OFFICIAL].

---

## 2. Механики (18)

Формат: **как работает → UI-детали → аналог в dashboard-crm → что перенять**.

### M1. Blueprint: блокировка стадии + транзишн-кнопки (Zoho)
- **Как работает:** сделка входит в Blueprint по entry criteria; поле Stage становится read-only; движение — только кликом по транзишн-кнопке, видимой из текущего state и только разрешённым ролям/владельцу (Before-условия).
- **UI:** кнопки с глагольными именами («Start Discovery»); Common Transition («Closed Lost») видна из любого state.
- **Аналог у нас:** кокпит стадий + server-enforced гейты (S27/078) — enforcement даже сильнее (DB-триггер, не UI/API-валидация).
- **Перенять:** глагольные подписи на кнопках переходов вместо названий целевой стадии; явную визуальную индикацию «стадия управляется процессом» (замочек/стиль) — у нас гейт стреляет по факту, а не сообщает о себе заранее.

### M2. Blueprint During: транзишн-попап сбора данных (Zoho)
- **Как работает:** клик по переходу открывает попап: обязательные/опциональные поля, чеклист (Blueprint-only, не CRM-задачи), attachments, notes, создание задачи, инструкция для исполнителя; порядок элементов настраивается (UP/DOWN). Валидация (`validation_filter` + message) блокирует переход. Есть **сохранение перехода как черновика**, если обязательные поля ещё не собраны.
- **UI-деталь высшей пробы:** Blueprint **временно перекрывает field-level права** — read-only поле редактируемо строго внутри транзита. Т.е. «данные вносятся только в момент процесса».
- **Аналог у нас:** StageReadiness-чеклист + toast на блокировке; модалки транзита нет.
- **Перенять:** transition-модал (поля+чеклист+файл+заметка в одном попапе) — это Blueprint v2 из прошлого анализа, теперь с деталями: черновики перехода, порядок инпутов, инструкция-подсказка внутри модалки.

### M3. Blueprint SLA / state escalation + автопереходы (Zoho)
- **Как работает:** на каждый state настраивается SLA «сколько записи можно тут висеть»; по превышению — эскалация: email, уведомление менеджера, а с Blueprint 3.0 — **кастомные действия: task, field update, function, webhook**. Плюс **Automatic Transitions** — запись сама переходит дальше после заданной длительности, и **петли в тот же state** (повторные попытки действия).
- **UI:** просроченные записи подсвечиваются в отчётах Usage (Average time per state).
- **Аналог у нас:** датчик времени в стадии на кокпите + `stage_dwell_defaults` в settings (описан, консьюмеров нет).
- **Перенять:** довести `stage_dwell_defaults` до эскалации: превышение порога → запись в TodayView + notify owner'а; красная зона датчика. Автопереходы НЕ переносить (опасно при гейтах).

### M4. Common Transition «Проиграна» с причиной (Zoho)
- **Как работает:** Closed Lost — общий переход из любого state; в During собирают Loss Reason.
- **Аналог у нас:** is_lost-стадии; отдельного обязательного reason-попапа нет.
- **Перенять:** обязательный `lost_reason` в транзишн-модале при уходе в проигрыш — дёшево, а Lost Deal Analyzer-подобная аналитика (топ-3 причины) потом строится бесплатно.

### M5. Stage History как related list + суммаризация (Zoho)
- **Как работает:** каждая смена стадии пишется в Stage History (стадия, сумма, вероятность, длительность); в отчётах — время по стадиям. В экосистеме агентов есть «Stage History Summarizer» — LLM-пересказ траектории сделки.
- **Аналог у нас:** `stage_transitions` + `trg_zy_log_stage_transition` (078) — данные уже пишутся; UI-подача истории на карточке минимальна.
- **Перенять:** секцию «История стадий» на карточке (стадия → стадия, кто, когда, сколько дней просидела) + пункт в AI-модалке «пересказать траекторию сделки» — данные уже есть, это чистый UI/промпт.

### M6. Cadences на записи: статус каждого касания (Zoho)
- **Как работает:** запись (Deals поддерживаются; call-шаги для Deals — нет) энроллится в каденцию; на карточке появляется related list Cadences с состоянием каждого шага: email — Sent/Opened/Replied/Bounced/Unsubscribed…, task — статусы задач, call — Scheduled/Completed/Overdue. Автоанэнролл: перестал соответствовать критериям, достиг даты, record-level условие (сменился статус), исход шага (invalid number). Лимиты по тарифам (Standard 20 созданных/10 активных → Ultimate 70/50).
- **Аналог у нас:** ❌ (нет email-контура и автокаденций).
- **Перенять (task-only lite):** цепочка задач с офсетами (день 0/+3/+7) при входе в стадию + **exit conditions** (смена стадии/контакт состоялся → снять хвост цепочки) + мини-список «шаги каденции» на карточке. Exit conditions — главное, что отличает каденцию от тупого спавна задач.

### M7. Kiosk Studio: кастомный guided flow кнопкой на карточке (Zoho)
- **Как работает:** no-code конструктор экранных флоу (screens, поля, кнопки, ветвления), который вешается кнопкой на record details page / list / home; собирает данные и запускает действия — не меняя стадию (в отличие от Blueprint).
- **Аналог у нас:** Win Wizard — по сути ровно кастомный kiosk на событие «выиграли» (и сильнее: спавнит delivery-проект).
- **Перенять:** паттерн «именованный сценарный флоу кнопкой на карточке» для 1–2 ещё сценариев домена (например «Зафиксировать пилот/эксперимент», «Передать в РП со стороны заказчика») — вместо разрастания полей формы.

### M8. Zia prediction: вероятность + бакеты + тренд (Zoho)
- **Как работает:** ML-предсказание закрытия: факторы — win-behavior (паттерны выигранных), сопутствующие sales-активности, отзывчивость контакта, вложенное время. Требует истории (сторонняя оценка ~30 закрытых сделок [3P]; официальный минимум в открытых доках не зафиксирован — [не подтверждено]). Enterprise+.
- **UI:** процент на сделке; **Zia View** — список сделок, сгруппированный в бакеты «likely to win / lose / could go either way»; маркеры «trending up/down»; при изменении скора показывается, **какая активность повлияла**; фильтры по паттернам. Отдельно Zia Notifications (панель + bell + Slack/Cliq): аномалии дашбордов («deal closure amount deviation»), прогнозы, competitor alerts; клик по аномалии → trend analysis.
- **Аналог у нас:** probability на стадии (ручная/стадийная) + health 0–8.
- **Перенять:** не ML, а **бакетирование списка сделок по вердикту** (view «требуют внимания / идут к выигрышу / киснут») и тренд-маркер к health-скору (см. §3, §5).

### M9. Zia Notes Summary (Zoho)
- **Как работает:** кнопка «Summarize note(s)» на записи (Leads/Contacts/Accounts/Deals): Overall Summary по всем заметкам или Last Note Summary. Enterprise с 20+ лицензий / Ultimate, только английский.
- **Аналог у нас:** AI-модалка (бриф/сводка) — уже сильнее (двуязычный домен, свои пресеты).
- **Перенять:** размещение — кнопка суммаризации **прямо у ленты заметок/активности**, а не только в отдельной модалке: сокращает путь до самого частого сценария «что тут было».

### M10. Freddy deal insights: тег + скор + топ-сигнал + фидбэк (Freshsales)
- **Как работает:** ML по активности всех сделок аккаунта; включается автоматически только при «достаточных данных» (число closed-won, win ratio). Семь тегов: **Likely to close / Trending (всплеск активности за неделю) / At risk (спад активности) / Gone cold (не отвечает, шансов мало) / Neutral / Won / Lost**.
- **UI:** тег на канбан-карточке; отдельная **Freddy AI view** (сделки, сгруппированные по предикту); колонка «Deal prediction» в list view; на landing page — карточка инсайта: числовой скор + стрелки тренда с процентом изменения + **топ-сигнал, внёсший вклад** + 30-дневный график активности (hover по типам) + next best actions (email/звонок/встреча) + **кнопки yes/no** («предсказание верно?») для дообучения.
- **Аналог у нас:** health 0–8 + completeness-бейдж — rule-based, без тренда и без «главной причины».
- **Перенять:** формулу подачи «вердикт-тег + главная причина + тренд + предлагаемое действие» поверх нашего rule-based скора. Это лучший UX-паттерн из всех трёх систем.

### M11. Deal rotting: настройка и подача (Freshsales)
- **Как работает:** порог гниения задаётся **per pipeline** (Admin → Pipelines, «rotting age» в днях, там же где вероятности стадий); per-stage настройки нет [OFFICIAL; в отличие от Pipedrive]. В классике порог считается от **возраста сделки (даты создания)** [OFFICIAL Classic]; для актуальной версии основа отсчёта в открытых доках сформулирована как «идёт время → сделка стареет» — трактовка «от последней активности» [не подтверждено].
- **UI:** красная карточка целиком; на landing page — «rotten уже N дней»; клик — все протухшие пайплайна.
- **Аналог у нас:** датчик времени в стадии (точнее: per-stage, чего у Freshsales нет) + deal-health.
- **Перенять:** «число дней» рядом с индикатором (не только цвет) и переход «показать все закисшие» из карточки в отфильтрованный список.

### M12. Weighted pipeline → Forecast view (Freshsales)
- **Как работает:** админ задаёт probability на каждую стадию; weighted value = Σ(value × probability стадии); правка процента действует только на новые сделки. Forecast view группирует канбан **по месяцу/кварталу expected close** вместо стадий; вьюха-саммари реагирует на фильтры. Forecast-категорий (commit/best case) у Freshsales нет — это Salesforce/Dynamics-паттерн.
- **Аналог у нас:** probability есть; forecast-вьюхи и weighted-сумм в колонках нет.
- **Перенять:** переключатель PipelineBoard «по стадиям ⇄ по месяцу закрытия» + weighted-итог в шапке колонки. Дешёвый, честный форкаст без введения форкаст-категорий.

### M13. Sales sequences: Classic vs Smart + exit conditions (Freshsales)
- **Как работает:** шаги — email, email-reminder (внутренний алерт «персонализируй перед отправкой»), task, call reminder, SMS. **Classic** — по календарю; **Smart** — следующий шаг выбирается по поведению адресата. Энролл вручную с записи, по фильтрам (до 8 условий) или из saved view. Exit: все шаги пройдены / ответил / отписался / bounce + кастомные условия. Pro: 10 секвенций на юзера; Growth: 0.
- **UI:** шаги и события (opens/clicks) видны в timeline записи.
- **Аналог у нас:** ❌; частично «Следующий шаг»+дата.
- **Перенять:** то же, что M6 — модель exit conditions; плюс идея email-reminder-шага: «задача-подсказка персонализировать касание» вместо автоотправки — совместимо с нашим отсутствием email-интеграции.

### M14. Встроенный телефон + омниканальный timeline (Freshsales)
- **Как работает:** телефония встроена (покупка номеров, звонок из записи, автолог звонка), email — двусторонний sync, SMS/WhatsApp/Freshchat — всё в одном timeline записи.
- **Аналог у нас:** вкладка Активность (единый timeline+композер) — архитектурный паритет по ленте; каналов меньше (нет email/телефонии).
- **Перенять:** ничего срочного; подтверждение, что «одна лента на все касания» — отраслевой стандарт 2026. При появлении телефонии — логирование звонка в ленту без ручного ввода.

### M15. Item card из виджетов + Emails & Activities (Monday)
- **Как работает:** карточка сделки — конфигурируемый набор виджетов; E&A-виджет — таймлайн коммуникаций + логирование активности не выходя из карточки; Connected Boards/Table-виджет — связанные контакты/аккаунт/проект; Timeline Summary — AI-сводка всей истории общения одной кнопкой.
- **UI:** drag&resize виджетов; порядок колонок наследуется от борда; viewers карточку не открывают.
- **Аналог у нас:** фиксированная композиция карточки (кокпит, вкладки) — осознанно не конструктор.
- **Перенять:** не конструктор, а состав: блок «связанные объекты» (компания, контакты, delivery-проект, КП) как единый виджет с агрегатами (mirror-паттерн: «Delivery: фаза X, 12/30 задач»). Дублирует monday P1 прошлого анализа — подтверждено.

### M16. Deal Insights Widget: сигнальное здоровье сделки (Monday, beta)
- **Как работает:** не ML-скоринг, а **каталог настраиваемых сигналов**. Позитивные (5): высокая частота касаний, назначен следующий шаг, мультитрединг (несколько стейкхолдеров), продвижение по стадиям, явный интерес покупателя (вопросы о цене/сроках). Негативные (7–8): нет ЛПР, единственный контакт, клиент молчит N дней, нет запланированных встреч/задач, упоминание конкурента с негативным сентиментом, стагнация в статусе, бездействие продавца N дней, просроченная close date. Каждый сигнал — вкл/выкл, свои пороги (дни, lookback); сигналы можно **заглушить для отдельных статусов** (например, не пищать «стагнация» на стадии «Пилот»). AI помогает настроить и режет шум.
- **UI:** конфигуратор с **live preview слева** — сразу видно, как будет выглядеть панель.
- **Аналог у нас:** health 0–8 — та же философия (правила, не ML), но факторы зашиты и не объясняются на карточке.
- **Перенять:** это готовый чертёж «health v2» — разбивка скора на именованные сигналы с per-stage приглушением; live preview в настройках — приём для админки. Самая переносимая механика всего ресерча.

### M17. AI blocks / Autofill колонок + Notetaker (Monday)
- **Как работает:** AI-действия вешаются на колонки (Text/Date/Number/Dropdown/People/Status): Summarize, Extract information, Detect sentiment, Translate, Improve text, Writing assistant, Assign label, Assign person, Custom — часть умеет читать **Emails & Activities** как источник. Т.е. «AI-колонка» сама заполняет поле из переписки. Notetaker: транскрипт, спикеры, саммари, action items → поля CRM. Всё за AI credits.
- **Аналог у нас:** AI-модалка (бриф/сводка) — генерирует текст, но не пишет в поля.
- **Перенять:** HITL-заполнение полей из артефактов («извлечь бюджет/срок/ЛПР из последнего протокола → предложить патч полей с подтверждением») — тот же сквозной P0 из прошлых анализов (HubSpot SDP, Notetaker), теперь подтверждён и у Monday как «autofill from E&A».

### M18. Deal → Project handoff vs Win Wizard (Monday)
- **Как работает:** automation «Status → Closed Won: create item в Client Projects / duplicate board из Managed Template, связать Connect Boards, notify»; с мая (what's new) деплы линкуются с Quotes & Invoices (авто-подстановка получателя/продуктов). Handoff-шаблонов в маркетплейсе как готового пакета нет — это паттерн настройки. WorkForms в цепочке — только как входная точка лидов [3P; в handoff-цепочке роль форм не подтверждена].
- **Аналог у нас:** Win Wizard → `spawn_delivery_project` — **сильнее**: доменные шаблоны (1С:ДО/ERP), фазовая доска, milestone-гейты; у Monday — generic duplicate board.
- **Перенять:** только обвязку: авто-предложение визарда при входе в won (не ручной запуск) + notify delivery-owner'а и смежных ролей. Ядро handoff у нас лучше — подтверждение вывода monday-analysis P0/P2.

---

## 3. Как подают AI-скоринг здоровья сделки (сравнительно)

| | **Zoho Zia** | **Freshsales Freddy** | **Monday Deal Insights** |
|---|---|---|---|
| Природа | ML (predict close) | ML (activity patterns) | **Rule-based сигналы** + AI-настройка |
| Основной артефакт | % вероятности | Тег из 7 + числовой скор | Панель сигналов (без единого числа) |
| Бакеты/вердикты | likely to win / lose / either way (Zia View) | Likely to close / Trending / At risk / Gone cold / Neutral / Won / Lost | позитивные vs негативные сигналы |
| Объяснение «почему» | «какая активность повлияла на скор» при изменении | **Топ-сигнал** + 30-дневный график активности | **Весь список сигналов** явный и настраиваемый |
| Тренд | trending up/down | Стрелки с % изменения | — (сигналы бинарны) |
| Действие из инсайта | Zia Notifications → trend analysis; next best action | Next best actions: email/звонок/встреча | сигналы = чек-лист что чинить |
| Обратная связь | — [не подтверждено] | **Yes/No** «прогноз верен?» → дообучение | mute сигналов per status |
| Порог входа | Enterprise+; нужна история (сторонняя оценка ~30 closed [3P]) | Pro+; автовключение при «достаточно closed-won и win ratio» | Ultimate, beta, возможна доплата |
| Слабое место | чёрный ящик, cold start, tier-гейт | «If nothing is in the record, Freddy scores nothing» — мусор на входе → уверенно-неверные приоритеты [3P] | нет сводного числа; beta; credits |

**Выводы для dashboard-crm:**

1. **Подача важнее модели.** Freddy выигрывает не качеством ML, а формулой карточки: `тег → скор+тренд → топ-причина → график активности → предлагаемое действие → кнопка фидбэка`. Эту формулу можно наложить на наш rule-based health без всякого ML.
2. **Monday легитимизирует наш подход.** Ведущий «AI-first CRM» в 2025–2026 выкатывает здоровье сделки как **набор явных настраиваемых правил** — то есть health 0–8 не «бедный родственник ML», а актуальная архитектура. Наш gap — не модель, а (а) отсутствие разбивки на именованные сигналы на карточке, (б) отсутствие per-stage порогов/приглушения, (в) отсутствие тренда.
3. **ML-скоринг при нашей базе (команда 5–15, десятки сделок) не заведётся честно** — и Zia (~30 closed минимум [3P]), и Freddy (автовключение только при «достаточных данных») это прямо признают. Не строить.
4. Все трое сходятся: сигналы «единственный контакт / нет следующего шага / клиент молчит N дней / просрочен close date» — ядро здоровья. У нас stakeholders с ролями и «Следующий шаг»+дата уже есть → сигналы «single-threaded» и «нет следующего шага» вычисляются из существующих данных.

---

## 4. Визуальные приёмы и антипаттерны

### Zoho
**Приёмы:**
- Глагольные транзишн-кнопки — переход читается как действие, а не как телепорт стадии.
- «Best time to contact» показывается **только когда есть данные** — секция не занимает место пустой (анти-пустографика).
- Цвет win/lost (зелёный/красный) закреплён семантически по всему продукту.
- Interactions tab (next-gen) — касания отдельно от полей.

**Антипаттерны (не повторять):**
- Перегруз record page: десяток related lists + вкладки + панели → у новичка нет шансов пройти «правило 5 секунд». Zoho сам это признал редизайном 2025 и Teamspaces (скрыть лишние модули от роли).
- Blueprint «spiderweb»: разросшийся граф переходов, поддержка дороже пользы (предупреждение самих Zoho-партнёров) — держать наш граф гейтов минимальным.
- Zia-инсайты размазаны по 4 каналам (панель, bell, Slack, email) — сигнал теряется; у нас всё должно сходиться в TodayView.
- Tier-гейт на объяснимость (прогноз — Enterprise, notes summary — Enterprise 20+ лицензий): интерфейс здоровья сделки не должен зависеть от «тарифа».

### Freshsales
**Приёмы:**
- **Красная карточка rotting + счётчик дней** — самый читаемый сигнал протухания на рынке; исключение горит, а не всё подряд.
- 30-дневный activity-спарклайн на карточке инсайта — плотность/затухание общения видно без слов.
- Лимит 6 полей на канбан-карточке — принудительная дисциплина плотности (у Monday такого лимита нет — и карточки распухают).
- Тренд-стрелки с % у скора; тег + скор раздельно (вердикт для сканирования, число для сравнения).

**Антипаттерны:**
- Красный перегружен: rotting-карточка красная целиком И lost-колонка красная — один цвет на два разных смысла («проиграна» vs «требует действия»). У нас: rotting — предупреждающий (amber/оранжевый токен), красный — только деструктив/провал.
- Rotting per pipeline, не per stage — грубая гранулярность (стадия «Пилот» законно живёт дольше «Квалификации»). Наш per-stage датчик — сильнее, сохранить.
- Порог «от даты создания» (в классике) наказывает длинные, но живые сделки — считать от последней активности/входа в стадию.

### Monday
**Приёмы:**
- Live preview в конфигураторе Deal Insights (настройки справа, результат слева) — паттерн для любых наших настроек здоровья/гейтов.
- Mute сигналов per status — признание, что «тишина» на поздних стадиях нормальна.
- Forecast view: stacked bar по стадиям + target line + attainment в шапке — форкаст против цели в одном взгляде.
- Formula-колонка Forecast Value = Value × Probability — вычислимое поле вместо ручного.

**Антипаттерны:**
- Цветовой шум: каждый status-label — свой яркий цвет, на борде из 30 сделок горит всё → не выделено ничего. Наш принцип «цвет только с ролью» — сохранить.
- Карточка-конструктор без дефолтной иерархии: состав item card зависит от того, кто как накидал виджеты; консистентность между сделками не гарантирована. Фиксированная композиция нашей карточки — преимущество, не отсталость.
- Ключевые механики за beta/Ultimate/credits (Deal Insights, Notetaker, agents) + viewers вообще не открывают item card — рваный опыт по ролям.
- AI Workflows «often needs heavy editing» [3P] — генерация автоматизаций из NL пока сырая; не тратиться на такой конструктор.

---

## 5. Топ-7 переносимых идей для dashboard-crm

1. **Health v2 «сигнальная панель» (Monday Deal Insights + подача Freddy).** Разбить health 0–8 на именованные сигналы (нет следующего шага; единственный стейкхолдер / нет ЛПР; тишина N дней; стагнация в стадии сверх порога; просрочена ожидаемая дата; нет активности продавца). На карточке: тег-вердикт («В порядке / Требует внимания / Киснет») + топ-сигнал + список сигналов ✓/✗. Пороги per stage из `stage_dwell_defaults` (заводим консьюмера!), приглушение сигналов на поздних стадиях. Всё из существующих данных, без ML. (~0.5 спринта)
2. **Transition-модал (Zoho Blueprint During).** Попап перехода: недостающие поля гейта + чеклист + файл + заметка + глагольная подпись; обязательный `lost_reason` на переходе в проигрыш; черновик перехода при неполных данных. Наш DB-гейт остаётся источником истины, модал делает его вежливым. (~0.4 спринта, = Blueprint v2 P1 прошлого анализа, детализировано)
3. **Эскалация датчика стадии (Zoho state escalation × Freshsales rotting).** Превышение порога стадии → датчик в «красную зону» с числом дней + карточка в TodayView + notify владельца; из индикатора — переход в отфильтрованный список «все закисшие». Не красный цвет lost, а отдельный warning-токен. (~0.3 спринта)
4. **История стадий на карточке + AI-пересказ (Zoho Stage History).** `stage_transitions` уже пишется с 078 — показать ленту «стадия → стадия, кто, когда, длительность», и пресет AI-модалки «траектория сделки» (аналог Stage History Summarizer). Чистый UI+промпт. (~0.2 спринта)
5. **Активность-спарклайн 30 дней (Freddy).** Мини-бар-чарт касаний из timeline на кокпите: затухание общения видно до всякого скоринга; hover — типы (звонок/встреча/файл/чат). (~0.2 спринта)
6. **Forecast-переключатель пайплайна (Freshsales Forecast view + Monday Forecast Value).** PipelineBoard: группировка «по стадиям ⇄ по месяцу ожидаемого закрытия», weighted-итог (Σ amount × probability) в шапке колонки; позже — target line (Monday). Probability уже в модели. (~0.4 спринта)
7. **Task-каденция с exit conditions (Zoho Cadences × Freshsales sequences, без email).** Цепочка задач с офсетами при входе в стадию, авто-снятие хвоста при смене стадии/состоявшемся касании; статус шагов мини-списком на карточке. Расширение S29-автоматизаций, без email-контура. (~0.3–0.5 спринта)

**Не переносить:** ML-скоринг (Zia/Freddy) до накопления сотен closed; автопереходы стадий; конструктор карточки из виджетов; AI credits-модель; красный как цвет «внимания»; per-pipeline (вместо per-stage) пороги гниения; NL-генератор автоматизаций.

---

## Источники

### Zoho (официальные)
- [FAQs on Blueprint — help.zoho.com (crm-nextgen)](https://help.zoho.com/portal/en/kb/crm-nextgen/faqs/blueprint/articles/faqs-blueprint)
- [Blueprint 3.0 — Focus Group webinar (community)](https://help.zoho.com/portal/en/community/topic/focus-group-webinar-part-1-zoho-crm%e2%80%99s-blueprint-3-0)
- [Zia prediction](https://www.zoho.com/crm/zia/prediction.html) · [Zia — Overview (KB)](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/zia/articles/zia-overview) · [Zia Notifications (KB)](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/notifications/articles/zia-notifications)
- [Zia Notes Summary (community)](https://help.zoho.com/portal/en/community/topic/get-instant-summaries-of-your-notes-with-the-help-of-zia)
- [Cadences (KB)](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/cadences/articles/cadences)
- [Kiosk Studio](https://www.zoho.com/crm/process-management/kiosk-studio.html) · [Stage History Summarizer (agents use case)](https://www.zoho.com/agents/resources/use-case/stage-history-summarizer.html)
- [CRM for Everyone: reimagined UI (community)](https://help.zoho.com/portal/en/community/topic/introducing-zoho-crm-for-everyone-a-reimagined-ui-next-gen-ask-zia-timeline-view-and-more) · [Old UI EOL: deadline (community)](https://help.zoho.com/portal/en/community/topic/zoho-crms-old-user-interface-is-set-to-retire-deadline-and-what-to-expect)
- [Changes in record details page UI (community, 2020)](https://help.zoho.com/portal/en/community/topic/changes-in-the-new-ui-of-the-record-details-page)

### Zoho (сторонние)
- [Zenatta — Blueprint Tutorial 2026](https://zenatta.com/zoho-crm-blueprints-2026/)
- [TheRavenLabs — 22 Zia AI Features 2026](https://www.theravenlabs.com/zoho-crm-zia-ai-features-2026-22-capabilities-explained/)

### Freshsales (официальные)
- [Freddy deal insights](https://crmsupport.freshworks.com/en/support/solutions/articles/50000002393-what-are-freddy-s-deal-insights-and-how-to-use-them-)
- [Rotten deals (Classic)](https://support.freshsales.io/support/solutions/articles/239120-what-are-rotten-deals-how-do-they-work-)
- [Spark UI for Deals](https://crmsupport.freshworks.com/support/solutions/articles/50000006169-how-to-use-spark-ui-for-deals-) · [Deals: Table and Card views](https://crmsupport.freshworks.com/support/solutions/articles/50000002388-deals-table-and-card-views)
- [Weighted pipelines](https://crmsupport.freshworks.com/support/solutions/articles/50000002959-how-to-set-up-and-use-weighted-pipelines-)
- [Sales sequences](https://crmsupport.freshworks.com/support/solutions/articles/50000002443-what-are-sales-sequences-how-to-configure-a-sequence-)

### Freshsales (сторонние)
- [CRM.org — Freshsales Review 2026](https://crm.org/news/freshworks-freshsales-crm-review)
- [usecarly — Freshsales AI in 2026: What Freddy Actually Does](https://www.usecarly.com/blog/freshsales-ai/)

### Monday (официальные)
- [The Item Card](https://support.monday.com/hc/en-us/articles/360017143959-The-Item-Card) · [The Deal Insights Widget](https://support.monday.com/hc/en-us/articles/28180465521682-The-Deal-Insights-Widget)
- [monday CRM's AI features](https://support.monday.com/hc/en-us/articles/25548698480914-monday-CRM-s-AI-features)
- [The Forecasting View](https://support.monday.com/hc/en-us/articles/35252007254930-The-Forecasting-View)
- [monday CRM what's new](https://monday.com/crm/whats-new) — примечание: даты релизов на странице (Quotes↔Deals — 17.05, MCP Block — июль) в текущей выдаче читаются как 2025; в анализе 2026-07-12 те же пункты датированы 2026 — год [не подтверждено], содержание пунктов совпадает.

### Monday (сторонние)
- [mondaywiki — Monday CRM Deals Board 2025](https://mondaywiki.com/monday-crm-deals-board/)
- [flowfam — monday.com AI Features Guide 2026](https://flowfam.co/monday-com-ai-features/)

### dashboard-crm (репозиторий)
- `improvements/CRMs/zoho-analysis-2026-07-12.md` · `improvements/CRMs/monday-analysis-2026-07-12.md` — базовые анализы, углублённые этим документом.
