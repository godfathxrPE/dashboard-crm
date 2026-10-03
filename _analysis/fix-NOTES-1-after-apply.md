# Claude Code Prompt — fix-NOTES-1-after-apply

Chore после S-NOTES-1. Миграция 134 применена гейтом Cowork 02.10, PR #151 вмержен (`73413df`).
Осталось: реген типов и снятие стаба, статус 134 в документах, STATUS, уроки.
Миграции не применять, прод-БД не трогать (CLAUDE.md, правило 1). `.env` не читать.

Факты гейта (не перепроверять запросами на запись, только read-only при сомнении):
- Журнал прода: `20261002192427 notes_1_table` · `20261002193630 notes_3_export` ·
  `20261002193718 notes_4_convert_lead` · `20261002200000 notes_2_timeline`.
- Разбивка на 4 версии: MCP `apply_migration` падал по таймауту 180 с на `entity_timeline`
  (16 КБ и 13,5 КБ); секция 10 ушла через SQL Editor владельца с ручной записью в журнал.
- Тела функций в базе = файл `supabase/migrations/134_notes.sql` (md5 сверен гейтом).
- Гейт-отчёт: Claude Project `claude/gate-S-NOTES-1.md`.

## РАЗВЕДКА

```bash
git fetch origin && git log --oneline -1 origin/main
git log --oneline origin/main | grep -m1 "#151"
grep -n "STUB S-NOTES-1" -r src
grep -n "НЕ ПРИМЕНЕНА\|НЕ ПРИМЕНЯТЬ" supabase/migrations/134_notes.sql | head
grep -n "134" docs/schema.md crm-architect/references/schema.md | head -20
head -5 crm-architect/STATUS.md
```

Ожидается: `#151` в истории `origin/main`; стаб в `src/types/database.ts` и пометка в
`src/types/entities.ts:42`. Если `#151` нет в `origin/main` — стоп, отчёт.

Работа — в worktree от свежего `origin/main`, ветка `chore/notes-1-after-apply`
(скилл worktree-isolation). Этот файл лежит untracked в основном чекауте — перенести его
в worktree через `mv`, НЕ `cp`: копия, оставшаяся в основном чекауте, после мержа станет
untracked-дублем tracked-файла и сломает `git pull`/merge main.

```bash
mv _analysis/fix-NOTES-1-after-apply.md <путь worktree>/_analysis/ &&
test ! -e _analysis/fix-NOTES-1-after-apply.md && echo moved
```

## ЗАДАЧА 1: реген типов

### Context
`supabase.gen.ts` не знает `notes`; `database.ts` держит самоснимающийся стаб.
Правило 2 CLAUDE.md: генерируемые файлы руками не правятся.

### Steps
1. `scripts/gen-types.sh` — пишет через временный файл, с санити-проверками.
2. `git diff --stat src/types/supabase.gen.ts`. В диффе ожидается: таблица `notes`,
   функции `set_note_pinned` / `soft_delete_note` / `restore_note`, у `entity_timeline`
   аргумент `p_search`. Блок `graphql_public` удаляться НЕ должен (его отдаёт CLI).
   Посторонние изменения схемы (не 134) — не откатывать, перечислить в отчёте.

### Verification
```bash
grep -n "notes: {" src/types/supabase.gen.ts | head -3
grep -n "p_search" src/types/supabase.gen.ts | head -3
grep -c "graphql_public" src/types/supabase.gen.ts
```

## ЗАДАЧА 2: снять стаб

### Steps
1. `src/types/database.ts`: удалить блок от `// ═══ STUB S-NOTES-1` до конца стаба целиком,
   вместе с типами `NotesStub*` и подменой в `Database`. Тип `notes` берётся из
   `supabase.gen.ts` штатным путём, как у соседних таблиц (`RelaxOrgId` уже снимает
   обязательность `org_id` в Insert).
2. `src/types/entities.ts:42`: алиас оставить, строку-пометку про стаб убрать.
3. `grep -rn "NotesStub" src tests` → 0 совпадений. Потребитель стаба найдётся — перевести на
   `Database['public']['Tables']['notes']`.

### Verification
```bash
grep -rn "STUB S-NOTES-1\|NotesStub" src tests ; echo "exit=$?"
npx tsc --noEmit
```
Ожидается `exit=1` у grep (совпадений нет) и 0 ошибок tsc. Ошибка tsc в `use-notes.ts` /
`build-insert.ts` — значит, стаб расходился с реальной схемой: чинить код под сгенерированный
тип, не тип под код; расхождение — в отчёт.

## ЗАДАЧА 3: статус 134 в документах

### Steps
1. `supabase/migrations/134_notes.sql`, шапка: строки «СТАТУС: НАПИСАНА, НЕ ПРИМЕНЕНА.
   НЕ ПРИМЕНЯТЬ из Claude Code…» заменить на «СТАТУС: ПРИМЕНЕНА гейтом Cowork 2026-10-02
   четырьмя версиями журнала: …» с четырьмя версиями из шапки этого файла. Правка только
   в комментариях — тело SQL не трогать (`git diff` по файлу = только строки `--`).
2. `docs/schema.md`, ledger (~строка 625): «134 … НАПИСАНА, НЕ ПРИМЕНЕНА» → «**134 applied**»
   с четырьмя версиями и причиной разбивки одной фразой. «Следующая свободная — 135» оставить.
   В разделе `### notes` — убрать пометки «после apply», если есть.
3. `crm-architect/references/schema.md` — та же правка (правило 5: копия в скилле).

### Verification
```bash
git diff supabase/migrations/134_notes.sql | grep "^[+-]" | grep -v "^[+-]\s*--" | grep -v "^[+-]\{3\}"
grep -n "НЕ ПРИМЕНЕНА" docs/schema.md crm-architect/references/schema.md | grep 134
```
Оба вывода пустые.

## ЗАДАЧА 4: STATUS и уроки

### Steps
1. `crm-architect/STATUS.md` — ревизия 76, main `73413df` (PR #151). В «В работе»/закрытых —
   S-NOTES-1 закрыт: таблица `notes`, RPC закрепления/удаления/возврата, лента читает
   `kind='note'`, `p_search`; хвосты — S-NOTES-2 (лента карточек, правка/закрепление/удаление
   в UI, снятие моста `trg_zz_notes_bridge`, перенос `projects.pinned_note`), S-NOTES-3,
   🟡 чтение `notes` org-wide (паритет с `calls`; сужать вместе), fix-FONT-UNBOUNDED.
   Сверка: `scripts/status-check.sh`.
2. `crm-architect/references/learnings.md` — два тематических урока:
   - **Порядок выката при смене формы ответа RPC.** Когда миграция меняет, ЧТО отдаёт
     RPC (новый `kind`, убран тип строки), клиент main должен понимать обе формы ДО apply,
     иначе apply и мерж — одним окном. 02.10: `entity_timeline` перестала отдавать
     `comment_added`, а `TIMELINE_KINDS` в main не знал `note` — заметки пропали из лент
     прода до деплоя #151. Данные не пострадали.
   - **Таймаут MCP `apply_migration` на крупной функции.** Около 11 КБ проходит, 13,5–16 КБ —
     таймаут 180 с без следа в БД. Делить миграцию по независимым секциям (отдельные
     версии журнала); неделимую функцию — через SQL Editor владельца одной транзакцией
     с `insert into supabase_migrations.schema_migrations`. Перед повтором — проверить
     сигнатуру и `pg_stat_activity`.
3. `crm-architect/references/journal.md` — запись «S-NOTES-1» (4–6 строк): что сделано,
   отклонения гейта (FK по конвенции, `notes_touch` и `set null`, soft-delete как решение
   владельца), разбивка apply, окно без заметок в лентах.

### Verification
```bash
head -3 crm-architect/STATUS.md
grep -n "Порядок выката\|apply_migration" crm-architect/references/learnings.md | head
grep -n "S-NOTES-1" crm-architect/references/journal.md | head -3
```

## ТЕСТЫ

Тестов нет: смена типов на сгенерированные и документы, новой логики нет. Существующие
тесты `use-notes` / `build-insert` / `timeline-rpc-adapter` обязаны пройти без правок —
если правка понадобилась, это расхождение стаба со схемой, в отчёт.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

## КОММИТ

```bash
git add src/types/supabase.gen.ts src/types/database.ts src/types/entities.ts \
  supabase/migrations/134_notes.sql docs/schema.md crm-architect/references/schema.md \
  crm-architect/STATUS.md crm-architect/references/learnings.md crm-architect/references/journal.md \
  _analysis/fix-NOTES-1-after-apply.md
git commit -m "chore(notes): типы notes из регена, стаб снят, 134 applied в документах, STATUS rev76 (S-NOTES-1)"
```
Без push. PR и мерж — у владельца.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, таблицы, функции.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд. Без цепочек «осуществление проведения проверки».
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · 42 теста passed · build exit 0).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».
