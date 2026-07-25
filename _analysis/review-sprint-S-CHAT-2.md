# Ревью: Sprint S-CHAT-2 v2 — реакции на сообщения (068)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-reactions` @ `73f739d`; base `main` @ `35835d5`; crm-architect: schema.md / architecture.md / learnings.md)  
**Объект:** `_analysis/sprint-S-CHAT-2.md` (v2) — junction `message_reactions` + RLS/realtime + hook + UI-чипы  
**Контекст:** S-CHAT-1 (067) + S-CHAT-1.2 (пикер/токены) в main; v1-ревью (6.5/10, B1–B3) учтено в v2; skill schema.md: 067 applied, «следующая 068»; **CC-часть уже реализована** в ветке (миграция **не** применена)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА / якоря (main @ 35835d5) | ✅ пути, line anchors, grep-команды |
| Нумерация 068 / free slot | ✅ 067 последний chat; skill «следующая 068»; на main файла 068 нет |
| Data model (UNIQUE, CASCADE, hard-delete, set_org_id) | ✅ |
| RLS SELECT/INSERT = EXISTS → `project_messages` | ✅ паттерн ai_runs / «по сущности» |
| INSERT/DELETE own-only, no UPDATE, GRANT/REVOKE, `TO authenticated` | ✅ |
| `REPLICA IDENTITY FULL` + realtime publication (idempotent) | ✅ |
| Initplan `(SELECT …)` | ✅ |
| Типы stopgap (gen.ts + entities, не free interface) | ✅ B1 закрыт |
| Query key ↔ `useRealtimeSync` (underscore) | ✅ B2 закрыт |
| UI: SmilePlus вне canEdit/canDelete + свой picker state | ✅ B3 закрыт |
| Scope / CC не apply / гейт Cowork | ✅ |
| learnings (hard-delete, CASCADE, mirror visibility, stub-типы) | ✅ |
| RBAC-матрица (manager) | 🟡 чуть шире фактической RLS |

**Оценка: 9/10.** v2 закрывает все блокеры v1; SQL/RLS/клиентский контракт executable.  
**Рекомендация:** **промпт можно было запускать as-is** (и уже запущен). **Повторный CC не нужен.** Дальше — **гейт Cowork**: apply 068 + RLS-смок + advisors + regen + schema.md. Не мёржить в main до apply (learnings: migration-ветка).

---

## Статус (живой код)

| Заход | Статус в репо |
|-------|---------------|
| Ветка | `feat/chat-reactions` @ `73f739d` (1 commit поверх `main` @ `35835d5`) |
| `067_project_messages.sql` | ✅ в main; RLS/триггер/realtime как в разведке |
| `068_message_reactions.sql` | ✅ **файл** в ветке (= SQL задачи 1); **не** в `main`; apply — гейт |
| `src/lib/hooks/use-message-reactions.ts` | ✅ 149 LOC; API `useMessageReactions(projectId, messageIds)` + `useToggleReaction(projectId)` |
| Stub `message_reactions` в `supabase.gen.ts` | ✅ ~L1600–1649 + STOPGAP-комментарий |
| Алиасы `MessageReaction*` в `entities.ts` | ✅ L62–70; `Profile` существует (L6) |
| UI `ProjectChat.tsx` | ✅ SmilePlus для non-temp; чипы; `reactionPickerFor` / `reactionAnchorRef`; composer `emojiOpen` не шарится |
| `message_reactions` в живой БД / schema.md body | ❌ до гейта (ожидаемо) |
| Предыдущий review v1 | `_analysis/review-sprint-S-CHAT-2.md` **устарел** относительно v2 (v1: 6.5/10) |

Diff `main...HEAD` (5 файлов, +351/−5) **точно** совпадает с commit-list спринта.

---

## С чем согласен полностью

### 1. Модель и lifecycle
Junction `(message_id, user_id, emoji)` + `UNIQUE` + hard-delete как эфемерная сущность — паритет `project_messages` / `project_videos` (soft-delete инфраструктуры нет). CASCADE с сообщением; FK cleanup не client-side (learnings).

### 2. RLS «по сущности»
```sql
EXISTS (SELECT 1 FROM public.project_messages m WHERE m.id = message_reactions.message_id)
```
под RLS родителя — тот же класс, что `ai_runs` (030) и урок learnings «не дублировать owner/admin/member». SELECT/INSERT **не шире** чата; голый org-manager без ownership/membership **не** видит сообщения → не видит/не ставит реакции.

### 3. INSERT own + trigger hygiene
`user_id DEFAULT auth.uid()` + WITH CHECK `user_id = auth.uid()`; `org_id` через `trg_set_org_id`; клиент шлёт `{message_id, emoji}` — как messages (author/org не с клиента). `set_org_id` только при NULL (learnings) + WITH CHECK `org_id = current_org_id()` ловит tamper.

### 4. DELETE own-only, no moderation of others
Согласовано с матрицей и product-смыслом; CASCADE при delete message. UPDATE-политики/GRANT нет — верно.

### 5. Realtime
Идемпотентный `DO $$ … pg_publication_tables …` лучше голого `ALTER PUBLICATION` из 067. `REPLICA IDENTITY FULL` — правильный ответ на unreact DELETE под RLS (W2 v1).

### 6. Клиентский контракт v2 (B1–B3)
- **B1:** stub в `supabase.gen.ts` + aliases в `entities.ts`; `RelaxOrgId` сам ослабит `Insert.org_id`; free `interface` не предлагается.  
- **B2:** `['message_reactions', projectId]` + `useRealtimeSync('message_reactions')` → default key `['message_reactions']` префиксно инвалидирует (как `use-project-messages`, `use-realtime.ts` L105–109).  
- **B3:** SmilePlus **вне** `(canEdit\|\|canDelete)`; отдельный `reactionPickerFor` / `reactionAnchorRef`; composer `emojiOpen`/`emojiBtnRef` не трогать.

### 7. Якоря разведки (сверено с `main` @ 35835d5)
| Claim | Факт |
|-------|------|
| `project_messages` колонки/триггер | `067_project_messages.sql` L10–25 |
| SELECT: owner/admin OR ownership OR `is_project_member` | L32–45; manager **не** в списке |
| `useRealtimeSync` default `[table]` | `use-realtime.ts` L105–109 |
| `isTempMessage` / `temp-` | `use-project-messages.ts` L20–22 |
| `actions` = canEdit\|\|canDelete only | main `ProjectChat.tsx` ~L271–324 |
| composer `emojiOpen` ~L115, ~431+ | main подтверждено |
| `ChatEmojiPicker` + `EMOJI_CATEGORIES` | `ChatEmojiPicker.tsx`, `chat-emoji.ts` |
| `ProjectMessage` stubs gen+entities | main: gen ~L1600, entities L52–60 |
| skill «следующая 068» | schema.md L1184 |
| `--chat-own-bg` / `--chat-own-border` | `globals.css` L1564–1569 (6 тем) |

### 8. Scope / гейт
Только реакции; не треды/unread/вложения; не трогать contrast/composer S-CHAT-1.2; CC пишет+коммитит, apply+смок+regen+schema.md — Cowork. Верно.

### 9. Реализация 1:1 со спринтом
Файлы в ветке повторяют SQL/типы/hook/UI задачи 1–4; `tsc`-контракт stopgap-паттерна соблюдён; 23505 → silent success + invalidate в hook (L111–112).

---

## Блокеры (критично — исправить до запуска)

**Нет.** B1–B3 v1 закрыты в тексте v2 и в коде ветки.

---

## Предупреждения (желательно учесть на гейте / follow-up)

### W1. RBAC-матрица: org-`manager` завышен
Матрица даёт manager ✓ на React/Read/Unreact «как org-роль». Фактически видимость = EXISTS → `project_messages_select` = owner/admin **или** project ownership **или** `is_project_member` — **без** bare manager (065/067, learnings). SQL правильный; матрица вводит в заблуждение при смоке («manager любого проекта должен мочь» → 0 rows / 42501 — это **ожидаемо**). На гейте: смок manager **с** membership vs **без**.

### W2. Аналогия 23505 с deps/members неточна
`use-task-dependencies` / `use-project-members` на 23505 **тостроят/сообщают** «уже есть», а не silent success. Для toggle-реакций silent + invalidate — **лучший** UX; формулировку «как dep/members» можно поправить, поведение в коде оставлять.

### W3. `messageIds` не в `queryKey`
`queryKey: ['message_reactions', projectId]`, filter `.in('message_id', messageIds)`. При полной ленте без пагинации ок (`enabled: length > 0` + invalidate по realtime). Если позже появится page/limit — добавить `messageIds` (hash) в key или refetch при смене набора.

### W4. Select embed: `profiles` vs `profiles!user_id`
Спринт: `user:profiles(...)`. В коде: `user:profiles!user_id(...)` — безопаснее при нескольких FK. Для одной FK на profiles оба варианта ок; в промпте можно зафиксировать `!user_id` как в messages (`profiles!author_id`).

### W5. `useToggleReaction()` в API-описании без `projectId`
В тексте: `useToggleReaction()`; invalidate — `['message_reactions', projectId]`. Реализация корректно `useToggleReaction(projectId)`. Мелочь для читателя промпта.

### W6. Line anchors после реализации
«~L1600 project_messages» на main верно; в ветке stub реакций вставлен **перед** `project_messages` (gen L1600 = reactions). CC на чистом main — ок; повтор на грязной ветке — не ориентироваться на номера.

### W7. Emoji `char_length ≤ 16`
Пикер `EMOJI_CATEGORIES` — короткие glyphs; MVP ок (как W9 v1).

### W8. Hover-only controls (не регрессия)
SmilePlus в `opacity-0 group-hover` — тот же паттерн, что Pencil/Trash. Touch: элемент кликабелен при opacity-0, но discoverability слабая. Не блокер S-CHAT-2; follow-up a11y.

---

## Пропущенные места (grep)

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `supabase/migrations/068_message_reactions.sql` | ✅ в ветке, = задача 1 | гейт: apply |
| `src/types/supabase.gen.ts` | L1600–1649 stub | гейт: regen replace |
| `src/types/entities.ts` | L62–70 aliases | ок |
| `src/lib/hooks/use-message-reactions.ts` | полный | ок |
| `src/components/projects/ProjectChat.tsx` | reactions + SmilePlus + picker | ок |
| `src/types/database.ts` | не тронут (RelaxOrgId) | ✅ правильно |
| `docs/schema.md` + skill schema.md | нет `message_reactions` | **гейт** |
| Ложные «ещё N call-sites» | одна UI-точка: `ProjectChat` | — |

Пропусков файлов для scope реакций нет.

---

## Предлагаемые правки в спринт (опционально, не блокер)

1. В RBAC-матрице: manager → «только если видит сообщение (ownership / project member)», не org-wide.  
2. W5: «silent 23505 (toggle-специфика), не toast как deps».  
3. API: `useToggleReaction(projectId)`; select `profiles!user_id`.  
4. VERIFICATION-блок v2: статус «CC done @ 73f739d; Runtime NOT_VERIFIED until gate».

Правки **не** обязательны для гейта — код уже соответствует intent.

---

## crm-architect checklist

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column names  
- [x] Реальные file paths (типы gen+entities)  
- [x] learnings: CASCADE, initplan, hard-delete, stub-типы, merge-after-apply  
- [x] SQL file only; CC **не** apply  
- [x] org_id + RLS; role/visibility через parent EXISTS  
- [x] Нет новых SECURITY DEFINER → hardening N/A  
- [x] Нет `flowType: 'implicit'`  
- [x] DELETE = own row / CASCADE, не client orphan cleanup  
- [x] CSS variables / chat tokens  
- [ ] schema.md после apply — **на гейте** (в спринте указано)  
- [x] Type stopgap executable (B1 closed)

---

## Чеклист перед CC / гейтом

### CC (промпт)
- [x] B1–B3 / W1–W8 v1 вшиты  
- [x] Ветка `feat/chat-reactions` от main @ ≥ `35835d5`  
- [x] Миграция **только файл**, без apply  
- [x] Commit list: 068 + gen + entities + hook + ProjectChat  

### Уже сделано в репо
- [x] Реализация S-CHAT-2 на `73f739d`  
- [ ] `tsc` / `build` — прогнать на гейте после regen (stopgap должен быть чистым и сейчас)

### Гейт Cowork (следующий шаг)
- [ ] Ревью diff + 068  
- [ ] `apply_migration('068_message_reactions')`  
- [ ] RLS-смок: participant INSERT ok; дубль → **23505**; DELETE own ok; DELETE чужой → **0**; outsider SELECT **0** / INSERT **42501**; tamper org_id/user_id → WITH CHECK fail; **manager без membership** → deny (W1)  
- [ ] `pg_publication_tables` ∋ `message_reactions`; `relreplident = 'f'` (FULL)  
- [ ] `get_advisors` — без новых WARN  
- [ ] `generate_typescript_types` → replace stopgap; `tsc`  
- [ ] schema.md (docs + skill): секция `message_reactions` (068), realtime, RLS «по сущности»  
- [ ] **Не** мёржить в main до apply

---

**Итог:** v2 — production-grade handoff; блокеров нет. Код ветки соответствует спринту. Осталось гейт-apply и документация схемы, не переписывание промпта и не повторный CC.
