# Ревью: S-R2-WEBHOOK-ACTION — вебхук как действие движка

**Дата:** 2026-07-30  
**Ревьюер:** Grok (верификация по коду `main` @ `16aaf93`, live `src/` + миграции 051/079/087/088/089 + `_analysis/arch-webhooks-2026-07-29.md` §3.2)  
**Объект:** `_analysis/sprint-S-R2-WEBHOOK-ACTION.md` — шестое `action_type='webhook'`, миграция **090**, `p_changes` в ядре  
**Контекст:** эпик B2 / R2-P2 спринт 4; транспорт 088+089 + edge `webhook-dispatch` (по тексту спринта — в проде и смоукнут); предыдущий слой — `send_test_webhook` only. `docs/schema.md` ещё пишет «089 не применена» — **stale** относительно claim'а спринта про live-доставку; на executable-часть 090 это не влияет, если gate видит 088/089 applied.

**Шкала:** 0–100; **≥ 85 = GO**. Любой открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА / факты сверху (task_overdue, overload) | ✅ |
| Номер миграции **090** (после 089, файл свободен) | ✅ |
| DROP 4-arg + 5-arg `wf_apply_project_action` (ловушка overload) | ✅ |
| Только 2 вызывающих планировщика (079) | ✅ |
| `run_overdue` hard-gate notify/create_activity (051:66-68) | ✅ |
| UI/Zod уже режут task_overdue (RuleEditor 227-230, 239-244; Zod 76-77) | ✅ |
| Ловушка `toInput` else → set_field (130-131) | ✅ названа, фикс верный |
| Контракт payload §3.2 + whitelist + `to_char` UTC | ✅ |
| Не звать `dispatch_webhooks_tick` из движка | ✅ |
| `useWebhookEndpoints(enabled)` / WebhooksSection текст | ✅ |
| Edge не трогать | ✅ |
| Самопроверка + смоук регресса 5 старых действий | ✅ |
| Сниппет webhook-цикла (declare / garbage uuid) | 🟡 |
| Unit-тесты `toInput` (сейчас private) | 🟡 |
| `docs/schema.md` / skill schema в deliverable | 🟡 |

**Оценка: 91/100 (GO).** Executable prompt: разведка сильная, главная ловушка Postgres (overload) и фронтовая (else set_field) закрыты явно; warnings не блокируют CC.  
- Порог передачи в Claude Code: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC на ветке `feat/r2-webhook-action` от `main` (`16aaf93`). Миграцию **не apply** из CC. Перед merge — gate-смоуки 7–13, особенно **#12 регресс движка**.

---

## Статус (репо)

| Заход | Статус в репо |
|-------|---------------|
| 088 transport | файл есть; schema.md — applied 2026-07-29 |
| 089 dispatch cron | файл есть; schema.md «не применена» vs спринт «прод смоукнут» — **сверить на gate** |
| edge `webhook-dispatch` | в репо (`supabase/functions/webhook-dispatch/**`) |
| `action_type` CHECK | 5 значений (079:26-27), `webhook` нет |
| `wf_apply_project_action` | 4-arg only (079:56-61); callers: `run_stage` :307, `run_dwell` :406 |
| `090_*.sql` | **нет** — слот свободен |
| Review-файл | не было (этот документ) |

---

## С чем согласен полностью

### 1. `task_overdue` + webhook сознательно out-of-scope

`run_overdue_automations` (051:66-68) **не** зовёт `wf_apply_project_action` и жёстко режет `action_type not in ('notify','create_activity')` **до** записи run — иначе no-op навсегда залочит расширение. UI/Zod уже зеркалят (RuleEditorModal filter + useEffect reset; automation-rule.ts:76-77). Добавлять webhook в overdue-фильтр **нельзя** — спринт правильно запрещает «доводить до единообразия».

### 2. Overload-ловушка `CREATE OR REPLACE` с новым параметром

Факт Postgres: 5-й параметр с `default` создаёт **вторую** сигнатуру → `function is not unique` на старых 4-arg вызовах. Обязательный `DROP FUNCTION … (uuid,uuid,uuid,text)` + перепись обоих планировщиков в **той же** 090 — критично и написано ясно. Откат: только дословный текст 079.

### 3. `p_changes` сверху, а не из re-read projects

`wf_apply` читает актуальную строку; OLD уже нет. Diff есть у `run_stage_automations` (`v_old`/`v_new` 079:236-237). Dwell → `null` (нет диффа по смыслу). Сбор `changes` только для `action_type = 'webhook'` — разумная экономия.

### 4. Очередь без синхронного тика

Массовый stage-update × N правил × endpoints не должен вызывать HTTP-диспетчер в транзакции UPDATE. `next_retry_at = now()` + минутный `webhook-retry` — согласовано с 088/089; тест оставляет немедленный тик.

### 5. Whitelist `data` + `occurred_at` UTC + budget в копейках

Закрытый список полей, резолв имён как 087:112-132, запрет `pinned_note`/`loss_*`/`do_*` — совпадает с arch §3.2 / §4.4. `to_char(… at time zone 'UTC', …)` — та же грабля, что 079/088.

### 6. Молчаливый skip мёртвых endpoint_ids

FK на jsonb нет; `e.org_id = pr.org_id AND e.is_active` — tenant + auto-disable после 20 fails. Org-bound критичен.

### 7. `delete_webhook_endpoint` чистит ссылки + деактивирует пустые правила

Иначе мёртвые uuid и «активные» no-op правила. Порядок относительно DELETE endpoint не важен (фильтр по `p_endpoint_id` и `org_id`).

### 8. Фронт: ветка `toInput` до `else`, хук, copy, WebhooksSection

Иначе webhook уедет в `{ field, value }` set_field и молча «создастся». `useWebhookEndpoints(enabled=…)` уже есть (хук:62). Текст «следующий спринт» (WebhooksSection:117-118) станет ложью — убрать обязательно.

### 9. Тесты: unit + gate, регресс 5 действий — главный смоук

Сигнатура ядра меняется: create_task / notify / create_activity / set_field / suggest_spawn обязаны выжить. Самопроверка `count(*) from pg_proc where proname=…` → 1 — must-have на gate.

---

## Блокеры (критично — исправить до запуска)

**Нет.**

---

## Предупреждения (желательно исправить)

### W1. Declare + scalar в цикле endpoint'ов

Сниппет `for v_ep in select e.id …` + `values (…, v_ep, …)` корректен **только если** в `declare` есть `v_ep uuid` (и `v_delivery_id uuid`). Без declare loop-var = record → `cannot cast record to uuid`. В 090 явно: расширить declare 079-тела.

### W2. «Мусор в endpoint_ids» vs bare `::uuid`

Edge-case table: мусор не роняет действие. Сниппет `(jsonb_array_elements_text(...))::uuid` на не-uuid **бросит** → outer `exception when others` правила съест ошибку **после** insert в `automation_runs` → навсегда no-op без delivery и без audit (audit после ветки). UI+Zod не пустят мусор; для заявленного контракта лучше membership по text:

```sql
and e.id::text in (
  select jsonb_array_elements_text(
    case when jsonb_typeof(r.action_config->'endpoint_ids') = 'array'
         then r.action_config->'endpoint_ids' else '[]'::jsonb end
  )
)
```

### W3. Unit-тесты `toInput` / `fromRule` — функции private

`toInput` / `fromRule` живут внутри `RuleEditorModal.tsx` (не export). Тесты 2, 3, 6 без extract/export не соберутся. Рекомендация в спринт/CC: вынести маппинг в `src/lib/domain/automation-rule-form.ts` (или export для tests) + `tests/unit/automation-webhook.test.ts` рядом с `webhook-transport.test.ts`.

### W4. `docs/schema.md` + skill schema

Конвенция проекта: schema в том же PR, что миграция. Спринт не ставит задачу явно. Нужно: `action_type` += `webhook`; сигнатура `wf_apply_project_action(…, p_changes jsonb default null)`; `webhook_event_name` / `build_deal_webhook_payload`; поведение `delete_webhook_endpoint` (чистка `endpoint_ids`); обновить «089 не применена», если gate уже applied.

### W5. ACL на 5-arg `wf_apply_project_action`

После `DROP` 4-arg гранты уходят. Повторить 079-паттерн:

```sql
revoke all on function public.wf_apply_project_action(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.wf_apply_project_action(uuid, uuid, uuid, text, jsonb)
  to service_role;
```

(и helpers — как в самопроверке §10).

### W6. Имя файла миграции

Зафиксировать `supabase/migrations/090_webhook_action.sql` (или `090_wf_webhook_action.sql`) — в тексте только «090».

### W7. Мелочи

- Комментарий `send_test_webhook` («единственный вход в очередь») станет неверным — обновить в 090 опционально.  
- Ссылка «Настройки → Вебхуки / Автоматизации»: обе секции на `/settings` без hash — достаточно plain text / scroll, не deep-link.  
- `WEBHOOK_EVENT_BY_TRIGGER` + `task_overdue → 'task.overdue'` (arch) для полноты Record — как в спринте, OK.  
- Line numbers почти точны (RuleEditor 227–230 vs «228-230»; Webhooks 115–118).

---

## Пропущенные места (grep)

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `079_wf_dwell.sql` | `wf_apply` 56–203; calls 307, 406 | Переписать с 5-arg + changes; **единственные** callers |
| `051_task_overdue.sql` | 66–68 hard gate | **Не трогать** |
| `088_webhook_transport.sql` | `delete_webhook_endpoint` 372–399; deliveries schema 118–139 | Расширить delete; insert shape OK |
| `089_webhook_dispatch_cron.sql` | `dispatch_webhooks_tick` | Не звать из 090 |
| `RuleEditorModal.tsx` | toInput 115–132; actionOptions 227–230; overdue reset 239–244 | webhook-ветка + UI |
| `automation-rule.ts` | enum 43–45; overdue 76–77 | +webhook + a_endpoint_ids refine |
| `database.ts` | ActionType 306–307; ActionConfig 384–389 | +webhook types + event map |
| `automation.ts` | OPTIONS 62–68 | +«Отправить вебхук» |
| `AutomationsSection.tsx` | describeAction 66–91 | case webhook (иначе exhaustiveness TS) |
| `WebhooksSection.tsx` | 115–118 | заменить copy |
| `use-webhook-endpoints.ts` | `enabled` param | reuse |
| `supabase/functions/**` | | **git diff пуст** (самопроверка 12) |
| `tests/unit/` | нет automation-rule form tests | завести (W3) |

Пропусков файлов относительно scope спринта **нет**.

---

## Предлагаемые правки в спринт (необязательно до CC)

1. В §4 цикла: declare `v_ep uuid; v_delivery_id uuid` + safe text-membership (W1/W2).  
2. В HOW-фронт: «вынести `toInput`/`fromRule` в domain-модуль ради unit-тестов» + путь `tests/unit/…`.  
3. В VERIFY: `docs/schema.md` + копия skill schema.  
4. В §4/ACL: явный revoke/grant 5-arg `wf_apply`.  
5. Имя файла `090_webhook_action.sql`.

CC может закрыть W1–W5 без правки markdown — если держит самопроверку.

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА перед правками  
- [x] Реальные table/column/RPC (079/088; новые — named in 090)  
- [x] Реальные пути UI/hooks  
- [x] learnings: `to_char` UTC, `wf.ran`, set_field whitelist, hard delete CASCADE  
- [x] Миграция файлом, **не apply** из CC  
- [x] org boundary на endpoint select (`e.org_id = pr.org_id`)  
- [x] DEFINER + `search_path = public, pg_temp` + ACL service_role  
- [x] Нет `flowType: 'implicit'`  
- [x] DELETE endpoint: cascade deliveries; rules cleanup explicit  
- [x] CSS variables / no new theme colors  
- [ ] schema.md в том же PR — **дописать в VERIFY** (W4)

---

## Чеклист перед CC

- [ ] Ветка `feat/r2-webhook-action` от `main` @ `16aaf93`  
- [ ] На gate: 088 **и** 089 applied, edge `webhook-dispatch` live (иначе automation enqueue без доставки)  
- [ ] 090: DROP 4-arg → create 5-arg → rewrite both planners → extend delete  
- [ ] `pg_proc` count `wf_apply_project_action` = 1  
- [ ] Unit 1–6 (+ extract toInput)  
- [ ] Gate smokes 7–13; **#12 регресс пятёрки** обязателен  
- [ ] `tsc` / `test` / `lint` (полная цифра) / `build` last  
- [ ] `docs/schema.md` + skill refs  
- [ ] Коммит message как в спринте  
- [ ] Edge `git diff` пуст  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Разведка и scope honesty | 20 | 20 |
| SQL / engine design (overload, queue, ACL) | 30 | 27 |
| Frontend wiring + traps | 20 | 19 |
| Tests / gate / self-check | 15 | 14 |
| Process (schema, filename, ops 089) | 15 | 11 |
| **Итого** | **100** | **91** |

**Итог: 91/100 GO** — можно в Claude Code.
