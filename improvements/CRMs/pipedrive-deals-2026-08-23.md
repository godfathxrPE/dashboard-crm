# Pipedrive — карточка сделки: глубокий разбор (2026-08)

**Дата:** 2026-08-23
**Метод:** WebFetch support.pipedrive.com (KB-статьи, состояние авг. 2026), pipedrive.com/product-updates, newsroom, blog; сторонние обзоры. Углубляет `improvements/CRMs/pipedrive-analysis-2026-07-12.md` (не пересказывает: там — gap-матрица и приоритеты, здесь — микро-механика deal detail view).
**Пометки честности:** [KB] — подтверждено официальной базой знаний; [не подтверждено] — общеизвестное поведение продукта, не найденное в проверенных источниках этого прогона.

---

## 1. Анатомия карточки сделки (deal detail view)

Компоновка: **header во всю ширину → под ним слева sidebar (колонка секций), справа — рабочая зона (Focus + History с вкладками)**.

### 1.1 Header

- Title сделки; hover по имени owner / person / organization даёт **hover card** — попап с деталями сущности без перехода [KB: deal detail view, detail view].
- **Progress bar стадий**: сегменты = стадии пайплайна, показывает текущую стадию и **количество дней, проведённых на каждой стадии**; после Won не обновляется [KB]. Смена стадии кликом по сегменту — [не подтверждено KB в этом прогоне, но стандартное поведение по туториалам].
- Кнопка **Followers** (подписчики на изменения) — в header [KB].
- Кнопка **Lost** точно есть на карточке: «When you click "Lost" on a deal card, a modal prompt appears» [KB: lost reasons]. Кнопка Won симметрично — [не подтверждено цитатой, но следует из потока Won/Lost].
- В header/топе — числа value: сумма продуктов/value, weighted value (см. §2.8).

### 1.2 Sidebar — секции

Первая секция — **Summary**, «ключевые детали сделки»: **score, value и products, revenue-метрики, label, probability, expected close date, contact person, linked organization** [KB]. Всегда закреплена сверху. Настройка Summary через меню «…» — **применяется ко всей компании** (per-company).

Дальше — переставляемые секции (набор зависит от включённых фич): **Details** (все поля, вкл. кастомные), **Person**, **Organization**, **Participants**, **Products**, **Documents (Smart Docs)**, **Related organizations** (на org-карточке), **App panels** (панели marketplace-приложений).

Механика кастомизации сайдбара [KB: detail view sidebar]:

- «…» → **Manage sidebar sections**: чекбоксы вкл/выкл секций + drag-handle «=» для порядка. Скрытие секции **не удаляет данные**.
- Эти настройки — **per-user** (не влияют на коллег). Контраст: состав Summary — per-company. Двухуровневая модель «компания фиксирует шапку, юзер — остальное».
- Поля можно перетаскивать между Summary и Details.
- **Карандаш в заголовке секции** = bulk-edit всех полей секции разом; клик по полю или карандаш рядом с полем = **inline edit** (автосейв по клику вне поля; для deal value — явная кнопка Save) [KB: updating items in the detail view].
- Иконка **«Show only filled fields»** — прячет пустые поля (борьба с шумом из ~30 полей).
- Каждая секция сворачивается стрелкой (collapse per-section).
- «Customize fields» прямо из сайдбара — переход к созданию кастомного поля.

### 1.3 Рабочая зона: Focus + History

- **Focus section** — над историей: «все activities, email drafts и pinned notes, требующие внимания» + **scheduled emails**. Сворачиваемая. Это «что дальше по сделке» одним блоком [KB].
- **History** — timeline с вкладками-фильтрами: **Notes · Activities · Emails · Files · Documents · Invoices · Changelog** [KB].
- **Changelog** — полный аудит изменений сделки с момента создания, отсортирован по дате/времени: смена стадии, value, label, контакта, expected close date, кастомных полей [KB: detail view]. Отдельная вкладка, а не свалка в общем фиде.
- Composer добавления (заметка/письмо/активность) — в этой же зоне.

---

## 2. Механики (по фичам)

### 2.1 Won / Lost + lost reasons

**Как работает:** клик Lost → модалка: причина (freeform по умолчанию или **предустановленный список до 100 причин**, настраивает админ) + комментарий. Причина ложится в **Details** сделки, комментарий сохраняется **заметкой** на карточке. Won/Lost убирает сделку из активного pipeline view (возврат через фильтры). Отчёты по lost reasons — Insights → Deal → Performance + колонка в list view [KB: lost reasons].
**Данные:** `lost_reason`, `won_time`, `lost_time`, note.
**dashboard-crm:** Win Wizard есть; lost reasons как словарь — проверить (в июльском анализе не значится).
**Перенять:** предустановленный словарь причин проигрыша (для домена: «ушли к франчайзи 1С», «отложили маркировку», «сделали сами», «цена») + комментарий→заметка + отчёт. Дёшево, а аналитика проигрышей для ниши маркировки ценная.

### 2.2 Sidebar: Summary/Details + управление шумом

**Пошагово:** админ фиксирует Summary (per-company), юзер — порядок/видимость остальных секций (per-user); «Show only filled fields»; collapse; bulk-edit карандашом; inline edit.
**UI-детали:** drag-handle «=», меню «…», карандаш на секции, стрелки collapse.
**dashboard-crm:** кокпит + completeness-бейдж «цена пустоты» — сильнее по мотивации заполнения, но нет per-user порядка секций и «только заполненные».
**Перенять:** режим «скрыть пустые поля» + collapse секций с сохранением в localStorage/профиле; жёсткий Summary сверху (у нас — кокпит, паритет).

### 2.3 Focus section («следующие шаги» по-Pipedrive)

**Состав:** незавершённые activities + email drafts + scheduled emails + pinned notes — одним сворачиваемым блоком над историей [KB]. Приоритет активностей (High/Medium/Low) виден в focus section связанной сущности [KB: activity priority labels].
**Данные:** activities (due date, done), drafts, pinned notes.
**dashboard-crm:** `DealFocusPanel` (next_step + дата + «шаг сделан») — паритет и местами сильнее (явный next_step-текст). У Pipedrive сильнее агрегация: в фокус попадают и черновики/отложенные письма, т.е. «всё незакрытое», а не одно поле.
**Перенять:** подмешивать в панель «Следующий шаг» незакрытые задачи/встречи сделки (счётчик «+2 задачи, 1 встреча»), чтобы фокус-блок был агрегатом, а не одним полем.

### 2.4 Activities: создание, Mark as done, приоритеты

**Модалка создания** [KB: activities]: Title · Type (call, meeting, task, deadline, email, lunch + кастомные типы) · дата/время/длительность · **Busy/Free** (Busy блокирует слот в Scheduler) · **Note (приватная)** vs **Description (публичная, уходит гостям и в внешний календарь)** · Guests (люди или внешние email) · Location (с проверкой Google Maps).
**Mark as done:** проставляет `marked_as_done_time` (≠ due date, due можно править задним числом). **Автопредложения следующей активности нет** — KB прямо этого не описывает; следующий шаг создаётся вручную. Важно: миф об «авто-предложении follow-up» не подтверждается текущей KB [KB]. С марта 2026 отправленные письма могут **автологироваться завершёнными активностями** [product updates 03.2026].
**Приоритеты:** фиксированные High/Medium/Low, переименовать/добавить нельзя; в pipeline view — **цветные символы** у активности (hover = уровень), в календаре — на плитке; работают как условие И действие в Automations [KB].
**Поля-агрегаты на сделке:** `last_activity_date` (последняя done), `next_activity_date` (ближайшая незакрытая) — на них построен дефолтный сорт пайплайна.
**Кастомизация полей активностей по типам** (видимость/обязательность) — июль 2026 [product updates].
**dashboard-crm:** calls/meetings/tasks раздельно; поля-агрегаты закрыты `next_action_date`/`last_contact_date`.
**Перенять:** (а) приоритет на задачах (3 фикс. уровня, цветной маркер, фильтр); (б) разделение «приватная заметка vs публичное описание» для встреч (у нас встречи со стейкхолдерами заказчика); (в) после «шаг сделан» — наш тост «запланируй следующий» уже сильнее Pipedrive, сохранить.

### 2.5 Contextual view (боковая панель активности/лида)

**Как работает:** клик по активности в list view / по лиду в Leads inbox открывает **side panel** вместо перехода: детали редактируемы, вкладки связанных deal/person/org, «все детали detail view доступны в contextual view». Навигация K/J между записями, Esc — закрыть, стрелки прокрутки; иконка-настройка вкл/выкл (синяя/серая) [KB: contextual view, beta].
**dashboard-crm:** `PeekPanel` (W2d) — прямой аналог. Паритет.
**Перенять:** K/J-навигацию внутри peek (если ещё нет) и тумблер отключения для консерваторов.

### 2.6 Rotting (микро-детали)

**Настройка:** pipeline view → карандаш → per-stage тумблер «Rotting in (days)» [KB].
**Триггер:** неактивность по **last updated**; сбрасывают таймер: activity marked done, добавление note/файла, **email-действия (отправка, получение, unlink, удаление)**, правка полей (custom fields, close date, value). **Не спасает** запланированная будущая активность («rotting disregards the next activity date»). Ловушка: невидимое одному юзеру письмо (visibility) сбрасывает таймер — сделка выглядит нетронутой, но не «гниёт» [KB].
**UI:** «red color on the deal tile» в pipeline view. Отображение в detail view KB не описывает.
**dashboard-crm:** реализован свой rotting (next_step-модель) + `last_contact` — две модели, июльский P3 (per-stage thresholds) остаётся актуален.
**Перенять:** список «что сбрасывает таймер касания» формализовать как у Pipedrive (любая запись в timeline = touch), включая файлы и КП.

### 2.7 Email на карточке: threading, tracking, AI

**Sync (Growth+):** Gmail / Office 365 / Exchange EWS / IMAP. Письма линкуются к сделке **автоматически по адресам участников** или вручную; «shared emails видны только в связанных элементах». Вкладка Emails в History [KB: email sync].
**Tracking:** open = **значок глаза**, click = **значок курсора**; вкл/выкл per-письмо перед отправкой. Лимит 40 email-действий/мин на компанию.
**Participants ↔ письма:** дек. 2025 – фев. 2026 — быстрые подсказки контактов при добавлении participants, добавление получателей письма как participants, participants из прошлых тредов [product updates] — участники и переписка склеены двусторонне.
**AI (Premium/Ultimate):** **AI email summarization** — в треде у reply-иконки кнопка «Summarize» → Summary + **Sentiment + Readiness to buy (1–10)** + Action items; кэшируется после первого запуска; лимиты 50/день, 10/30 мин [KB]. **AI email creation** («Write my email», тон/длина) и **AI suggested replies** в Sales Inbox [KB: pipedrive-ai].
**Team Inbox (Premium+):** общий ящик (sales@) с назначением ответственных [KB].
**dashboard-crm:** email-интеграции нет (осознанно).
**Перенять:** не сам email, а паттерн **«Sentiment + Readiness to buy + Action items»** — применить к нашим AI-сводкам звонков/встреч (transcripts уже есть): три оценочных поля в выводе `ai-summarize`.

### 2.8 Products / Value / Weighted value / Forecast

**Products (Growth+):** каталог (price, product code, tax %, unit, cost per unit / direct cost — информационные); до **1000 позиций на сделку**; продукты видны в Summary («value and products») и секцией сайдбара [KB].
**Probability двухуровневая:** per-stage (по умолчанию 100%) и per-deal (в Summary); **deal probability всегда перекрывает stage probability**. Weighted value = value × probability/100; показывается в заголовках колонок пайплайна, в топе pipeline и в forecast view [KB: probability].
**Forecast view (по июльскому анализу — Growth+/Professional+):** колонки по месяцам expected close date (или кастомного поля-даты); заголовок колонки = won + open (+weighted); **won-сделка попадает в колонку по won date**, не по expected close; drag&drop сделки между месяцами меняет expected close date; **зелёный статус-бар внизу плитки** = прогресс по стадиям [KB: forecast view].
**dashboard-crm:** probability по стадии есть (server-side), weighted pipeline есть; продуктов нет.
**Перенять:** (а) per-deal override probability (частный случай: «стадия ранняя, но подписан протокол — 80%») с приоритетом над стадийной; (б) line items не в сделку, а в **КП** (см. §5, идея 4).

### 2.9 Participants + hover cards

Один **primary contact** + N **participants**; participants «не formally linked» — не светятся в list view и Insights; добавление: поиск / создание на лету / импорт; «View All» + шестерёнка настройки видимых полей [KB]. Ролей/лейблов у participants **нет** — плоский список. Hover card по любому имени.
**dashboard-crm:** стейкхолдеры **с ролями** — сильнее Pipedrive.
**Перенять:** hover card стейкхолдера (роль, телефон, последнее касание) в списках и timeline.

### 2.10 Дубликаты и связи организаций

**Merge Duplicates:** Tools and apps → Merge Duplicates (авто-кандидаты для people/orgs) или вручную из detail view: «More (…) → Merge» — работает для **deals, people, orgs**. Поток: выбор primary (его данные приоритетны в конфликтах) → предпросмотр → merge; **необратимо**. Показывает names, deals, activities, created, owners, visibility для решения [KB].
**Related organizations:** секция на org-карточке; типы связей **parent/daughter**, **related**, sister (автоматом у двух daughters); связь нельзя редактировать — только удалить (корзина) и создать заново [KB].
**dashboard-crm:** дедупликации нет; связей компаний нет (для холдингов с несколькими юрлицами — типично для маркировки! — актуально).
**Перенять:** parent/daughter связи компаний (одна миграция + секция на карточке компании) — юрлица одного холдинга, сводка сделок по группе.

### 2.11 Scheduler (букинг встреч)

Growth+; два типа ссылок: **General availability** (постоянное окно; на Growth — одна активная ссылка) и **Specific times** (разовые слоты вручную). Вставка ссылки/слотов прямо в composer письма на карточке; после бронирования клиенту — confirmation email, в календаре юзера **автосоздаётся activity**; Busy-активности блокируют слоты; буферы, длительность, футер-текст формы [KB].
**dashboard-crm:** нет; при отсутствии email-интеграции ценность ниже — отложить.

### 2.12 Pulse — прицельно (новый AI-контур приоритизации)

**Статус:** запущен сентябрь 2024 (closed beta, waitlist) → «улучшенная версия всем» с весны 2025 [newsroom/businesswire]; сейчас в KB: «Pulse feed is available to all users», а scoring/sequences/enrichment зависят от плана.

Четыре компонента [KB: pulse]:

1. **Pulse feed** — лента-фид с **тремя вкладками**:
   - **Follow-ups:** ответы на письма; «нет ответа 5 дней» — напоминание; сегодняшние звонки/встречи/задачи; **email opens/clicks как события**; черновики manual-шагов Sequences.
   - **Overlooked deals:** сделки без активности вовлечения; просроченные задачи открытых сделок.
   - **Opportunities:** новые сделки на тебе **без запланированных задач**.
   Каждая карточка: реквизиты сделки/контакта + **quick actions** (запланировать задачу, отправить письмо, открыть сделку). Клик → **боковая панель с полным контекстом сделки** («view deal context without switching tabs»). «…» → **Hide suggestion**. Фильтры: pipeline, stage, тип карточки, score; сортировка: тип/score/срок/дата добавления [KB: pulse feed].
   **Ключевой факт:** на вопрос «это AI?» KB отвечает: **«Not currently. Фид опирается на фиксированные правила и тайм-триггеры»** — маркетинг говорит «AI-powered», механика — rule-based. Честная копируемость: Pulse-фид воспроизводим без ML.
2. **Custom scoring** — правила скоринга под ICP/стратегию; скоры — основа приоритизации по всему Pulse (эволюция Scores).
3. **Sequences (Growth+)** [KB: sequences]: линейный конструктор ≤10 шагов: **auto-email** (шлёт Pipedrive, нужен per-user consent-тумблер) / **manual email** (черновик падает в Pulse feed на ручную отправку) / **activity-шаг** (call/meeting/visit с due date) / **delay**. Энроллмент ≤250 сделок/лидов, из карточки сделки, билдера или bulk из списка; sequence «прилипает» к типу (deals или leads) после первого энроллмента. Overview: In progress / Completed / Failed. Ноябрь 2025: авто-подписи, умный auto-unenrollment (при ответе), stop/skip, bulk unenrollment [product updates]. Automations могут энроллить в Sequence.
4. **Data enrichment** — автозаполнение **только пустых** полей компании/контакта (отрасль, размер, выручка, контакты) в один клик из карточки; дек. 2025 — bulk из list view, top-up кредитов [KB + product updates].

**dashboard-crm:** TodayView — прямой аналог фида и уже с unified queue; вкладочной триады и hide/snooze нет; sequences/enrichment нет.
**Перенять:** см. §5, идея 1.

### 2.13 Sales Assistant + AI-нотификации

**Sales Assistant** (beta, все планы по записи): **AI-чат** (OpenAI) рядом с поиском наверху; голос и текст; вопросы к данным аккаунта («какие сделки требуют внимания»), суммаризация, создание заметок, how-to по Pipedrive; показывает источники ответов; история диалогов; контекстные подсказки от текущего экрана [KB]. **Win probability prediction как фичи нет** — вопреки маркетинговым обзорам [подтверждено отсутствием в KB].
**AI-powered notifications** (Premium+): «умные» уведомления о перформансе компании под иконкой лампочки → Analytics and tips; появляются после недель накопления данных [KB: pipedrive-ai].
Прочий AI-набор: AI import assistant (маппинг колонок при импорте), AI report creation в Insights (текст → отчёт, март 2025), AI marketplace search + app recommendations, business card scanner (mobile) [KB: pipedrive-ai; newsroom].
**dashboard-crm:** AI-модалка с доменными пресетами — глубже по вертикали; generic-чата нет (Cmd+K достаточно).

### 2.14 Automations вокруг карточки

На самой карточке automations не живут, но касаются её: авто-письма от automations попадают в тред сделки; **email sender control** (июль 2026) — от чьего имени шлёт automation (владелец automation / deal owner); превью шаблонов в конструкторе; **workflow health monitoring** + проактивные алерты о сбоях и автоотключение при стабильных фейлах (апрель–май 2026); история запусков — отдельный экран Automations: history [KB + product updates].
**dashboard-crm:** S29 (1 триггер × 1 действие), `automation_runs` без дашборда. Health-monitoring паттерн — в бэклог P1.

### 2.15 Invoices на карточке

Вкладка **Invoice** в History — интеграция с бухгалтерскими системами (выставление счетов из сделки). [KB упоминает вкладку; деталей в этом прогоне не собирали]. Для dashboard-crm счета в 1С — не переносить.

---

## 3. Визуальные приёмы

- **Один сигнал тревоги — красный тайл** rotting в pipeline; никаких градаций «оранжевый/жёлтый». Выделено исключение, не спектр.
- **Цветные метки строго по ролям:** deal labels (до 100 на сделку, цветные пиллы) — сегментация; activity priority — три фикс. цвета-символа; email tracking — микро-иконки (глаз/курсор). Одинаковая форма = одинаковый смысл во всех view.
- **Шум глушится структурно, а не типографикой:** Summary (5–8 ключевых полей) закреплён сверху и правится только админом; остальное — collapse + «Show only filled fields» + per-user порядок секций. Пустое поле не показывается вместо «серого прочерка».
- **История разгружена вкладками** (Notes/Activities/Emails/Files/Docs/Invoices/Changelog) — а не бесконечный смешанный фид; отдельно Focus-блок «незакрытое» над историей.
- **Hover cards** везде (owner, person, org, deal title) — контекст без навигации; плюс contextual side panel с K/J — переходы на полную страницу минимизированы.
- **Progress bar с днями на стадию** — темпоральность сделки видна в шапке, без открытия отчётов.
- **Плотность:** одна визуальная тема, без пользовательских тем/дефолтного dark mode в вебе [не подтверждено обратное]; кастомизация интерфейса — функциональная: порядок пунктов левой навигации, отключение неиспользуемых, стартовая страница (Deals или Insights), две системы хоткеев (буквы: D-deal, A-activity, N-note, «/» — поиск, «.»/«+» — quick add; цифры 1–9 — навигация) [KB: quick actions; blog: interface preferences]. iOS-приложение в янв. 2026 перешло на Liquid Glass [product updates].
- Дизайн-система — **Convention UI** (публичный Figma community file) — можно использовать как референс компонентов.

---

## 4. Новое в 2025–2026 (дельта к июльскому анализу)

**2025:**
- **Февраль:** анонс «agentic CRM» — сеть агентов (генеральные: голос/текст 24/7; специализированные: задачи цикла продаж; **Email-агент** в пилоте: персонализированный контент, суммаризация переписки, подсветка срочных возможностей). Обещание: Pulse GA весной 2025 [newsroom/businesswire].
- **Март:** AI-report creation в Insights [newsroom].
- **Ноябрь:** новые планы Lite/Growth/Premium/Ultimate (уже в июльском анализе); Sequences допилены (авто-подписи, smart auto-unenrollment, stop/skip, 250 лимит); quick filters с shareable URL; предупреждение о забытом вложении.
- **Декабрь:** pinned notes в mobile; bulk enrichment; hover-просмотр контактов сделки; управление participants из «…».

**2026 (только затрагивающее карточку/около):**
- **Январь–февраль:** participants ↔ email склейка (подсказки контактов, получатели → participants, participants из старых тредов); pinned/quick filters visibility.
- **Март:** отправленные письма автологируются как done-активности; task-level automations в Projects; data restoration (30-дневный откат bulk actions).
- **Апрель–май:** automations self-heal (алерты, автоотключение); Projects: field-level permissions, обязательные поля; Insights post-sale.
- **Июнь:** **MCP Server — данные Pipedrive в ChatGPT и Claude** [product updates]; управление видимостью скрытых активностей/заметок.
- **Июль:** **WhatsApp-интеграция** внутри Pipedrive; email sender control в automations; кастомизация полей активностей per-type (видимость + обязательность — сближение с нашими stage gates, но на уровне UI-валидации).
- Sales Assistant остаётся в beta; **AI win probability так и не появился**; Pulse feed официально rule-based.

**Ревизия мифов из ТЗ:** «авто-предложение следующей активности после Mark as done» — в текущей KB **не подтверждено** (сделки без next activity вместо этого всплывают в Pulse feed → Opportunities и в дефолтном сорте пайплайна); «AI-скоринг Pulse» — скоринг **rule-based custom criteria**, AI — только в email-фичах и ассистенте.

---

## 5. Топ-5 переносимых идей для dashboard-crm

1. **Триада Pulse-фида в TodayView: Follow-ups / Упущенные / Новые без шага + hide.**
   *Почему:* наш TodayView уже unified queue (сильнее Pipedrive), но одна лента смешивает «ответить сегодня», «протухло» и «новое без плана». Pipedrive доказал: три вкладки с counters читаются как рабочие очереди, и фид не требует ML — фикс-правила: «нет касания N дней», «просрочен next_action_date», «новая сделка без next_step».
   *Эскиз:* табы в `TodayView` с count-бейджами; правила поверх готовых `getDealHealth()`/`last_touch`; на карточке фида — quick actions (задача / шаг / открыть) через существующие мутации; `dismissed_suggestions (org_id, user_id, entity_id, rule, until)` для «скрыть до завтра». ~0.5 спринта.

2. **Вкладка «Изменения» (Changelog) на карточке сделки.**
   *Почему:* у Pipedrive полный field-level аудит — отдельной вкладкой, отсортирован по датам; у нас есть `stage_transitions` (078) и activity_log, но нет пользовательского UI «кто когда поменял бюджет/дедлайн/вероятность». Для команды 5–15 и споров «кто сдвинул дедлайн» — прямой ROI.
   *Эскиз:* generic-триггер AFTER UPDATE на whitelist полей сделки → `field_changes (org_id, entity, entity_id, field, old, new, changed_by, changed_at)`; вкладка в существующем табе Активность или отдельная; RLS org-first. ~0.7 спринта (миграция + UI-лента).

3. **«КП просмотрено» — tracked share link для quotes.**
   *Почему:* Smart Docs шлёт КП ссылкой на PDF и **уведомляет об открытии** — самый дешёвый buying-signal. У нас quotes уже имеют draft→sent→accepted→expired; между sent и accepted — слепая зона.
   *Эскиз:* публичный маршрут `/q/[token]` (без auth, токен в quotes), рендер КП; первый GET → `viewed_at`, счётчик просмотров; событие в timeline + сигнал в TodayView Follow-ups («КП открыто вчера — позвони»). Edge-функция не нужна, хватает route handler. ~0.4 спринта.

4. **Line items внутри КП с автосуммой в бюджет.**
   *Почему:* Pipedrive: сумма продуктов = deal value, weighted — от неё. Нам продуктовый каталог не нужен (июльский вывод в силе), но состав КП внедрения (лицензии 1С / работы по этапам / оборудование маркировки / поддержка) — это line items. Accept КП уже пишет бюджет — сумма должна складываться из позиций, а не вводиться руками.
   *Эскиз:* `quote_items (quote_id, name, qty, unit_price, discount_pct, kind: license|work|hardware|support)`; сумма — generated/derived; UI — таблица в существующем редакторе КП; accept → budget as is. Плюс отчёт «структура выручки по kind». ~0.6 спринта.

5. **Per-deal override вероятности (поверх стадийной).**
   *Почему:* правило Pipedrive «deal probability всегда перекрывает stage probability» — минимальная модель форкаст-категорий без отдельного справочника. У нас probability жёстко от стадии (и это правильно как дефолт), но «сделка на ранней стадии, устно согласована» и «поздняя, но конкурс» ломают weighted pipeline.
   *Эскиз:* `probability_override smallint null` на projects; `effective_probability = coalesce(override, stage.probability)` в weighted-суммах; UI — в кокпите рядом со стадийной, с явным бейджем «переопределено» и сбросом. Внимание: `probability` сейчас пишется триггером — override должен быть **отдельным полем**, не трогающим `trg_sync_deal_stage_fields`. ~0.3 спринта.

*Вне топа, но дёшево:* словарь lost reasons (§2.1); parent/daughter связи компаний (§2.10); hover cards стейкхолдеров (§2.9); «Show only filled fields» (§2.2).

---

## Источники

### Официальные KB (support.pipedrive.com, получено 2026-08-23)
- [Deal detail view](https://support.pipedrive.com/en/article/deal-detail-view)
- [Detail view](https://support.pipedrive.com/en/article/detail-view)
- [Detail view sidebar](https://support.pipedrive.com/en/article/detail-view-sidebar)
- [Updating items in the detail view](https://support.pipedrive.com/en/article/updating-items-in-the-detail-view)
- [Activities](https://support.pipedrive.com/en/article/activities)
- [Activity priority labels](https://support.pipedrive.com/en/article/activity-priority-labels)
- [Contextual view (beta)](https://support.pipedrive.com/en/article/contextual-view-activities-beta)
- [The Rotting feature](https://support.pipedrive.com/en/article/the-rotting-feature)
- [Lost reasons](https://support.pipedrive.com/en/article/lost-reasons)
- [Deal labels](https://support.pipedrive.com/en/article/deal-labels)
- [Email sync](https://support.pipedrive.com/en/article/email-sync)
- [Team Inbox](https://support.pipedrive.com/en/article/team-inbox)
- [AI email summarization](https://support.pipedrive.com/en/article/ai-email-summarization)
- [Pipedrive AI (обзор всех AI-фич)](https://support.pipedrive.com/en/article/pipedrive-ai)
- [Sales Assistant](https://support.pipedrive.com/en/article/sales-assistant)
- [Pulse](https://support.pipedrive.com/en/article/pulse)
- [Pulse feed](https://support.pipedrive.com/en/article/pulse-feed)
- [Sequences](https://support.pipedrive.com/en/article/sequences)
- [Products](https://support.pipedrive.com/en/article/products)
- [Probability in Pipedrive](https://support.pipedrive.com/en/article/probability-in-pipedrive)
- [The deal forecast view](https://support.pipedrive.com/en/article/the-forecast-view-revenue-projection)
- [Participants](https://support.pipedrive.com/en/article/participants)
- [Merge Duplicates](https://support.pipedrive.com/en/article/merge-duplicates)
- [Related organizations](https://support.pipedrive.com/en/article/related-organizations)
- [Scheduler](https://support.pipedrive.com/en/article/scheduler)
- [Smart Docs](https://support.pipedrive.com/en/article/smart-docs)
- [Quick actions in Pipedrive](https://support.pipedrive.com/en/article/quick-actions-in-pipedrive)

### Официальные Pipedrive (прочее)
- [Product updates (лента 2025–2026)](https://www.pipedrive.com/en/product-updates)
- [Newsroom: next-generation AI CRM with agentic experience (02.2025)](https://www.pipedrive.com/en/newsroom/pipedrive-unveils-next-generation-ai-crm-with-agentic-experience)
- [Newsroom: Pulse launch (09.2024)](https://www.pipedrive.com/en/newsroom/pipedrive-launches-smart-prospecting-toolkit-pulse-and-revamps-plans-to-help-businesses-focus-prioritize-and-grow)
- [Blog: Pipedrive Pulse](https://www.pipedrive.com/en/blog/pipedrive-pulse)
- [Blog: interface preferences](https://www.pipedrive.com/en/blog/interface-preferences)
- [Newsroom: AI-powered report creation (03.2025)](https://www.pipedrive.com/en/newsroom/pipedrive-introduces-ai-powered-report-creation-to-simplify-sales-insights)

### Третьи стороны
- [BusinessWire: Pulse (16.09.2024)](https://www.businesswire.com/news/home/20240916519835/en/Pipedrive-Strengthens-AI-Portfolio-With-the-Launch-of-Pipedrive-Pulse)
- [BusinessWire: Agentic CRM (04.02.2025)](https://www.businesswire.com/news/home/20250204946106/en/Pipedrive-Unveils-Next-Generation-AI-CRM-With-Agentic-Experience)
- [VentureBeat: Pulse](https://venturebeat.com/ai/pipedrive-brings-new-ai-powered-pulse-to-its-sales-crm)
- [Convention UI (дизайн-система, Figma community)](https://www.designsystemhunt.com/ds/Pipedrive-Convention-UI)
- [OpsDesigned: pipeline setup](https://www.opsdesigned.com/articles/setup-pipedrive-sales-pipeline)

### Связанные документы репозитория
- `improvements/CRMs/pipedrive-analysis-2026-07-12.md` — gap-матрица, приоритеты P0–P7 (остаются в силе; этот документ — микро-уровень deal card).
