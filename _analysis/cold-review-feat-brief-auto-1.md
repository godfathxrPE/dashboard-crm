# Cold review: feat/brief-auto-1

**Дата:** 2026-10-03  
**Ревьюер:** Grok (cold — без спринт-файла)  
**Дифф:** `main...feat/brief-auto-1`, 10 файлов, +1220/−1 строк  
**Acceptance:** автозапуск брифа компании по трём триггерам в рабочие часы МСК, с лимитами org/тик/компания, узкой веткой `ai-run` по ключу и прежним ручным путём.

В `--stat` есть `_analysis/sprint-S-BRIEF-IN-DEAL-1.1.md` (+531). По правилу холодного ревью файл не читался.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Поведение соответствует acceptance | ✅ |
| Регрессы | ✅ |
| Доступ и RLS | ✅ |
| Гонки и атомарность | ✅ |
| Edge cases | ✅ |

**Оценка: 90/100 (MERGE).** Код делает заявленное: очередь, лимиты, страж `auto_reason`, CAS-диспетчер и молчаливый выход без Vault; ручной путь `ai-run` при отсутствии `X-Dispatch-Key` совпадает с прежним.

---

## Находки

Находок нет.

---

## Что проверил и счёл верным

- Триггеры кандидатов: открытая сделка `type='client' and status='open'`, `no_brief` / `stage` (`phase_group='working'`, без имён стадий) / `stale` 90 дней; порядок очереди `stage` → `no_brief` → `stale`.
- Лимиты: 10/сутки МСК через `brief_auto_day_start()`, `brief_auto_daily_limit` (`^\d+$`, `0` выключает, нецелое → 10), `least(2, остаток)` за тик на org; ручной прогон `auto_reason IS NULL` лимит не ест.
- На компанию: активный `pending`/`running` (зеркало `ux_ai_runs_active_entity`), пауза 45 мин после `error`, `< 2` автопопыток за сутки МСК.
- Реклейм зависших автопрогонов `pending`/`running` старше 15 мин — до проверки кандидатов, только `auto_reason IS NOT NULL`; ручные строки не трогает.
- Страж `trg_ai_runs_auto_reason_guard`: при `auth.uid() IS NOT NULL` нельзя поставить, снять или сменить `auto_reason` (42501). Тик и service-контекст (`uid` пуст) могут писать признак. CHECK сужает значения до брифа компании.
- ACL: `brief_auto_tick` / `company_brief_candidates` / помощники — только `service_role`; `company_brief_auto_state` — `authenticated` + `service_role`, org-first `(select current_org_id())`, чужая/нет компании → 0 строк.
- Тик без Vault: секреты `NULL` → `return` после реклейма, без INSERT и без HTTP. Исключений нет — сбой виден в `cron.job_run_details` (в отличие от `telegram_send_tick`).
- Крон `'40 5-16 * * *'` UTC = 08:40–19:40 МСК, 12 тиков. `pg_advisory_xact_lock` сериализует тики; `unique_violation` глотается точечно.
- `ai-run`: `X-Dispatch-Key` без верного/`BRIEF_AUTO_KEY` → 401 до разбора тела. С ключом — только `{ run_id }`, строка `company_brief` + `entity_type=company` + `auto_reason` + `pending`, CAS `pending→running`, повтор → 409, `processRun` в `waitUntil`. Org/автор/сущность из тела не читаются.
- Пользовательский путь: `useStartRun` шлёт `{ preset_key, entity_type, entity_id }` без `X-Dispatch-Key`; INSERT в edge без `auto_reason`. Перехват диспетчера срабатывает только при наличии заголовка.
- `trg_set_org_id` заполняет `org_id` только при NULL — явный `org_id` тика сохраняется в service-контексте (`current_org_id()` там NULL).
- Юниты: разбор тела (лишние ключи игнорятся), `checkAutoRun` (порядок кодов), `timingSafeEqual`.

---

## Чего не смог проверить

- Применение 138, крон `brief-auto` и доступ `vault.decrypted_secrets` / `net.http_post` из `brief_auto_tick` на живой БД.
- Сквозной вызов pg_net → шлюз `ai-run` (`verify_jwt = true`) с заголовками тика (Authorization JWT + `X-Dispatch-Key`, без `apikey`). В репозитории pg_net до сих пор звал только `verify_jwt = false` функции. Официальные примеры для JWT-шлюза обходятся Bearer-JWT; живой 401 Kong это не снимает.
- Ролевые смоки: INSERT с `auto_reason` под JWT, RPC `company_brief_auto_state` на чужой/своей компании, прямой `rpc('brief_auto_tick')` под `authenticated`.
- Что `processRun` с сервисным клиентом на реальном `company_brief` (веб-поиск) укладывается в 15 минут до реклейма; в коде финальный UPDATE не CAS-ит статус `running`.
- Совпадение `BRIEF_AUTO_KEY` (Function Secret) с Vault `brief_auto_key` и пригодность `brief_auto_jwt` как легаси-JWT шлюза — заводит владелец, в диффе секретов нет.
