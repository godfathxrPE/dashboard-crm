# Ревью: CRM-ROADMAP-2-ARCHITECTURE.md

**Дата:** 2026-07-26 · **Ревьюер:** Claude (Cowork) · **По брифу:** §0 архитектурного документа
**Метод:** сверка с живым кодом (`docs/schema.md`, baseline `20260712230000`, миграции 040–075, `src/`), не по памяти.

**Вердикт:** архитектура принимается с правками. Инварианты I1–I8 не нарушены, слои и границы модулей корректны, фазировка здравая. Найдены: 1 блокер механики P0-A, 1 срочный перенос из P2 в P0, ряд средних правок. После правок — старт R2-P0.

---

## 1. Findings (по убыванию severity)

### 🔴 F1. Gate не видит During-inputs в том же UPDATE — ломает контракт commitTransition

`check_stage_requirements` (baseline:271) делает `SELECT * INTO v_project FROM projects WHERE id = p_project_id`. Вызов идёт из `aa_enforce_stage_gate` — **BEFORE UPDATE** триггера (baseline:110), т.е. функция читает **pre-update** строку.

Следствие: основной сценарий модалки — гейт требует `budget`, пользователь заполняет его в During-поле, `commitTransition` шлёт `update({ stage_id: B, budget: X })` одним запросом (§3.1.3: «commit = single projects.update») — **гейт увидит старый NULL budget и отклонит переход**, хотя патч его закрывает.

**Фикс (рекомендуемый):** миграция — третий параметр `check_stage_requirements(p_project_id, p_target_stage_id, p_row jsonb default null)`; при `p_row is not null` field-проверки идут по нему; `aa_enforce_stage_gate` передаёт `to_jsonb(NEW)`. Default null сохраняет обратную совместимость RPC-поверхности (`useStageGate` preview). File-требования продолжают читать `project_files` из БД — корректно, файлы в том же UPDATE не приходят.

**Альтернатива без миграции** — двухшаговый commit (сначала patch полей, потом stage_id) — хуже: неатомарно, второй запрос может упасть после первого (поля применены, стадия старая), плюс два прохода automation-триггера по `field_changed`.

⇒ P0-A перестаёт быть «Schema changes: none» (§3.1.8) — в спринт входит миграция (только `create or replace function`, DDL таблиц нет, откат тривиален).

### 🔴 F2. История смен стадий сейчас не пишется вообще — stage_transitions переносится из P2 в P0

Миграция 047 сняла `on_stage_change`/`log_stage_change` вместе с legacy `projects.stage` (schema.md:566). Baseline их ещё содержит, но в проде они удалены. Нового триггера на `stage_id` нет — activity_log stage-события не получает.

Следствия:
- P2-E (конверсия стадий, median dwell) не посчитается задним числом — источника нет;
- метрика P0 «% переходов через Transition Modal» (§3.7, roadmap §10) неизмерима.

**Фикс:** таблицу `stage_transitions` + AFTER UPDATE OF stage_id trigger (дизайн §5.5 корректен) добавить в миграционную волну **P0-A**, не P2. Аддитивно, дёшево, данные копятся с первого дня — аналитике P2 нужна история за месяцы, каждый месяц отсрочки = дыра в данных. Вопрос §14.4 закрыт: activity_log недостаточен, таблица обязательна.

### 🟡 F3. §1.3 — список entry points неполный

Grep по живому коду: `stage_id` пишут также:
- `ProjectDetail.tsx` ~448 — «Вернуть в работу» (reopen на первую стадию, сброс won/loss reasons);
- `ProjectDetail.tsx` ~555 — lost-кнопки (stage_id + loss_reason одним mutate);
- won-путь двухшаговой «Выиграна» (043) — там же.

Если их не завести в `transitionDealStage`, acceptance-критерий «все интерактивные смены через модалку» не выполняется, а A5 (won/lost reason в едином моменте перехода) остаётся разрозненным. В спринт-файле S-R2-TRANSITION-1 — полный grep-список write sites как чек-лист.

Отдельно зафиксировать: `DeliveryPipelineBoard`/`StageBoard` (delivery-стадии) — **вне скоупа** модалки (она для `type=client`); reopen — решить, идёт ли через модалку (гейт первой стадии обычно пуст, но reason-сброс — тоже transition-семантика; предлагаю да, через модалку с предзаполнением).

### 🟡 F4. Q1 закрыт: pipelines/pipeline_stages — глобальные словари → `rotting_days` колонкой отпадает

schema.md:204, 326: глобальные справочники вне тенант-модели, DDL вне миграций, RLS — read-only словари (`USING true`). Колонка `pipeline_stages.rotting_days` была бы кросс-org и без write-политики для UI. **`stage_dwell_overrides` (org_id, stage_id) — обязательна**, «preferred»-вариант §4.2 снимается. Дефолты — в `organizations.settings.stage_dwell_defaults`, как и спроектировано.

### 🟡 F5. Seed-сегмент «Без next_step» требует OR при AND-only predicate v1

§3.2.5: `next_step is_null OR next_action_date is_null` — противоречит §3.2.4 (`and: SegmentClause[]`, «OR = later»). Дешёвое решение: два сид-сегмента («Без next_step», «Без даты действия») либо один по `next_step is_null`. OR-группы в v1 не тащить.

### 🟡 F6. SDP: `ai_runs.transcript_id` NOT NULL

schema.md:472+: `transcript_id uuid NOT NULL → transcripts`. Прогон `deal_progression` по звонку/встрече **без транскрипта** (только заметки) в журнал не запишется. Решить в спринте C: v1 — SDP доступен только при наличии transcript (без DDL, кнопка disabled с подсказкой); либо миграция nullable + CHECK по preset_key. Рекомендую v1 без DDL — SDP по пустым заметкам всё равно бесполезен.

### 🟡 F7. Sign-off: `checked_by`/`checked_at` внутри jsonb — самодекларируемый аудит

Любой manager с UPDATE на `project_checklists` может переписать чужие отметки и历史. Для sign-off смысл — accountability. Дешёвый фикс: DEFINER RPC `toggle_checklist_item(checklist_id, item_key, checked)` — штампует `auth.uid()`/`now()` серверно, прямой UPDATE items у не-админов закрыт политикой. Решить при проектировании S-R2-SIGNOFF-1 (P1), в P0 не влияет.

### 🟢 F8. RLS сегментов — прописать WITH CHECK против эскалации

Политика INSERT/UPDATE должна явно запрещать manager'у создать `is_shared=true` или перевести личный сегмент в shared: `WITH CHECK ((is_shared = false AND owner_id = auth.uid()) OR (is_shared = true AND current_org_role() IN ('owner','admin')))` + org_id freeze по существующему паттерну. В §3.2.3 это описано словами — в миграции сделать буквально.

### 🟢 F9. Org settings: UPDATE organizations = owner-only (проверено: `org_update_owner`, baseline:3517 + 054)

Настройки правит только owner. Для v1 — принять и задокументировать, политику ради admin не расширять (Q из §3.4.3 закрыт). Клоббер ключей при записи целого jsonb: ключей мало, принять last-write-wins v1, но в hook писать merge (`...current, key: value`), не литерал.

### 🟢 F10. Импорт localStorage saved-views → personal segments нереален как заявлен

`use-saved-views` хранит `{route, query}` — URL-снапшот; segments — predicate AST. Автоконвертация query-string → AST не окупается. Выкинуть импорт из скоупа (§3.2.6), сид покрывает основные виды; личные пересоздадут руками.

### 🟢 F11. `segment_user_state` — YAGNI в P0

5 сид-сегментов, команда 5–15: pin/hide/last_used — преждевременно. Убрать из P0-миграции, добавить по запросу пользователей. Упрощает P0 (§0.6 брифа — «предложить упрощения»).

### 🟢 F12. Мелочи

- ~~Шапка: «Vercel» → Netlify~~ — **снято, моя ошибка.** Проверено: `_analysis/sprint-w4-speed-order.md` фиксирует «деплой теперь Vercel (`dashboard-crm-ten.vercel.app`, auto из main)», `netlify.toml` — реликт для отката (последняя правка — W1-security), `.netlify/` от 30 марта. **Шапка архдока верна.** Отдельно: твои standing instructions и user preferences говорят «деплой Netlify» — это устаревшая запись, стоит поправить у себя, иначе каждая новая сессия будет спорить с реальностью.
- Нумерация: резерв 060 под `contact_last_touch` устарел — после 075 идти строго 076+ (возврат к 060 ломает порядок применения).
- `wf_eval_conditions` TS-зеркало: дрейф-риск признан в §3.1.7/§13 — добавить в спринт golden-тесты (одни фикстуры на SQL и TS), иначе preview начнёт врать молча.
- CHECK-расширения (`automation_rules`, `notifications.type`): откат требует зачистки строк с новыми значениями до re-narrow — отметить в тексте миграции.

---

## 2. По пунктам брифа

1. **Консистентность** — высокая. Проверено по коду: I1–I8 целы; set_field whitelist 050 = I7 дословно; idempotency `trigger_key` + unique(rule_id, project_id, trigger_key) и EXCEPTION-swallow (I5) подтверждены; saved-views localStorage подтверждён; won/loss поля есть (043) — P0-A без DDL был бы верен, если бы не F1; `ai_runs.result` jsonb есть — хранение proposal без новой таблицы корректно (с оговоркой F6); статус-синк от is_won/is_lost флагов подтверждён — решение «не дуал-райтить status в модалке» (§3.1.6) верное.
2. **Over/under-engineering** — segments right-sized (whitelist + AND + client eval); RI формула — ок, pure client v1 правильный; DO sync корректно отложен и правильно read-only; webhooks (trigger → queue-таблица → edge worker) — правильный выбор из трёх. Раздутость: F10, F11.
3. **RLS/multi-tenant** — шаблон §2.3 соответствует живым паттернам (проверено 053/059). Правки: F8, F9. `segment_user_state` (если вернётся) — EXISTS-проверка «segment в моей org», не только profile_id.
4. **Миграции** — порядок P0 (settings → segments → automation CHECKs → notifications) верный, всё аддитивно и обратимо; дополнение: волна P0-A получает миграцию 076+ (gate p_row fix + stage_transitions). Оговорка об откате CHECK — F12.
5. **Missing invariants / races**:
   - SDP double-apply: повторный клик = дубли задач. Disable кнопки после submit + идемпотентность на клиенте (applied-флаг в ai_runs.result или activity_log-проверка).
   - SDP staleness: сделка изменена между proposal и apply → apply затирает свежий `next_step`. Сравнивать `projects.updated_at` со снапшотом proposal, при расхождении — warning в панели.
   - Гонка модалки (два таба) — покрыта (DB SoT, re-fetch на submit) — ок.
   - dwell `trigger_key = stage_id@stage_entered_at` (once per stay) — корректно; смена `min_days` правила не даст повторного срабатывания на том же stay — принять и задокументировать.
   - cron-контекст: `auth.uid()` NULL — actor-fallback по образцу 051 в `run_dwell_automations`.
6. **Упрощения** — F5, F10, F11; остальное по размеру.

---

## 3. Ответы на открытые вопросы (§14)

| # | Ответ |
|---|-------|
| 1 | Глобальные словари (проверено) → `stage_dwell_overrides` обязательна, колонка отпадает (F4) |
| 2 | Client eval — да. Сотни сделок при команде 5–15; порог ~5k задокументировать, RPC — P4 |
| 3 | Нет, RPC остаётся P4. Но миграция гейта из F1 нужна в P0 в любом случае — RPC позже ляжет поверх неё дёшево |
| 4 | `stage_transitions` обязательна и переносится в **P0** — история не пишется с 047 (F2) |
| 5 | `user_settings.triage` jsonb — таблица персональная по замыслу, паттерн совпадает. Новую таблицу не заводить; `profiles.settings` не трогать |
| 6 | Tasks-only. Дуальное состояние checks-on-project — отклонить |
| 7 | stage_id в SDP запрещён до конца P2 включительно. AI может упомянуть стадию текстом в summary |
| 8 | Poll из Edge в 1С за NAT/VPN нереален — рабочий паттерн: регламентное задание на стороне 1С пушит в Edge endpoint (HTTPS + shared secret + idempotency key). Детализировать на go P3-A |
| 9 | Notification достаточно: deep link в SpawnWizard, ноль шума в задачах, без assignee-логики. Task не делать |
| 10 | Конфликтов нет: волна Ганта UI-only, миграций после 075 нет. Но `main` не запушен — запушить до старта R2 |

---

## 4. Решение по первой фазе

**Фаза: R2-P0 «Process feel»** — без колебаний, как и рекомендует roadmap §13.2. Ценность/риск лучшие по программе, всё аддитивно, ядро не трогается.

**Порядок спринтов (правка к §3.6 с учётом F1/F2):**

| # | Спринт | Состав | Миграции |
|---|--------|--------|----------|
| 1 | **S-R2-SEGMENTS-1** | P0-D + P0-B: `organizations.settings` (reconnect_days + dwell defaults) + `segments` + сид (F5: AND-only) + SegmentsBar + consumers reconnect_days | 076, 077 — аддитивные, низкий риск |
| 2 | **S-R2-TRANSITION-1** | P0-A + F1-фикс (`check_stage_requirements` p_row) + F2 (`stage_transitions` + trigger) + полный обход entry points (F3) | 078 — function replace + новая таблица |
| 3 | **S-R2-WF-SDP** | P0-E (days_in_stage + suggest_spawn) + P0-C (SDP HITL; F6 — v1 только при транскрипте) | 079 — CHECK expand + cron |

Почему Segments первым, а не флагманский Modal: спринт 1 — чисто аддитивный и независимый, даёт команде видимую ценность сразу; Transition вырос (миграция функции гейта + stage_transitions + обход всех write sites) и заслуживает отдельного спринта без спешки; за время спринта 1 дизайн F1-фикса пройдёт гейт спокойно. C параллелить с A можно, если будет запас.

Оценка P0 остаётся ~2.5 спринта: срезы F10/F11 компенсируют добавку F1/F2.

**Перед стартом:** запушить `main`; поправить память `crm-architect` (хвост из handoff — стартовать новые сессии на ложных вводных нельзя); Vercel→Netlify в шапке архдока.

---

## 5. Verification

```
Консистентность с кодом:  PASS (сверено с baseline, 040–075, docs/schema.md, src/)
RLS Coverage (ревью):     PASS (шаблон соответствует живым паттернам; правки F8/F9)
Runtime Tested:           NOT_VERIFIED (код не исполнялся — ревью документа)
Regional Availability:    NOT_APPLICABLE
```
