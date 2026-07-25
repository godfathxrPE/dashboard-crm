# Ревью: event-modal-autofill-open (автоподстановка при open)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `4ce54d7`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-event-modal-autofill-open.md` — автоподстановка company+project при открытии Call/Meeting modal с `defaultContactId`  
**Контекст:** продолжение polish (`2b9b8fc`, 2026-07-08); follow-up уже влит как `9b9a7b7` (2026-07-08) — message **байт-в-байт** как в секции «Коммит» спринта. Связанное ревью: `_analysis/review-sprint-event-modal-polish.md` (уже помечает этот follow-up DONE).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА есть | ✅ |
| РАЗВЕДКА актуальна vs live | ❌ устарела — код уже с derive + open-effect |
| Проблема 1 (open + `defaultContactId` → company) | ✅ уже решена |
| Проблема 2 (project never autofilled) | ✅ уже решена |
| Пути файлов | ✅ `calls/CallModal`, `meetings/MeetingModal`, `src/lib/forms/` |
| Schema / миграции | ✅ N/A (ноль SQL, ноль AI) |
| Имена связей (contact_company, projects.contact_id) | ✅ верные (с оговоркой про `stage` vs `status`) |
| Scope / «не трогать» | ✅ корректны |
| Коммит-scope | ✅ совпал с фактическим `9b9a7b7` (3 файла) |
| Learnings «После» | 🟡 формулировка в `learnings.md` **не** внесена |
| Готовность к повторному запуску в CC | ❌ **не запускать** |

**Оценка: 3/10 как живой handoff** (задачи выполнены; как историческая заметка — ок, дизайн верный).  
**Рекомендация:** **не запускать в Claude Code.** Работа уже в `main` с 2026-07-08. Пометить спринт DONE / архивировать; опционально дописать learning одной строкой.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| ЗАДАЧА 1: `deriveFromContact` util | ✅ `src/lib/forms/derive-links.ts` (создан в `9b9a7b7`) |
| ЗАДАЧА 2.1: change-handler + project | ✅ `CallModal` 89–101, `MeetingModal` 57–71 |
| ЗАДАЧА 2.2: open-effect после reset | ✅ `CallModal` 127–139, `MeetingModal` 99–111 |
| Гейты: edit never / only empty / explicit defaults | ✅ edit early-return; `!getValues(...)` перед `setValue` |
| ЗАДАЧА 3 (опц.): `defaultCompanyId` в CallModal из хаба | ⚪ не сделано (допустимо: in-modal derive покрывает) |
| Learning «После» | 🟡 нет в `learnings.md` |
| Коммит из спринта | ✅ `9b9a7b7` — ancestor of `main` |

---

## С чем согласен полностью

### 1. Диагноз root-cause был верный
`defaultContactId` → `reset({ contact_id })` **не** вызывает `Controller.onChange` → прежний `handleContactChange` (только company, только manual) не срабатывал. Это классическая RHF-ловушка; open-path нужен отдельно.

### 2. Архитектура решения верная
Чистая `deriveFromContact` + тонкий `applyDerived` на call-site (change **и** open) — лучше, чем дублировать фильтры в двух модалках. Путь `src/lib/forms/derive-links.ts` (рядом с validators, не в `timeline/`) — уместен.

### 3. Правило «ровно один кандидат»
0 или >1 company/project → поле не трогаем. Совпадает с live:

```49:57:src/lib/forms/derive-links.ts
  const links = deps.contacts?.find((c) => c.id === contactId)?.companies ?? [];
  if (links.length === 1) result.company_id = links[0].company_id;
  // ...
  if (active.length === 1) result.project_id = active[0].id;
```

`useContacts` уже тянет `companies:contact_company(...)` — данные для derive есть.

### 4. Гейты
- editCall/editMeeting → open-effect `return` сразу, ref сбрасывается.  
- `setValue` только если `!getValues('company_id'|'project_id')` — explicit `defaultCompanyId` / `defaultProjectId` и ручной выбор не перетираются.  
- Обратное «project→company» / фильтр контактов по компании — out of scope (правильно).

### 5. Scope и commit list
Ноль схемы, ноль хуков данных, только Call/Meeting + util. Фактический `9b9a7b7` = ровно:
- `src/components/calls/CallModal.tsx`
- `src/components/meetings/MeetingModal.tsx`
- `src/lib/forms/derive-links.ts`

### 6. ContactDetailHub wiring (как в РАЗВЕДКЕ)
Live `ContactDetailHub.tsx:587–589`:
- `CallModal` — **только** `defaultContactId={contactId}`  
- `MeetingModal` / `TaskModal` — ещё `defaultCompanyId={primaryCompany?.company_id}`  

После фикса CallModal действительно сам выводит company/project — опц. ЗАДАЧА 3 не обязательна.

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже выполнен — повторный запуск в CC вреден

| Доказательство | Значение |
|----------------|----------|
| Коммит | `9b9a7b7` (2026-07-08 11:54 +0300) |
| Message | идентичен секции «Коммит» спринта |
| Ancestor of HEAD | да (`main`) |
| Файлы | 3/3 на месте, логика соответствует задачам 1–2 |

Если CC прогонит промпт «как есть» (sed-диапазоны 58–120 / 34–75 описывают **до**-состояние): риск переписать `applyDerived`/open-effect, сломать ref-гейт или дублировать util.

**Действие:** не запускать. Статус: **DONE**.

### B2. РАЗВЕДКА описывает устаревшее состояние

Команды спринта:

```bash
sed -n '58,120p' src/components/calls/CallModal.tsx
sed -n '34,75p' src/components/meetings/MeetingModal.tsx
```

Live на этих диапазонах уже **после** фикса:
- import `deriveFromContact` (`CallModal:14`, `MeetingModal:14`)
- `applyDerived` + `handleContactChange` с project
- отдельный open-effect + `derivedForRef`

Комментарий спринта «автоподстановки ПРОЕКТА нет вообще» / «только на ручной выбор» — **ложный** относительно `main` 2026-07-16.

---

## Предупреждения (желательно исправить)

### W1. Неточность: активный проект = `stage !== 'lost'`

Спринт (РАЗВЕДКА + сигнатура derive):

> активные = `stage !== 'lost'` (как linkedProjects в хабе)

**Live-факт:**
| Место | Предикат |
|-------|----------|
| `ContactDetailHub` `linkedProjects` (:171–172) | `p.contact_id === contactId && p.status !== 'lost'` (**status**, и **включает won**) |
| `deriveFromContact` default (:52–53) | `status !== 'won' && status !== 'lost'` |
| `CallModal` | `useIsProjectActive()` → `pipeline_stages.is_won/is_lost`, fallback status |
| `MeetingModal` projectOptions | `status !== 'won' && status !== 'lost'` (default derive совпадает) |

После **047** колонки `projects.stage` в БД **нет** (`schema.md`: DROP legacy stage). Упоминание `stage` в промпте — ловушка для CC, если бы спринт ещё был живой. В уже влитом коде — ок (status / is_won·is_lost).

Расхождение hub `linkedProjects` (won виден) vs derive (won не подставляется) — **осознанно лучше** для create-form: won-сделку в новый звонок обычно не кладём.

### W2. Learning «После» не записан
В `~/.claude/skills/crm-architect/references/learnings.md` нет вхождения `deriveFromContact` / «reset не триггерит onChange» / open-with-defaultContactId. Стоит одной карточкой (как просил спринт) — без перезапуска CC-кода.

### W3. Остаточный edge-case open-effect (не блокер спринта)
```ts
if (!cid || derivedForRef.current === cid) return;
applyDerived(cid);
derivedForRef.current = cid;
```
Комментарий: «ждём загрузки contacts/projects», но ref ставится **даже если** derive вернул пусто (кэш ещё пуст). Повторный прогон при `contacts`/`projects` load **блокируется**. На хабе контакта кэш обычно тёплый → главный UX-кейс ок; cold open (глубокая ссылка / slow network) может оставить company/project пустыми до ручного re-select. Если когда-нибудь полировать — ставить ref только при успешном derive **или** ключить ref по `(cid, contactsReady)`.

### W4. ЗАДАЧА 3 не сделана (осознанно optional)
`CallModal` в хабе по-прежнему без `defaultCompanyId`. Для Meeting — уже есть. Симметрия некритична: derive закрывает кейс «1 компания».

### W5. TaskModal вне scope — верно, но асимметрия остаётся
`TaskModal` принимает `defaultContactId`, **без** derive. Спринт явно не трогает — ок. Не регрессия этого fix.

---

## Пропущенные места

| Файл | Строки / факт | Действие при (гипотетическом) re-run |
|------|----------------|--------------------------------------|
| `src/lib/forms/derive-links.ts` | весь файл | **уже есть** — не создавать заново |
| `CallModal.tsx` | 89–101, 127–139 | **уже есть** open+change derive |
| `MeetingModal.tsx` | 57–71, 99–111 | **уже есть** |
| `ContactDetailHub.tsx` | 587 | CallModal only `defaultContactId` — optional |
| `GlobalModals.tsx` | 37–55 | defaults с cmdk-ctx уже полные — не трогать |
| `TaskModal.tsx` | — | out of scope |

Ложных «забытых» call-sites для Call/Meeting create-from-contact: нет. Главный gap спринта (open path) закрыт.

---

## Предлагаемые правки в спринт

1. **Шапка:** `Status: DONE (9b9a7b7, 2026-07-08)` — не отдавать в CC.  
2. Либо удалить/перенести в `_analysis/_to_delete/` как выполненный handoff.  
3. Не править код «по этому спринту»; learning — отдельным docs-коммитом при желании.  
4. Если когда-нибудь писать **новый** polish open-race (W3) — отдельный мини-спринт с актуальной РАЗВЕДКОЙ, не этот файл.

---

## Чеклист crm-architect (condensed)

- [x] Есть РАЗВЕДКА (но выводы устарели vs live)
- [x] Реальные таблицы/колонки: `contact_company.company_id`, `projects.contact_id` (не `stage`)
- [x] Реальные пути: `components/calls|meetings/*Modal` (не `components/modals/`)
- [x] learnings gotchas: modal paths ✅; open/reset pattern — **ещё не записан**
- [x] SQL/migrations: N/A
- [x] org_id / RLS: N/A (клиентский form-only)
- [x] SECURITY DEFINER: N/A
- [x] No `flowType: 'implicit'`: N/A
- [x] DELETE/CASCADE: N/A
- [x] CSS: N/A
- [x] schema.md update: N/A

---

## Чеклист перед CC

- [x] ~~Прогнать РАЗВЕДКУ~~ — прогнано: fix **уже** в дереве  
- [ ] **Не запускать** этот промпт в Claude Code  
- [ ] Пометить `_analysis/sprint-event-modal-autofill-open.md` как DONE (или архив)  
- [ ] (Опц.) Добавить learning про reset ≠ onChange + empty-only + edit-exclude  
- [ ] (Опц., отдельно) W3 race ref — только если воспроизведётся cold-cache в UI  

**Итог:** дизайн спринта был правильным и **уже реализован** коммитом `9b9a7b7`. Повторный прогон — регрессионный риск без выгоды.
