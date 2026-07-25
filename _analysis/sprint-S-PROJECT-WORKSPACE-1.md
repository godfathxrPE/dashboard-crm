# Claude Code Prompt — Sprint S-PROJECT-WORKSPACE-1: заметки проекта (команда) + комментарий к файлам

## WHY
Фидбек живого юза Олега: (п.6) область заметок по проекту, видимая всей назначенной команде; (п.9) при добавлении файла — поле комментарий, файлы в хронологическом порядке.

**Ключевое из разведки (экономит миграцию):**
- `pinned_note text` — это колонка на **`projects`** (миграция 017), есть у ВСЕХ типов проектов. UI-редактор сейчас только в `DealFocusPanel` (client). → Заметки команды = **переиспользуем `projects.pinned_note`**, миграция под заметки НЕ нужна. Видимость команде — автоматом (pinned_note на projects, команда видит проект).
- Файлы уже сортируются `created_at DESC` (`use-project-files.ts`) — **хронология п.9 уже выполнена** (свежие сверху). Не меняем без сигнала.
- Единственная миграция — **064: `project_files += comment text`** (п.9).

**Решения-границы (v1, зафиксировать):**
- Заметки — **один общий shared-текст** на проект (переиспользование pinned_note), НЕ многозаписевый фид с авторами (это ближе к чату F1 — отдельный эпик).
- Заметки: **редактирует `canManage`** (owner/admin/владелец проекта), **читает вся команда**. All-team-edit потребовал бы расширения projects UPDATE RLS на рядовых участников (scope creep + RLS-риск) — вынесено в NEXT.

## РАЗВЕДКА (до правок)
```bash
cd ~/Downloads/dashboard-crm
# project_files схема + RLS (own user_id + org):
grep -n "project_files" supabase/migrations/*.sql | grep -i "create table\|policy\|user_id\|comment" | head
grep -n "project_files:" src/types/supabase.gen.ts        # L~1587 — Row/Insert/Update блоки (правим руками, gen лагает)
# файлы UI + хук:
sed -n '1,120p' src/components/projects/ProjectFiles.tsx    # upload immediate; куда comment-инпут
grep -n "useUploadProjectFile\|insert(" src/lib/hooks/use-project-files.ts
# заметки:
sed -n '110,130p' src/components/projects/DealFocusPanel.tsx  # паттерн InlineEdit + updateProject({pinned_note})
grep -n "useUpdateProject\|updateProject" src/lib/hooks/use-projects.ts src/components/projects/DealFocusPanel.tsx | head
# раскладка ProjectDetail (куда area заметок):
grep -n "ProjectTeam\|ProjectFiles\|isDelivery\|canManage\|project.type" src/components/projects/ProjectDetail.tsx | head
grep -n "disabled\|readOnly\|as=\"textarea\"" src/components/**/InlineEdit.tsx 2>/dev/null || grep -rn "InlineEdit" src/components/shared/ | head
```

---

## ЗАДАЧА 1 — Миграция 064 (аддитивно: comment на файлах)
**Номер 064 сверить** (063 applied, гейт подтвердит `list_migrations`). **CC пишет+коммитит, НЕ применяет.**

`supabase/migrations/064_project_files_comment.sql`:
```sql
-- S-PROJECT-WORKSPACE-1: комментарий к файлу проекта (п.9).
-- Аддитивно: nullable-колонка, существующие RLS project_files (own user_id + org) её покрывают,
-- политики не меняются. Применяется гейтом.
ALTER TABLE public.project_files ADD COLUMN comment text;
```

**Gen-типы** (`src/types/supabase.gen.ts`, блок `project_files:` ~L1587) — patch руками (gen лагает до regen на гейте): в `Row` добавить `comment: string | null`, в `Insert` и `Update` — `comment?: string | null`. Гейт после apply прогонит `generate_typescript_types` и сверит.

## ЗАДАЧА 2 — Комментарий к файлу (п.9)
`src/lib/hooks/use-project-files.ts` — `useUploadProjectFile`:
- Сигнатуру мутации сменить `mutate(file)` → `mutate({ file, comment })` (`comment?: string`).
- В insert метаданных добавить `comment: comment || null`.

`src/components/projects/ProjectFiles.tsx`:
1. Стейт `const [comment, setComment] = useState('');`
2. Над drop-зоной — необязательный инпут:
   ```tsx
   <input value={comment} onChange={(e) => setComment(e.target.value)}
     placeholder="Комментарий к файлу (необязательно)"
     className="mb-2 w-full rounded-lg border border-input bg-surface px-3 py-1.5
                text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none" />
   ```
3. `handleFiles` → `upload.mutate({ file, comment })`; после загрузки батча `setComment('')`.
4. В строке файла под именем показать коммент, если есть:
   ```tsx
   {f.comment && <span className="block truncate text-[11px] text-text-mute" title={f.comment}>{f.comment}</span>}
   ```
   (перенести имя+коммент в колонку `flex-col`, чтобы коммент был под именем.)
5. (опц., если бюджет) inline-редактирование коммента на строке — отдельный `useUpdateProjectFileComment`. Не обязательно для v1.
- Порядок файлов оставить `created_at DESC` (хронология уже есть).

## ЗАДАЧА 3 — Заметки проекта для команды (п.6, БЕЗ миграции)
`src/components/projects/ProjectDetail.tsx` — добавить area заметок (переиспользуя `projects.pinned_note`), гейт `{(isDelivery || project.type === 'internal') && (…)}` (на client заметка уже в DealFocusPanel — не дублировать). Место — рядом с Командой/Файлами (напр. перед `<ProjectFiles>` ~L804).

Паттерн — как в `DealFocusPanel` L114–128:
```tsx
<div className="mb-4 rounded-xl border border-border bg-surface p-4">
  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-main">
    <StickyNote size={14} className="text-text-dim" /> Заметки проекта
  </div>
  {canManage ? (
    <InlineEdit as="textarea" value={project.pinned_note ?? ''}
      placeholder="Заметки для команды…"
      onSave={async (val) => { updateProject.mutate({ id: project.id, pinned_note: val || null }); }} />
  ) : (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-main">
      {project.pinned_note || <span className="text-text-mute">Заметок пока нет</span>}
    </p>
  )}
</div>
```
- `updateProject` — тот же хук `useUpdateProject`, что в DealFocusPanel (проверить импорт в ProjectDetail; добавить, если нет).
- `StickyNote` — из `lucide-react`.
- **RLS-заметка:** редактирование гейтится `canManage` (клиентски). На сервере `projects UPDATE` для delivery должен разрешать canManage (owner/admin/владелец) писать `pinned_note` — тот же путь, что client-заметка. Пометить `NOT_VERIFIED`, гейт проверит смоком (canManage сохраняет; рядовой участник — read-only, попытки записи нет).

## EDGE CASES
- Файл без коммента — строка без второй линии (коммент условный).
- Заметка read-only у рядового участника — textarea не рендерится, только текст.
- Мульти-загрузка: коммент применяется ко всему батчу (документировать плейсхолдером «к файлу» — ок для v1).
- Пустой pinned_note → «Заметок пока нет» / плейсхолдер.

## VERIFICATION LABELS
```
Type Safety:            WARNING (gen-типы project_files.comment пропатчены руками; regen на гейте сверит)
RLS Coverage:           WARNING (project_files.comment покрыт existing own+org; pinned_note UPDATE на delivery для canManage — NOT_VERIFIED, смок гейта)
Backward Compatibility: PASS (comment nullable аддитивно; заметки переиспользуют существующую pinned_note; порядок файлов не менялся)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```

## КОММИТ
```bash
git add supabase/migrations/064_project_files_comment.sql src/types/supabase.gen.ts \
        src/lib/hooks/use-project-files.ts src/components/projects/ProjectFiles.tsx \
        src/components/projects/ProjectDetail.tsx
git commit -m "S-PROJECT-WORKSPACE-1: заметки проекта для команды (pinned_note) + комментарий к файлам (миграция 064)"
git push
```
Гейт Cowork: `list_migrations` (064 свободен) → `apply_migration` 064 → `generate_typescript_types` (сверить comment) → смок (загрузка файла с комментом → коммент виден под именем; заметка: canManage пишет, рядовой — read-only) → `get_advisors`. **W5: фронт с новым insert(comment) не должен уйти в прод раньше apply 064** (иначе insert упрётся в отсутствующую колонку) — порядок apply→deploy.

## NEXT (флаг, не в этом спринте)
- **All-team edit заметок** — расширение projects UPDATE RLS на рядовых участников (сейчас v1: canManage пишет). Отдельное RLS-решение.
- **Многозаписевые заметки** (фид с авторами/таймстампами) — если понадобится, это ближе к S-CHAT-1 (F1), не pinned_note.
- Docs: schema.md +064 (project_files.comment) — S-DOCS-SYNC.
