# Claude Code Prompt — Sprint AUDIT-B: «Схема — источник истины»

По AUDIT-2026-07-12 (1.2, 2.3, 2.4, 2.6, 2.10, 3.3, 3.8). СОВМЕСТНЫЙ с Cowork спринт.
Решение Олега: **снимок-база** (не бэкпорт). Ветка: main.

⚠️ ВАЖНО (верифицировано Cowork по живому проду 2026-07-12): дыры `attendees_all USING(true)`
и `activity_log WITH CHECK(true)` существуют ТОЛЬКО в файлах миграций — на проде их НЕТ
(там attendees_own с гардом и «Users insert own logs» org+uid). Ничего на проде по 1.2 чинить
не надо; задача — сделать репо воспроизводимым.

## Разделение ролей (v2 — решение гейта 2026-07-12)
- **Олег (локально):** снимает дамп штатным инструментом (НЕ рукосборка через MCP — хрупко):
  `npx supabase db dump --db-url "postgresql://...(из Dashboard→Database)" --schema public
  -f supabase/migrations/20260712230000_baseline.sql`
- **Cowork (гейт):** верифицирует полноту дампа против живой БД по эталону (см. ниже);
  добивает недостающее (напр., ALTER PUBLICATION supabase_realtime — pg_dump может не включить);
  применяет 040 на прод; advisors + смоуки; генерирует типы (generate_typescript_types).
- **CC (этот промпт):** раскладывает файлы (задача 1.2+), пишет 040, интегрирует типы, чистит мусор.

**Эталон живой БД (Cowork, 2026-07-12) — дамп обязан покрыть:**
34 таблицы (RLS enabled на ВСЕХ 34) · 7 enum-типов · 41 функция · 53 триггера · 97 политик ·
113 индексов · 0 views · 0 sequences · 10 таблиц в publication supabase_realtime ·
extensions: uuid-ossp, pgcrypto (+системные plpgsql/pg_stat_statements/supabase_vault — не дампить).

## ЗАДАЧА 1: baseline-снимок (файлы)

1. Файл `supabase/migrations/20260712230000_baseline.sql` — ГОТОВ (локальный supabase db dump,
   верифицирован гейтом Cowork: 34/7/41/53/97/113/RLS-34 сошлись; дописан аддендум realtime-publication
   на 10 таблиц, extensions намеренно исключены — Supabase-managed). НЕ переделывать, брать как есть.
2. Старую цепочку → `supabase/migrations/archive/001...038*.sql` (git mv, история сохраняется).
3. `supabase/migrations/README.md`: «Базовая точка = baseline (снимок прода 2026-07-12).
   archive/ — историческая цепочка, НЕ реплеится (016 падает: pipelines создавались вручную;
   005/009 содержат отменённые политики). Правило: каждый прод-фикс = файл здесь, Cowork
   применяет через MCP.»
4. Удалить дубль `005_calls_meetings.sql` из КОРНЯ репо (3.8) — не из migrations/.

## ЗАДАЧА 2: миграция 040_rls_hardening.sql (НЕ применять — гейт Cowork)

1. **ai_hub org-INSERT (2.3):** в `transcripts_insert` и `ai_runs_insert` добавить
   `AND org_id = (SELECT current_org_id())` в WITH CHECK (DROP POLICY + CREATE, имена сохранить).
2. **notif_update (2.10):** добавить WITH CHECK = USING-выражению.
3. **Инвайты (2.4), minimal-фикс:** в `apply_pending_invites` принимать членство только если
   у нового пользователя `email_confirmed_at IS NOT NULL` (закрывает сценарий «регистрация на
   чужой адрес при выключенной верификации»). Полный token-flow (RPC accept_invitation(p_token)
   + страница /invite) — СЛЕДУЮЩИЙ спринт, здесь только пометить TODO в комментарии.
   ⚠️ На проде висит непринятый инвайт god4azer@gmail.com/manager — после фикса перепроверить,
   что легитимный приём не сломан.
4. **FK без ON DELETE (2.6):** `activities.project_id` → ON DELETE SET NULL;
   `scheduled_calls.company_id/contact_id/project_id`, `kpi_entries.profile_id` — SET NULL
   (сверь текущие констрейнты по живой схеме: DROP CONSTRAINT + ADD с правилом).

## ЗАДАЧА 3: типы (3.3)

1. Сгенерировать `src/types/supabase.gen.ts` локально тем же CLI/соединением, что и baseline
   (Cowork верифицировал через MCP: 34 таблицы, is_milestone/do_url/reorder/check_delivery_completion
   присутствуют, contact_company/meeting_attendees/stage_entered_at — закрывают пробел 3.3):
   `npx supabase gen types typescript --db-url "postgresql://postgres.uoiavcabxgdjugzryrmj:[PASS]@aws-1-eu-north-1.pooler.supabase.com:5432/postgres" --schema public > src/types/supabase.gen.ts`
2. `database.ts` → тонкий слой: реэкспорт `Database` из supabase.gen + существующие
   КАСТОМНЫЕ хелперы поверх (не потерять! файл рукописный).
3. `client.ts` / server client: `createBrowserClient<Database>(...)` — включить generic (TODO там).
4. Прогнать tsc; всплывшие ошибки чинить итеративно (ожидаемы: расхождения nullable/отсутствующие
   поля, которых не было в placeholder). Если объём >~30 ошибок — остановиться, зафиксировать
   список, обсудить с Cowork порядок.

## Тест-сценарии (гейт Cowork)
1. Advisors security: без новых WARN сверх известных SECURITY DEFINER.
2. INSERT в transcripts с чужим org_id (при своём created_by) → отказ.
3. Изменение recipient_id в notifications → отказ.
4. DELETE проекта с activities → проходит, activities.project_id = NULL.
5. tsc/build зелёные с generic-клиентом.

## КОММИТЫ (три)
```
git add supabase/migrations/ && git commit -m "chore(db): baseline-снимок прод-схемы, архив старой цепочки, удалён дубль 005 (AUDIT B1)"
git add supabase/migrations/*rls_hardening* docs/schema.md && git commit -m "fix(rls): org-гард ai_hub INSERT, notif WITH CHECK, confirmed-email для инвайтов, FK ON DELETE (040, pending) (AUDIT B2)"
git add src/types src/lib/supabase && git commit -m "feat(types): генерированные Supabase-типы + generic-клиент (AUDIT B3)"
```

## VERIFICATION (ожидаемое)
Type Safety: PASS после B3 | RLS Coverage: WARNING до применения 040 |
Backward Compat: WARNING (инвайт-флоу — проверить на живом инвайте) | Runtime: NOT_VERIFIED
