# Ревью: Sprint W1 — Безопасность данных (RLS WITH CHECK, storage, anon, headers, safeHref, AI-дедуп)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `cb1156d`, migrations 040–067, `netlify.toml`, call-sites, `ai-summarize`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-w1-security.md` — 054 WITH CHECK + freeze · 055 storage · 056 anon · HSTS/CSP-lite · safeHref · AI-дедуп  
**Контекст:** `_analysis/REVIEW-2026-07-18-senior-pm.md` (волна 1); реализация `9efeb56`; follow-up `488f3af` (056b + `docs/schema.md`); гейт applied per docs (2026-07-18). HEAD уже содержит 057–067 поверх W1.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА в промпте (grep + MCP inventory) | ✅ |
| Нумерация 054–056 **на момент написания** (после 053) | ✅ (исторически) |
| Нумерация / «todo»-разведка **против текущего репо** | 🟡 **W1** (устарело) |
| WITH CHECK = org-only (не зеркало ownership) | ✅ |
| `freeze_org_id` DEFINER + ACL + `aa_` + `UPDATE OF org_id` | ✅ |
| Storage own-path / HSTS / CSP-lite / safeHref / AI 429 | ✅ |
| learnings: initplan, hardening, CC≠apply, schema тем же заходом | ✅ |
| Реализация в git + гейт (apply + smoke + deploy) | ✅ **уже сделано** |
| `docs/schema.md` блок 054–056b | ✅ (`488f3af` + header Applied) |
| Storage `upsert: true` без UPDATE-политики | 🟡 **W3** (остаточный риск) |
| crm-architect checklist (дизайн спринта) | ✅ |

**Оценка: 9/10** как handoff-промпт (дизайн и границы верные).  
**Рекомендация:** **не запускать в Claude Code.** Спринт полностью реализован (`9efeb56`), применён и задокументирован. Повторный прогон = риск перезаписи готовых артефактов и конфликта с 057–067. Файл оставить как архив; для работы — только точечные follow-up, если понадобятся (см. W3).

---

## Статус (репо vs текст спринта)

| Заход | Статус в репо / live |
|-------|----------------------|
| `053_quotes.sql` | ✅ есть; после неё цепочка до **067** |
| `054_rls_update_with_check.sql` | ✅ calls/companies/contacts/leads/meetings/projects/tasks/quotes + org/profiles; skip `project_columns`/`notif` |
| `055_storage_project_files.sql` | ✅ drop live-имён + канон `project_files_{select,insert,delete}` |
| `056_revoke_anon_defaults.sql` | ✅ tables/sequences (+ default privs functions); functions bulk REVOKE нет |
| `056b_revoke_trigger_fn_execute.sql` | ✅ follow-up гейта (не в исходном спринте) |
| `safeHref` + 3 call-site | ✅ `src/lib/utils/safe-href.ts`; Detail L255/793, Hub L127/178, QuotesTab L143/169 |
| HSTS + CSP-lite | ✅ `netlify.toml` L24–25 |
| AI-дедуп 10 мин → 429 | ✅ `supabase/functions/ai-summarize/index.ts` L137–143 |
| `tests/unit/safe-href.test.ts` | ✅ **6/6 pass** (vitest 2026-07-19) |
| Коммит W1 | ✅ `9efeb56` (ancestor of `cb1156d`) |
| `docs/schema.md` дельта 054–056b | ✅ блок + «applied 2026-07-18», smoke «политик без WITH CHECK — 0» |
| skill `schema.md` | ✅ краткая строка про 054–056/056b в changelog |
| Apply / functions deploy | ✅ по `docs/schema.md`: apply MCP + `ai-summarize` v4 |

---

## Разведка (верификация утверждений)

| Утверждение спринта | Live-проверка (2026-07-19) |
|---------------------|----------------------------|
| «последняя — 053; новые: 054, 055, 056» | **Было верно при написании.** Сейчас в `supabase/migrations/` лежат 054–067 (+056b); last numeric = **067** |
| `safeHref` не существует — создаём | **Устарело:** import+usage в 3 компонентах; файл `src/lib/utils/safe-href.ts` |
| HSTS/CSP нет | **Устарело:** оба header’а в `netlify.toml` |
| `do_url` ~748 / ~176, `document_url` ~167 | **Сдвинуты:** `doHref`/`docHref` + `href={…}`; InlineEdit `value={project.do_url}` (не XSS-вектор) — Detail ~784–800, Hub ~178, QuotesTab ~169 |
| Путь storage `userId/projectId/…` | ✅ `src/lib/hooks/use-project-files.ts` L45 (`${user.id}/${projectId}/${safeName}`) |
| `error.context.json()` на клиенте | ✅ `src/lib/hooks/use-ai-summary.ts` L35–39 |
| Кандидаты UPDATE без WITH CHECK | Baseline: USING-only на calls/companies/contacts/leads/meetings/projects/tasks; `project_columns_update` **уже** WITH CHECK (baseline L3584–3586); `notif_update` — WITH CHECK в 040; 054 сверил live-список и пропустил их |
| `quotes_update` в списке 054 | Включено; org-only WITH CHECK согласован с 053-паттерном |
| Миграции не apply из CC | ✅ в промпте и в факте (файлы + commit; apply — гейт) |
| Hook path «use-project-files.ts» | Путь **без префикса**; факт: `src/lib/hooks/use-project-files.ts` (не `src/hooks/`) |

---

## С чем согласен полностью

### 1. WITH CHECK = только org-граница
Не зеркалить ownership из USING — правильный выбор: иначе менеджер не смог бы сменить `owner_id` / `assigned_to` (AssigneeSelect). Initplan `( SELECT public.current_org_id() )` — по learnings.

### 2. freeze_org_id молча, не RAISE
Совместимо с optimistic `org_id`-заглушками в хуках. `SECURITY DEFINER SET search_path = public, pg_temp` + REVOKE PUBLIC/anon/authenticated + GRANT service_role — канон триггерных функций. Префикс `trg_aa_freeze_org_id` + `WHEN (old.org_id IS DISTINCT FROM new.org_id)` + `UPDATE OF org_id` — аккуратно (порядок `aa_`, learnings).

### 3. 055 storage в git
Закрывает «политики только в Dashboard». Own-path `(storage.foldername(name))[1] = auth.uid()` паритетен метаданным own-upload. Имена live-политик зафиксированы в миграции (как требовала разведка №3).

### 4. 056 revoke anon defaults + all tables (не functions)
Снимает класс «таблица без RLS = публична под anon». Скоп-revoke функций осознанно исключён — совпадает с hardening 024/034/040. 056b на гейте добил advisor по trigger-fn EXECUTE.

### 5. safeHref + CSP-lite + HSTS
Реальный stored-XSS-контур на `do_url`/`document_url`. CSP-lite не трогает inline theme-init. Паттерн «нет safe href → без `<a>`» соблюдён в трёх местах.

### 6. AI-дедуп 10 мин / 429
Формат тела совместим с `use-ai-summary.ts`. Деплой — на гейте, не из CC. Реализация: после load entity под RLS, до Claude.

### 7. NB baseline ≠ live
Текст явно не доверяет baseline по `notif_update` / `project_columns` — источник истины MCP. Реализация 054 это отразила.

### 8. Процесс
Миграции отдельными файлами; без BEGIN/COMMIT; schema обновлён follow-up’ом `488f3af` (и блок Applied в `docs/schema.md`).

---

## Блокеры (критично — исправить до запуска CC)

**Нет блокеров дизайна.**  
**Операционный блокер повторного запуска:** промпт описывает pre-impl состояние; CC по этому файлу **не запускать** — всё уже в `main` и (по docs) на live.

---

## Предупреждения (желательно учесть)

### W1. Спринт-файл устарел как «todo»-промпт
РАЗВЕДКА (`safeHref не существует`, «HSTS/CSP нет», last=053) — снимок **до** `9efeb56`. Повторный прогон = дублирование/перезапись. Для истории оставить; в шапке имеет смысл `STATUS: done @ 9efeb56; gate applied 2026-07-18` (опционально, не обязательно править сейчас).

### W2. Ложные line numbers / пути хуков
Строки ~748 / ~176 / ~167 устарели после последующих фич (chat, team, workspace). Хуки: `src/lib/hooks/use-project-files.ts`, `src/lib/hooks/use-ai-summary.ts` — не `src/hooks/…`. Для будущего handoff — «найти grep’ом», без жёстких номеров (в тексте это уже сказано частично).

### W3. Storage: нет UPDATE-политики при `upsert: true`
`use-project-files.ts` L50: `.upload(..., { upsert: true })`. 055 даёт SELECT/INSERT/DELETE, **без UPDATE** на `storage.objects`. UUID в имени делает коллизии маловероятными; при 403 на перезаписи — либо `project_files_update` own-path, либо убрать `upsert`. На avatars (061) UPDATE-политика уже есть — асимметрия осознанная, но upsert+INSERT-only остаётся хрупким.

### W4. Нюанс угрозы «дырки без WITH CHECK»
В PostgreSQL для UPDATE, если `WITH CHECK` не задан, для NEW используется **USING**. Чистый `org_id → чужая org` при USING с `org_id = current_org_id()` уже должен отсекаться. 054 всё равно ценен: (а) **явный** org-only WITH CHECK не ломает reassignment ownership; (б) freeze — второй рубеж; (в) прецедент 040. В `docs/schema.md` L932 ещё есть общая фраза «UPDATE без WITH CHECK наследуют USING» — после 054 для CRM-ядра это скорее исторический note, не текущий inventory.

### W5. Self-check grep
`grep do_url|document_url | grep -v safeHref` ловит InlineEdit `value={…do_url}` — ложный fail. В спринте оговорено; проверять только `<a href=`.

### W6. Пост-W1: team visibility (065) vs storage own-path
065 добавил `project_files_select_member` на **метаданные** `public.project_files`; storage.objects по 055 по-прежнему **own-path**. Участник команды может видеть список файлов, но signed URL/download чужого path — вне own-folder. Это **вне scope W1** (065 сам пишет «не трогает storage.objects»); не баг спринта, но продуктовый gap, если ждали паритет download.

### W7. skill schema vs docs
`docs/schema.md` — полный блок 054–056b + smoke. skill `schema.md` — краткая строка в changelog. Дрейф минимальный; при следующем skill-sync можно подтянуть 2–3 предложения (не блокер).

---

## Пропущенные места

| Файл / объект | Наблюдение | Действие |
|---------------|------------|----------|
| Сырые `href={do_url\|document_url}` | Не найдены | ✅ |
| `pm_update` / delivery / automation | Уже с WITH CHECK в baseline/поздних | Не трогать (спринт ок) |
| `meeting_attendees` | org_id нет; ALL + EXISTS | freeze не вешается; ок |
| `056b` | Не в исходном спринте, появился на гейте | ✅ правильный follow-up |
| Другие user-controlled external href | Вне W1 | Вне спринта |
| Поздние миграции 057–067 | Не конфликтуют с 054–056 по именам | Повторно 054–056 не накатывать |

---

## Предлагаемые правки в спринт

*Не обязательны — код и гейт закрыты. Только если обновляете handoff для истории:*

1. Шапка: **STATUS: implemented `9efeb56` · applied 2026-07-18 · do not re-run CC**.
2. РАЗВЕДКА: «verify present» вместо «создаём / нет»; last migration → динамический `ls … \| tail`.
3. Пути хуков: `src/lib/hooks/use-project-files.ts`, `src/lib/hooks/use-ai-summary.ts`.
4. Гейт: отметить выполненные пункты (apply, smoke, deploy, schema) + опционально upsert-smoke storage.
5. (Опционально) NB: PG inherits USING→WITH CHECK; 054 = explicit org-only + freeze.

---

## Чеклист перед CC / гейтом

- [x] РАЗВЕДКА и реальные пути/символы (на момент impl)
- [x] Миграции отдельными файлами; CC не apply
- [x] Hardening DEFINER + ACL на `freeze_org_id`
- [x] org first + initplan
- [x] CSS/themes out of scope; headers only netlify
- [x] Реализация в git (`9efeb56`)
- [x] `docs/schema.md` блок W1 (+056b)
- [x] **apply_migration** 054 → 055 → 056 (+056b)
- [x] Smoke: tamper `org_id`, обычный update, смена `owner_id` (по docs)
- [x] `ai-summarize` deploy + 429-дедуп (по docs: v4)
- [ ] **Не** запускать CC повторно по этому файлу
- [ ] (Опционально) storage upsert smoke / снять `upsert: true` — residual W3

---

## crm-architect checklist

| Пункт | Результат |
|-------|-----------|
| Starts with РАЗВЕДКА | ✅ |
| Real table/column names | ✅ |
| Real file paths (с оговоркой hooks path) | ✅ / 🟡 W2 |
| learnings gotchas | ✅ |
| SQL migrations separate; not applied from CC | ✅ |
| org_id / RLS; `current_org_role` where needed | ✅ |
| New functions: DEFINER + search_path + ACL | ✅ |
| No `flowType: 'implicit'` | ✅ (out of scope) |
| DELETE / CASCADE | N/A |
| CSS variables only | N/A (headers only) |
| schema.md after migration | ✅ (follow-up `488f3af`) |
