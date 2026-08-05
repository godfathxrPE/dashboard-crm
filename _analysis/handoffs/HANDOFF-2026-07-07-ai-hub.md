# HANDOFF — сессия 2026-07-07: AI Hub (S-AI-1) от концепта до прода

Контекст на входе: гейт-хвосты S29/S29.1 закрыты, фаза 1 + гейты S27 + AI-инфра S28
(ждала кредитов) + автоматизация S29. Вопрос сессии: «насколько реально сделать AI-блок
в CRM (протокол по транскрипту, SPIN-разбор, преднастроенные промпты)».
Ответ: сделано и работает на проде за одну сессию.

---

## СДЕЛАНО

### 1. Концепт AI Hub → `AI-HUB-CONCEPT.md` (в корне репо)
Ключевые решения (§ соответствуют доку):
- Не «чат», а библиотека пресетов: типизированный вход → фикс. промпт → structured output → артефакт в CRM.
- Промпты в коде edge-функции, НЕ в БД (§2) — security-контур S28, версионирование в git.
- `transcripts` — отдельная сущность (1 транскрипт → N прогонов), PII-контур, retention 90 дней (§3.1).
- `ai_runs` — журнал по паттерну automation_runs: статусы, токены, rating+feedback_note (§3.2).
- «AI предлагает — юзер подтверждает»: action items → задачи только через подтверждение (§4.1).
- Async: EdgeRuntime.waitUntil + Realtime; идемпотентность (transcript_id, preset_key) (§5).
- §10 — три вопроса скоупа решены (paste-текст; RLS по сущности; без транскрипта = ai_summary S28).
- §11 — отклонённые предложения с обоснованием (prompt caching между пресетами не работает
  из-за префикс-кэша tools→system→messages; вместо мульти-агентной валидации — {claim, quote}).

### 2. Sprint prompt → `_analysis/sprint-ai-1-ai-hub.md`
Написан CC, отревьюен здесь. Внесённые правки (важно знать, они в файле):
- Анти-залипание зомби-прогонов: CAS-реклейм (условный UPDATE WHERE status IN (...)),
  STALE_RUN_MINUTES=10 — иначе убитый по wall-clock isolate навсегда блокировал пару.
- {claim, quote} в схеме analytic_note (анти-галлюцинация).
- feedback_note в ai_runs; модель через env (AI_RUN_MODEL_SONNET/HAIKU); chars/2.5 для
  кириллицы в оценке цены; текущая дата в преамбуле промпта (для «к пятнице» → ISO).
- Injection-гейт: 5-й пункт — смягчение форс-цитаты до «цитата ИЛИ пересказ с пометкой»,
  только если роняет валидные пункты.

### 3. Гейт-хвосты S28 закрыты (были блокером)
- Кредиты Anthropic пополнены, S28 ожил.
- Негативные HTTP-смоки: `_analysis/smoke-s28-negative.sh` — 6/6 PASS.
  Кейс user+nonexistent→404 SKIP (нужен USER_JWT — при e2e-инвайте).
- Injection-тест: `_analysis/injection-test-s28.md` — 6/6 PASS (включая тест 6 на
  false positive: цитата клиента «игнорируйте договорённости» обработана как данные).
- BACKLOG.md актуализирован: блокеры-ожидания пусты.

### 4. S-AI-1 реализован (CC) и применён на прод (гейт Cowork)
- Миграция 030 (transcripts + ai_runs, RLS «по сущности» через EXISTS, partial unique
  index, realtime) — применена через MCP apply_migration → в history (028/029 там нет,
  применялись руками; фактическое состояние схемы сверено).
- Edge `ai-run` задеплоена (verify_jwt=true). Гейт-фикс: дефолт модели
  claude-sonnet-4-6 → **claude-sonnet-5** (сверено с docs 2026-07-07; intro-цена $2/$10
  до 31.08.2026). Смена модели — через env, без редеплоя.
- Advisors: security — прежний by-design набор; performance — initplan-WARN на новых
  policies НЕТ (обёртки сработали), остальное INFO-шум.
- Смок на живом звонке: транскрипт 3240 симв. → аналитическая записка с цитатами-основаниями
  в потребностях/рисках. Работает. UI: AiRunPanel в CallModal/MeetingModal, кнопки
  пресетов с оценкой «≈ N ₽», лента прогонов, 👍/👎, «Применить» для next step.
- Расхождение в ходе спринта (решено): у TaskModal не было defaultValues → расширен
  пропами defaultText?/defaultDeadline? по образцу default*Id (вариант 1 из анкеты CC).

### 5. Попутные фиксы
- Скролл модалок: CallModal/MeetingModal — max-h-[85vh] + overflow-y-auto
  (AI-контент сделал модалки выше вьюпорта). Закоммичено.
- `_analysis/` взята под git (была untracked — история 7 спринтов жила без версионирования).
- `.gitignore`: .~lock.*# (мусор LibreOffice).

### 6. Документация и память синхронизированы (CC, коммит 76b960f)
- docs/schema.md: 030 в 5 местах, счётчик tenant-таблиц 14→16.
- Скилл crm-architect (~/.claude): schema.md (030 + исправлен pending→applied для 028/029),
  architecture.md (секция AI Hub + ИСПРАВЛЕНЫ пути модалок — они в фиче-папках
  calls/, meetings/, tasks/, НЕ в components/modals/), learnings.md (2 урока).
- Память проекта CC: ai-hub-s-ai-1 → applied, modal-file-locations, индекс.

### 7. Оценка следующих спринтов → `_analysis/estimate-contact-hub.md`
Contact Hub по образцу HubSpot (скрины смотрели в сессии):
- Спринт A — Contact Hub: unified timeline (6 источников) + связи + key-info, 0 AI, ~0.7.
- Спринт B — Contact AI-роллапы: пресеты contact_digest/contact_health, КЭШ вместо
  живой генерации (иначе 50 контактов/день × 5 прогонов = разорение), ~0.5.
- Порядок: A → B → Telegram. Tickets/Payments/«Ask a question»/inbound-outbound — за скоупом.
- Поправки к оценке (проговорены в чате, В ФАЙЛ НЕ ВНЕСЕНЫ — учесть в sprint prompt A):
  1) хуки тянут весь org-набор с клиентской фильтрацией — для timeline нужны
     per-entity запросы (.eq('contact_id', id));
  2) activity_log привязан к project_id — в timeline контакта попадает через join
     по связанным проектам, это больше чем «адаптер»;
  3) оценки 0.7/0.5 — ESTIMATED, разброс A: 0.5–1.0.

---

## НЕ ЗАВЕРШЕНО (по убыванию срочности)

1. **👎 + feedback_note не проверены в UI** — последний непроверенный кусок MVP S-AI-1.
   30 секунд: поставить 👎 на прогоне, убедиться что поле «что не так» появляется и пишется.
2. **Решение по `<EntityTimeline>`** — переиспользуемый (контакт+компания+сделка,
   +0.1 к спринту A, рекомендовано) или точечно контакт. Блокирует sprint prompt спринта A.
3. **Sprint prompt спринта A (Contact Hub)** — после решения по п.2, через crm-architect,
   с тремя поправками из §7.
4. **Скоркарта** — AI-ноль закрыт на 100% (S28 + S-AI-1), обновить CRM-scorecard.xlsx.
5. Хвосты BACKLOG.md (спокойные, не блокируют):
   - real e2e инвайта вторым аккаунтом (+ кейс 404 в smoke-s28-negative.sh с USER_JWT);
   - legacy-читатели projects.stage → stage_id (список файлов в BACKLOG);
   - полный вынос колонки stage (после читателей);
   - meetings.description не попадает в AI-контекст (минорно).
6. **Отложено осознанно** (зафиксировано в концепте §9 / оценке):
   - S-AI-2: файл-upload транскриптов (VTT-парсер спикеров), страница /ai, docx-экспорт
     протокола (через protocol-design-is), follow-up-пресет, retention-cron;
   - S-AI-3: entity-пресеты (подготовка к звонку), извлечение полей с diff-превью,
     квоты, org_ai_settings.extra_context;
   - Спринт B (Contact AI) — гейт ценности: смотреть feedback_note, пользуются ли
     пресетами S-AI-1, прежде чем строить.

## Развилка приоритетов (моя рекомендация из сессии)

Спринт A (Contact Hub) → при живом использовании пресетов → B → S30 Telegram.
S31 Cmd+K — кандидат на передышку в любом месте цепочки: S-AI-1 был пятым тяжёлым
спринтом подряд. Telegram остаётся последним функциональным нулём скоркарты.

## Артефакты сессии (все в репо)

| Файл | Что |
|---|---|
| `AI-HUB-CONCEPT.md` | Концепт-первоисточник AI Hub |
| `_analysis/sprint-ai-1-ai-hub.md` | Sprint prompt S-AI-1 (исполнен) |
| `_analysis/injection-test-s28.md` | Гейт-артефакт: 6/6 PASS |
| `_analysis/smoke-s28-negative.sh` | Переиспользуемый смок (адаптировать под ai-run) |
| `_analysis/estimate-contact-hub.md` | Оценка спринтов A/B (+3 поправки из §7 выше) |
| `_analysis/BACKLOG.md` | Актуализирован 2026-07-07 |
| `docs/schema.md` | 030 задокументирована |
