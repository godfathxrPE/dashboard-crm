# Ревью: S-PROJECT-WORKSPACE-1 — заметки проекта + comment к файлам

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `51581bc`; baseline RLS, ProjectFiles, DealFocusPanel, ProjectDetail)  
**Объект:** `_analysis/sprint-S-PROJECT-WORKSPACE-1.md` — reuse `projects.pinned_note` + миграция **064** `project_files.comment`  
**Контекст:** W1c Focus panel (pinned_note); project_files own-user RLS; 061–063 в репо; **064 свободен**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| WHY / границы v1 (shared text, canManage write) | ✅ |
| `pinned_note` уже на projects, UI только client DealFocusPanel | ✅ |
| Файлы уже `created_at DESC` — не трогать | ✅ |
| Миграция только 064 comment nullable | ✅ |
| Нумерация **064** (063 есть) | ✅ |
| Process: CC write, gate apply, deploy after apply | ✅ |
| Upload API + ProjectFiles UI comment | ✅ |
| Notes area: delivery/internal, not client (no dup) | ✅ |
| Place before ProjectFiles ~L804 | ✅ |
| `useUpdateProject` already in ProjectDetail | ✅ L164 |
| `InlineEdit as="textarea"` exists | ✅ |
| RLS: comment column covered by existing own+org | ✅ (own files) |
| «Команда видит заметки» vs projects_select baseline | 🟡 **W1** |
| canManage vs `projects_update` (created_by) | 🟡 **W2** |
| project_files own-only (team не видит чужие файлы/комменты) | 🟡 **W3** |
| handleFiles stale `comment` in useCallback | 🟡 **W4** |
| Semantic: «Заметки» vs client «Закреплено» same column | 🟡 **W5** |
| schema.md docs NEXT | 🟡 **W6** |
| crm-architect / no apply from CC | ✅ |

**Оценка: 8.5/10.** Сильный scope-control (reuse pinned_note, одна nullable-колонка). HOW совпадает с live. Блокеров на код-пути нет; RLS/visibility — осознанные WARNING для гейта.  
**Рекомендация:** **GO для CC** (после опциональной правки W4 в HOW). Apply 064 **до** деплоя фронта.

---

## Статус (репо)

| Заход | Live |
|-------|------|
| `projects.pinned_note` | ✅ baseline L1849; comment W1c |
| DealFocusPanel pinned InlineEdit | ✅ L120–126; mount client open L649 |
| ProjectFiles upload `mutate(file)` | ✅ L32; no comment |
| order `created_at DESC` | ✅ `use-project-files.ts` L25 |
| project_files Row types | ✅ no `comment` |
| ProjectDetail L804 ProjectFiles | ✅; updateProject L164; canManage L247 |
| 063 roles expand | ✅ file present |
| 064 | ❌ отсутствует |
| project_files RLS | ✅ single policy: org + **user_id = auth.uid()** (ALL) |
| projects_update | ✅ owner/admin ∨ **owner_id** (не created_by); 054 +WITH CHECK org |

---

## Разведка (факт vs спринт)

| Утверждение | Live |
|-------------|------|
| pinned_note на projects, editor only DealFocusPanel | ✅ |
| files sorted DESC | ✅ |
| only mig = comment | ✅ |
| supabase.gen project_files ~1587 | ✅ L1587+ |
| DealFocusPanel 114–128 pattern | ✅ |
| ProjectDetail has updateProject / canManage | ✅ |
| InlineEdit textarea | ✅ no readOnly prop — read path = plain `<p>` (sprint OK) |

---

## С чем согласен полностью

### 1. Reuse pinned_note — no notes migration
Колонка уже tenant-wide на projects. Shared text v1 без chat-таблицы — правильный MVP.

### 2. Write boundary canManage
All-team edit = projects UPDATE RLS expand — rightly NEXT. Client gate mirrors Team/columns.

### 3. File chronology already done
Не трогать order.

### 4. 064 additive nullable
Existing rows NULL; policies unchanged; gen patch + gate regen.

### 5. UI placement
delivery/internal notes before files; client keeps DealFocusPanel only — no double editor.

### 6. Deploy order W5
Front insert(comment) after apply 064 — critical and stated.

---

## Блокеры

Нет (для заявленного v1 scope).

---

## Предупреждения

### W1. «Команда видит заметки» — проверить SELECT на live

Спринт: видимость автоматом, т.к. pinned_note на projects.

Baseline `projects_select` (L3607): org + (**owner/admin** ∨ **owner_id** ∨ **created_by**) — **без** `project_members` и без org-wide manager.

Если live = baseline, рядовой implementer **не SELECT’ит** проект → не откроет деталку и не увидит заметки.  
Если в проде команда уже открывает delivery — live policy шире (drift) или участники = owner/admin.

**Гейт:** смок от профиля project_member (не owner): видит ProjectDetail + read-only notes. Если 0 rows — это **не** этот спринт (отдельный RLS visibility), но WHY «для команды» не выполнится.

### W2. canManage ⊃ projects_update

```ts
// canManageDeliveryProject: owner|admin|owner_id|created_by
// projects_update:           owner|admin|owner_id   (нет created_by)
```

UI покажет InlineEdit canManage=true для created_by-only → mutate → 42501.  
Pre-existing (Team/шаблон тот же контракт). Smoke: owner/admin/owner_id. Не чинить RLS в этом спринте, если не всплывёт.

### W3. project_files = own-only

Policy: `auth.uid() = user_id` на SELECT/INSERT/UPDATE/DELETE.

- Коммент виден **загрузчику** (и тем, кто видит его строки = только он).  
- Коллега **не** видит чужие файлы и их comment.  
Спринт честно «existing RLS covers column» — да. Продукт «комментарий для команды» ≠ shared file library. NEXT: org/project-scoped file SELECT, если нужно.

### W4. Stale closure on comment

```tsx
const handleFiles = useCallback((fileList) => {
  ...
  upload.mutate({ file, comment });
}, [upload]); // ← comment must be in deps
```

Без `comment` в deps — upload с пустым comment после ввода. HOW: deps `[upload, comment]` или читать comment через ref.

### W5. Два UX-лейбла одной колонки

Client: «Закреплено» (DealFocusPanel). Delivery/internal: «Заметки проекта».  
Один `pinned_note` — ок; не путать с двумя полями в БД. Если когда-нибудь client→delivery spawn копирует note — ожидаемо.

### W6. schema.md +064
NEXT / S-DOCS-SYNC — ок.

### W7. (nit) Batch comment
Один comment на все файлы батча — documented; placeholder ok.

### W8. (nit) Optional edit comment
v1 without update mutation — ok; only insert path.

---

## Пропущенные места

| Файл | Действие |
|------|----------|
| `064_project_files_comment.sql` | ADD COLUMN |
| `supabase.gen.ts` project_files | comment Row/Insert/Update |
| `use-project-files.ts` | mutate shape + insert |
| `ProjectFiles.tsx` | input + display + clear; **W4 deps** |
| `ProjectDetail.tsx` | notes block + StickyNote import |
| Other upload call sites | only ProjectFiles uses useUploadProjectFile ✅ |

---

## Предлагаемые правки в спринт

1. **W4:** явные deps `handleFiles` / `comment`.  
2. **W1/W3:** 2 строки в EDGE/смок: member read notes; file list own-only (expected).  
3. (опц.) empty comment → null (уже `comment \|\| null`).

---

## Чеклист перед CC

- [ ] 064 free (`list_migrations` at gate)  
- [ ] CC **не** apply  
- [ ] Types patch + insert comment  
- [ ] Notes: `(isDelivery \|\| type==='internal')`, not client  
- [ ] canManage write / else read-only `<p>`  
- [ ] handleFiles includes comment in deps  
- [ ] `npx tsc --noEmit`  
- [ ] Gate: apply 064 → gen types → smoke notes + file comment → advisors  
- [ ] Deploy front **after** apply  

---

## Итог

Спринт аккуратный: максимум ценности при одной миграции и reuse pinned_note.  
**GO для Claude Code.** Гейту — visibility notes for members (W1) и explicit own-files behavior (W3).
