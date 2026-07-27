# fix-S-R2-SEGMENTS-TYPES — снять стабы после регенерации типов

**Ветка:** та же `feat/r2-segments`. **Отдельный коммит** поверх `d9a9996`. Миграций нет.

Контекст: гейт применил **076** и **077**, Олег прогнал реген CLI
(`npx supabase gen types typescript --project-id uoiavcabxgdjugzryrmj > src/types/supabase.gen.ts`).
Диф регена проверен на гейте: **+57 строк, 0 удалений**, блок `graphql_public` на месте —
то есть это честный CLI-реген, а не урезанный MCP. `src/types/supabase.gen.ts` уже изменён
в рабочем дереве и **не закоммичен** — он входит в этот коммит.

**Трудоёмкость: ~1 ч. Риск низкий.** Задача чисто типовая: убрать леса, ничего не переписывая.

---

## РАЗВЕДКА

```bash
git branch --show-current                 # feat/r2-segments
git status --short                        # ожидание: только M src/types/supabase.gen.ts
git --no-pager log --oneline -1           # d9a9996 feat(r2): серверные сегменты…

grep -c "graphql_public" src/types/supabase.gen.ts          # ожидание: 2 (реген полный)
grep -n "segments:" src/types/supabase.gen.ts | head -3     # таблица появилась
grep -n "settings" src/types/supabase.gen.ts | head -5      # organizations.settings: Json

grep -n "DatabaseWithSegments\|segmentsClient" src/lib/hooks/use-segments.ts
grep -n "as unknown as\|as never" src/lib/hooks/use-org-settings.ts src/lib/hooks/use-segments.ts
sed -n '470,530p' src/types/database.ts                     # блок стабов
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. `grep -c graphql_public` вернул 0 → реген урезанный (MCP вместо CLI), **не** коммитить:
   сказать Олегу перегенерить через CLI.
2. `git status` содержит что-то кроме `supabase.gen.ts` → в дереве чужие правки, разобраться.
3. `segments` в gen-типах отсутствует → миграция 077 не применена в том проекте, откуда
   генерились типы.
4. `tsc` красный **до** правок — зафиксировать текст ошибок в отчёте, они пригодятся.

---

## Что снять

### 1. `src/lib/hooks/use-segments.ts` — леса целиком

- Удалить локальный тип `DatabaseWithSegments` и функцию `segmentsClient()`.
- Вместо `segmentsClient()` — обычный `createClient()`.
- Снять сопутствующие `as unknown as SupabaseClient<…>`.
- Комментарий в шапке про «таблица объявлена локальным стабом… после регенерации стаб
  удаляется» — тоже убрать, он станет неправдой.

### 2. `src/types/database.ts` — стаб строки таблицы заменить на производный тип

**Оставить как есть** (это доменные надстройки над `Json`, а не дубли gen-типов):
`OrgSettings`, `SegmentEntity`, `SegmentOp`, `SegmentClause`, `SegmentPredicate`.

**Переписать** интерфейс `Segment`: сейчас это ручной слепок строки таблицы, который будет
молча разъезжаться с БД при каждой следующей миграции. Вывести из gen-типа, сохранив
доменное уточнение двух jsonb/text-полей:

```ts
type SegmentRow = Database['public']['Tables']['segments']['Row'];

export interface Segment extends Omit<SegmentRow, 'entity' | 'predicate'> {
  entity: SegmentEntity;          // в БД text + CHECK, в домене — union
  predicate: SegmentPredicate;    // в БД jsonb → Json, в домене — AST
}
```

Так форма строки (новые колонки, nullability) приходит из регена, а типизация предиката
остаётся доменной. Если импорт `Database` в `database.ts` создаёт цикл — вывести `SegmentRow`
там, где он используется, но **не** возвращать ручной слепок.

### 3. `src/lib/hooks/use-org-settings.ts` — снять лишние касты

После регена `organizations.settings` типизирован как `Json` (NOT NULL), поэтому:

- чтение: `data?.settings` больше не требует `as unknown as { settings?: unknown }` —
  `parseOrgSettings` принимает `unknown`, отдаёт `OrgSettings`;
- запись: `.update({ settings: merged as unknown as Json })` — каст к `Json` **оставить**
  (домен → jsonb), но `as never` на объекте апдейта снять, он был из-за отсутствия колонки.

### 4. Ожидаемые грабли (из learnings скилла)

- Реген типизирует jsonb как `Json`, а не доменным типом → точечный `as unknown as <T>` в
  местах записи. **Точечный**, не глобальный `any` и не `@ts-expect-error` на блок.
- `.refine()` на Zod-схеме даёт `ZodEffects` и теряет `.shape`/`.extend` — если всплывёт при
  правке валидаторов, использовать `superRefine` либо refine на самом внешнем уровне.
- `any` запрещён; для внешних payload — `unknown` + guard.

Валидаторы (`org-settings.ts`, `segment.ts`) и `segment-eval.ts` **не трогать** — они работают
с доменными типами и от регена не зависят.

---

## VERIFY / коммит

```bash
npx tsc --noEmit                                        # 0
npx eslint src/lib src/components/shared src/components/settings src/components/projects   # 0 в своих файлах
npx vitest run tests/unit/segment-eval                  # 36 кейсов зелёные (не должны были поехать)
npm test                                                # полный прогон, ожидание 281 passed
grep -rn "DatabaseWithSegments\|segmentsClient" src/    # пусто
grep -rn ": any" src/lib/hooks/use-segments.ts src/lib/hooks/use-org-settings.ts src/types/database.ts  # пусто
git --no-pager diff --stat
```

`npm run build` — **последним и только если убит `next dev`** (грабля из CLAUDE.md: билд при
живом dev-сервере убивает dev). Если dev нужен — билд пропустить и сказать об этом в отчёте.

Коммит один, в него входит и реген:

```
chore(types): реген после 076/077 — сняты стабы Segment*/DatabaseWithSegments
```

**Не пушить.** В отчёте: какие именно касты остались и почему (ожидаю только домен→`Json`
на записи), не поехали ли vitest-кейсы, и полный текст любых ошибок `tsc`, которые пришлось
гасить точечно.
