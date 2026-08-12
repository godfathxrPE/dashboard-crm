# Claude Code Prompt — Merge S-LEAD-CARRY-1

Гейт закрыт. Миграция **123 применена** 2026-08-12 (`20260812060950 lead_convert_carryover`),
смок и advisors чистые. Реген типов сделан, но **не закоммичен**, и **стаб ещё на месте** —
это последнее, что отделяет ветку от мержа.

Ветка `feat/lead-convert-carryover` на 2 коммита впереди `main`, `main` не ушёл вперёд
(0 коммитов) — конфликтов быть не должно.

## РАЗВЕДКА

```bash
git branch --show-current            # ждём feat/lead-convert-carryover
git status --porcelain               # ждём: M docs/schema.md, M src/types/supabase.gen.ts, ?? _analysis/*
git rev-list --count HEAD..main      # ждём 0 — main не ушёл вперёд
git diff --numstat src/types/supabase.gen.ts   # ждём 31 0 — реген строго аддитивный
grep -c graphql_public src/types/supabase.gen.ts  # ждём 2 (CLI-реген его вернул, MCP не отдавал)
grep -n "CompaniesChzStub" src/types/database.ts  # ждём две строки — блок и интерсекшен
```

Если `git diff --numstat` покажет удаления в `supabase.gen.ts` — **остановись и покажи их**.
Строго аддитивный дифф (+31/−0) — признак, что реген прошёл через CLI и ничего не потерял.

---

## ЗАДАЧА 1 — снять стаб `CompaniesChzStub`

Файл `src/types/database.ts`. Колонка приехала из автогенерации, стаб обязан уйти
**целиком**: оставленный, он переживает миграцию молча и продолжает врать про схему.

**Удали блок** (вместе с шапкой-комментарием и пустой строкой после):

```ts
// ═══ S-LEAD-CARRY-1 (123, на гейте): companies.chz_groups ═══
// ВРЕМЕННЫЙ СТАБ. Снять целиком после apply 123 + регенерации типов: колонка
// приедет из автогенерации, а этот блок обязан уйти — оставленный стаб переживает
// миграцию молча и продолжает врать про схему.
//
// `type`, а НЕ `interface`: postgrest требует от таблицы индексную сигнатуру,
// interface её не получает, и `.update()` схлопывается в `never`.
type CompaniesChzStub = {
  Row: { chz_groups: string[] | null };
  Insert: { chz_groups?: string[] | null };
  Update: { chz_groups?: string[] | null };
};
```

**И верни маппед-тип к исходному виду** — убери интерсекшен и его комментарий:

```ts
      > & { Insert: RelaxOrgId<GenDatabase['public']['Tables'][K]['Insert']> }
        // 123 на гейте: `unknown` в пересечении — единица (`T & unknown` = `T`),
        // поэтому остальные таблицы проходят нетронутыми.
        & (K extends 'companies' ? CompaniesChzStub : unknown);
```

→

```ts
      > & { Insert: RelaxOrgId<GenDatabase['public']['Tables'][K]['Insert']> };
```

Обрати внимание на точку с запятой: она переезжает на строку `Insert: RelaxOrgId<…>`.

Проверка:

```bash
grep -c "CompaniesChzStub" src/types/database.ts   # ждём 0
git diff src/types/database.ts                     # ждём: только удаления, ничего не добавлено
```

---

## ЗАДАЧА 2 — поправить устаревшие пометки «на гейте»

`src/lib/hooks/use-companies.ts`, два блока про `chz_groups` (в `Company` и в
`CompanyInsert`). Оба помечены `(123, на гейте)`, а в `Company` вдобавок стоит причина,
которая перестала быть верной:

> Опционален по той же причине, что колонки 102/103 выше — до применения 123
> колонки нет в ответе `select('*')`.

123 применена, колонка в ответе есть. Поле остаётся опциональным не поэтому, а потому
что **этот интерфейс рукописный и не автогенерируется** — его контракт держит
`companyFormSchema`, а не схема БД.

Замени `(123, на гейте)` на `(123, applied 2026-08-12)` в обоих блоках и перепиши
причину в `Company` на актуальную. Тот же класс, что комментарий про «ФИЛЬТР»,
который ты уже поправил: неверная причина в комментарии живёт дольше, чем состояние,
которое её породило.

**Само поле `chz_groups?` в обоих интерфейсах НЕ удалять** — они рукописные, реген их
не наполняет.

---

## ЗАДАЧА 3 — проверки

```bash
npx tsc --noEmit
npx vitest run
npm run lint          # ждём те же 14 ошибок в middleware.ts / server.ts, ни одной новой
npm run build         # последним; при живом next dev его сначала остановить
```

`tsc` здесь — главная проверка: если стаб снят неаккуратно или реген не наполнил
`companies.chz_groups`, всё встанет именно тут.

---

## ЗАДАЧА 4 — коммит

```bash
git add src/types/supabase.gen.ts src/types/database.ts src/lib/hooks/use-companies.ts \
        docs/schema.md \
        _analysis/sprint-lead-carry-1.md _analysis/fix-lead-carry-1.md

git status   # _analysis/sprint-lead-card-visual-1.md НЕ добавлять — он к другому спринту

git commit -m "chore(types): реген после apply 123, стаб CompaniesChzStub снят

- supabase.gen.ts: companies.chz_groups из автогенерации (+ graphql_public,
  которого не отдавал MCP-реген)
- database.ts: временный стаб и интерсекшен по 'companies' удалены
- use-companies.ts: пометки «на гейте» → applied, причина опциональности
  переписана (интерфейс рукописный, а не миграция не применена)
- docs/schema.md: 123 переведена в applied 2026-08-12 (20260812060950),
  добавлен протокол ролевого смока гейта
- _analysis: спринт-файл и фикс-файл S-LEAD-CARRY-1"
```

---

## ЗАДАЧА 5 — мерж

Конвенция проекта — `--no-ff` с описательным сообщением (см. `git log --merges`):

```bash
git checkout main
git merge --no-ff feat/lead-convert-carryover -m "Merge branch 'feat/lead-convert-carryover' — конверсия переносит квалификацию: роль в карту стейкхолдеров, бюджет в заметку, ЧЗ-профиль в компанию (S-LEAD-CARRY-1, миграция 123)"

git log --oneline -3
git status   # ждём чистое дерево
```

**Пуш — отдельным решением Олега.** Мерж в `main` триггерит деплой на Vercel; порядок
здесь правильный (миграция в проде с 2026-08-12, схема БД впереди кода), так что деплой
безопасен. Но команду выполняет он:

```bash
git push origin main
```

После пуша ветку можно удалить: `git branch -d feat/lead-convert-carryover`.

---

## Чего в этом промпте намеренно НЕТ

- **Проверка карточки компании глазами.** UI-часть спринта не смочена ни разу: в проде
  ноль компаний с `chz_groups`, значит `declared`-ветка резолвера на экране не
  рендерилась. Это делается вручную после мержа — сконвертировать лид «Тест»
  (`chz_groups = {Удобрения}`, `budget_status = estimated`, `decision_role = null`) и
  посмотреть виджет маркировки, `pinned_note` сделки и карту стейкхолдеров.
- **Обновление скилла `crm-architect`** (ledger 123, три новых урока) — отдельным заходом.
