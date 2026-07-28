# fix-S-R2-SIGNOFF-TYPES — снять стабы после регенерации типов

**Ветка:** та же `feat/r2-signoff`. **Отдельный коммит** поверх коммита спринта. Миграций нет.

Контекст: гейт применил **083** и **084**, Олег прогнал реген CLI
(`npx supabase gen types typescript --project-id uoiavcabxgdjugzryrmj > src/types/supabase.gen.ts`).
Пока apply не прошёл, `checklist_templates` / `project_checklists` / `toggle_checklist_item`
в автогенерации отсутствуют, поэтому в коде спринта стоят **леса**: локальный стаб схемы в
хуке и рукописные Row-типы в `types/database.ts`. Этот фикс их убирает.

**Трудоёмкость: ~1 ч. Риск низкий.** Задача чисто типовая: снять леса, ничего не переписывая.

⚠️ **Реген делать CLI, не MCP.** MCP-реген не отдаёт блок `graphql_public`, который отдаёт CLI
→ в диф придут ~28 ложных удалений.

---

## РАЗВЕДКА

```bash
git branch --show-current                 # feat/r2-signoff
git status --short                        # ожидание: только M src/types/supabase.gen.ts
git --no-pager log --oneline -1           # feat(delivery): sign-off чеклисты внедрения (083, 084)

grep -c "graphql_public" src/types/supabase.gen.ts            # ожидание: 2 (реген полный)
grep -n "checklist_templates:\|project_checklists:" src/types/supabase.gen.ts | head
grep -n "toggle_checklist_item:" -A 8 src/types/supabase.gen.ts
grep -n "instantiate_project_checklists" src/types/supabase.gen.ts   # ожидание: ПУСТО (нет EXECUTE у authenticated)
grep -n "open_checklist_items" src/types/supabase.gen.ts             # ожидание: пусто (jsonb → Json, ключи не типизируются)

grep -n "DatabaseWithChecklists\|checklistClient" src/lib/hooks/use-project-checklists.ts
grep -n "ChecklistTemplateRow\|ProjectChecklistRow" src/types/database.ts
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. `grep -c graphql_public` вернул 0 → реген урезанный (MCP вместо CLI), **не** коммитить:
   попросить перегенерить через CLI.
2. `git status` содержит что-то кроме `supabase.gen.ts` → в дереве чужие правки, разобраться.
3. `checklist_templates` в gen-типах отсутствует → 083 не применена в том проекте, откуда
   генерились типы.
4. `tsc` красный **до** правок — зафиксировать текст ошибок в отчёте.

---

## Что снять

### 1. `src/lib/hooks/use-project-checklists.ts` — леса целиком

Удалить блок «Стаб схемы до регенерации»: `ChecklistTemplateRowDb`, `ChecklistTemplateInsertDb`,
`ProjectChecklistRowDb`, `ProjectChecklistInsertDb`, `DatabaseWithChecklists`,
`checklistClient()`. Вместо `checklistClient()` — `createClient()` во всех девяти местах;
`import type { SupabaseClient }` и `Database` из импортов убрать.

Сигнатуры `toTemplate` / `toChecklist` перевести на генерацию:

```ts
function toTemplate(row: Tables<'checklist_templates'>): ChecklistTemplate { … }
function toChecklist(row: Tables<'project_checklists'>): ProjectChecklist { … }
```

⚠️ **`type`, а не `interface`, если стаб зачем-то придётся вернуть.** postgrest-js 2.100
требует `Row extends Record<string, unknown>`, а `interface` неявной index signature не
получает — констрейнт `GenericTable` не выполняется, и `.insert()/.update()/.rpc()`
схлопываются в `never`/`undefined` с сообщением, которое на index signature не намекает
никак. На этом уже потерян час в самом спринте.

### 2. `src/types/database.ts` — рукописные Row заменить на `Tables<…>`

Убрать локальные `interface ChecklistTemplateRow` / `interface ProjectChecklistRow`, вывести
доменные типы из генерации (образец — `Segment` поверх `SegmentRow`):

```ts
type ChecklistTemplateRow = Tables<'checklist_templates'>;
type ProjectChecklistRow  = Tables<'project_checklists'>;
```

**Оставить как есть** (это прикладная схема jsonb, автогенерация её не знает):
`ChecklistType`, `ChecklistTemplateItem`, `ChecklistItem`, `OpenChecklistItem`, а также сами
`ChecklistTemplate` / `ProjectChecklist` (они уточняют `checklist_type` и `items` поверх Row).
Комментарий «СТАБ до регенерации» из шапки блока снять.

### 3. Проверить, что реген не сломал `delivery_kind`

В стабе `delivery_kind` был `string | null`, в домене — `'launch' | 'experiment' | null`
(каст в `toTemplate`). Автогенерация отдаст `string | null` (CHECK, не enum), так что каст
остаётся нужен — не «упрощать».

---

## VERIFY

```bash
npx tsc --noEmit && npm run lint      # ожидание: 0 ошибок из новых файлов
git --no-pager diff --stat            # ожидание: supabase.gen.ts + 2 файла кода
npm run build                          # последним, при убитом next dev
```

Плюс ручной смок в UI (типы — не поведение, но регрессия дешёвая):
отметить пункт чеклиста на внедрении → «кто и когда» появился; открыть модалку завершения →
блок обязательных пунктов на месте.

### Коммит

```
chore(types): реген после 083/084 — сняты стабы Checklist*/DatabaseWithChecklists
```
