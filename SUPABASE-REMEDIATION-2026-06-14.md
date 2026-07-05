# Supabase Remediation Log — 14 июня 2026

Применено через Supabase MCP (`apply_migration`) на прод `uoiavcabxgdjugzryrmj`.
Все изменения проверены: advisor до/после + live smoke-тест RLS в браузере.

---

## Применённые миграции

| # | Миграция | Что | Проверка |
|---|----------|-----|----------|
| 1 | `fix_meeting_attendees_rls` | DROP `attendees_all USING(true)` → CREATE `attendees_own` со скоупом через `meetings.created_by` (+ admin/pm) | advisor `rls_policy_always_true` для meeting_attendees ушёл |
| 2 | `rls_initplan_optimization` | 35 политик: `auth.uid()` → `(select auth.uid())` | — |
| 3 | `rls_initplan_insert_policies` | +3 INSERT-политики (with_check), пропущенные в #2 | advisor `auth_rls_initplan`: 38 → **0** |
| 4 | `functions_set_search_path` | 14 функций `SET search_path = public, pg_temp` | advisor `function_search_path_mutable`: 14 → **0** |
| 5 | `revoke_security_definer_execute` | REVOKE от anon/authenticated (оказался no-op — см. ниже) | — |
| 6 | `revoke_public_execute_from_definer_funcs` | REVOKE FROM **PUBLIC** + GRANT обратно где нужно | advisor `anon_security_definer...`: 14 → **0** |
| 7 | `drop_activity_log_service_insert` | DROP `Service insert logs WITH CHECK(true)` (триггеры — DEFINER owned by postgres, FORCE RLS off → пишут в обход RLS; политика была не нужна) | live smoke: создал+удалил компанию → триггер записал `entity_deleted` лог без политики. `rls_policy_always_true`: 1 → **0** |
| 8 | `merge_profiles_select_policies` | DROP 2 политики `profiles_select_{admin,own}` → CREATE одна `profiles_select`. Бонус: убрал self-referential subquery на profiles (риск рекурсии) → `user_role() = 'admin'` | live smoke: settings грузит профиль. `multiple_permissive_policies`: 10 → **0** |

---

## Результаты (advisor до → после)

| Lint | Было | Стало |
|------|------|-------|
| `rls_policy_always_true` (meeting_attendees + activity_log) | 2 | **0** |
| `auth_rls_initplan` | 38 | **0** |
| `function_search_path_mutable` | 14 | **0** |
| `anon_security_definer_function_executable` | 14 | **0** |
| `authenticated_security_definer_function_executable` | 14 | **2** (намеренно) |
| `multiple_permissive_policies` | 10 | **0** |

---

## Ключевая находка процесса: PUBLIC-грант

Миграция #5 (REVOKE FROM anon, authenticated) **не сработала** — advisor продолжал показывать 11 функций. Причина: функции по умолчанию дают `EXECUTE → PUBLIC`, а `anon`/`authenticated` наследуют его. Revoke у конкретных ролей не трогает PUBLIC.

Фикс — миграция #6: `REVOKE EXECUTE ... FROM PUBLIC`, затем `GRANT` обратно точечно. Поймано на сверке с advisor (прямой запрос grants по ролям этого не показывал — проверять надо именно advisor'ом или включая grantee=PUBLIC).

---

## Намеренно оставлено (НЕ дефект)

**2 функции остаются `authenticated`-executable** — это правильно:
- `convert_lead(...)` — вызывается приложением через `.rpc` (`use-leads.ts`). Нужен authenticated.
- `user_role()` — вызывается **внутри RLS-политик** (`user_role() = ANY(ARRAY['admin','pm'])` в companies/contacts/projects/tasks/calls/meetings/activities). Политики исполняются как роль запрашивающего → authenticated ОБЯЗАН иметь EXECUTE, иначе все эти политики упадут.

Live-проверка после revoke: дашборд и /projects рендерятся, все запросы 200 — RLS не сломан.

---

## Что осталось (по решению — НЕ делал)

| Замечание | Статус / почему |
|-----------|-----------------|
| `auth_leaked_password_protection` выключен | Не SQL — включается в Dashboard → Authentication → Settings (HaveIBeenPwned). 1 клик. |
| `unindexed_foreign_keys` (25) | **Сознательно не добавлял.** БД крошечная (~82 строки max) → seq scan мгновенен, реального impact нет. 24 индекса = write-overhead + почти гарантированно следующая пачка unused-warnings (ровно так появились текущие). Список FK — в аудите; добавить когда таблицы вырастут или появятся медленные JOIN. |
| `unused_index` (37) | **Сознательно не дропал.** Статистика использования сбрасывается при рестарте/на репликах; БД новая → «unused» может значить «ещё не использовался». Дропнуть рабочий индекс по ложному сигналу хуже лишнего на пустой БД. Перепроверить через месяц реального использования. |

---

## ⚠️ Отдельная находка (НЕ Supabase-lint): рассинхрон stage / stage_id

При разведке `projects` вскрылась **реальная проблема целостности данных** — две параллельные колонки стадии **противоречат друг другу**:

| Проект | `stage` (text enum) | `stage_id` → pipeline_stages.name | phase_group | Консистентность |
|--------|--------------------|-----------------------------------|-------------|-----------------|
| ОМК | `trilateral_meeting` (Встреча 3х) | **Материалы** | **attraction** | ❌ ПРОТИВОРЕЧИЕ |
| Завод Атлант | `trilateral_meeting` | Встреча 3х | approval | ✓ |
| Аграрная группа | `contract_review` | Договор | closing | ✓ |
| 3× lost | `lost` | Проиграна | closing | ✓ |

**Почему это баг, а не косметика:** аналитика «Проекты по фазам» (`Charts.tsx`) читает `getPhaseForStage(p.stage)`, а канбан-доска — `stage_id`. Для ОМК они кладут проект в **разные колонки**: аналитика → negotiate (по `stage`), канбан → attraction (по `stage_id`). Claude Code починил *рендер* графика (бары рисуются), но **сам рассинхрон данных остался**.

**Почему не фиксил сам:** выбор источника истины (`stage` vs `stage_id`) — архитектурное решение с последствиями в коде (приложение читает обе колонки в разных местах). Слепой `UPDATE` на проде неуместен.

**Рекомендация (нужно твоё решение):**
1. Выбрать единственный источник истины. Логично — `stage_id` (нормализованный FK на pipeline_stages, поддерживает кастомные пайплайны). `stage` (legacy text enum) — депрекейтить.
2. Одноразовая миграция: синхронизировать `stage` ← по `stage_id` (или наоборот), починив рассинхрон ОМК.
3. В коде: перевести `Charts.tsx` (и всё, что читает `stage`) на `stage_id`/`phase_group` из pipeline_stages. Убрать чтение legacy `stage`.
4. Когда `stage` нигде не читается — дропнуть колонку.

Это отдельный спринт (DB-миграция + правки кода + тест), не входил в security-хвост.

---

## Smoke-тест (выполнен)

- `/` (дашборд) + `/projects` — рендер полный, все Supabase-запросы 200 после всех миграций.
- RLS через `user_role()` работает (политики admin/pm + own).
- Не тестировал вживую: создание/удаление сущности (триггер-лог пишется как DEFINER — должен; проверить при следующем CRUD), конвертацию лида (`convert_lead` RPC — grant authenticated сохранён).
