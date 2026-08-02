# Ревью: S-R2-D3 — Карта стейкхолдеров сделки

**Дата:** 2026-08-02  
**Ревьюер:** Grok (верификация по коду `main` @ `6137faf`; migrations 001–091; `ProjectDetail`, `use-project-members`, baseline `contact_company` / `project_members`, Badge/Combobox)  
**Объект:** `_analysis/sprint-S-R2-D3-STAKEHOLDERS.md` — junction `deal_stakeholders`, миграция **092**, UI на карточке  
**Контекст:** R2 D3; primary = `projects.contact_id` без `is_primary` и без sync-триггера; образец `project_members` (037/archive + hook). Baseline: **585** tests ✅, lint claim 15/34.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Product: junction + role, primary не дублировать | ✅ |
| Нет sync-триггера на `projects` (automations) | ✅ |
| `contact_company.role` ≠ словарь сделок | ✅ (нет UPDATE policy — claim верен) |
| Hard delete, unique (project, contact) | ✅ |
| RLS org-first + initplan `(select …)` + UPDATE WITH CHECK | ✅ |
| Миграция **092** свободна (после 091) | ✅ |
| `BadgeColor` включает все 6 тонов | ✅ |
| Combobox / useContacts — reuse | ✅ |
| Primary UI: no delete, virtual row «указать роль» | ✅ |
| window.confirm / hardcode colors / out-of-scope | ✅ |
| РАЗВЕДКА path `037_*.sql` | 🟡 archive only |
| Grants/revoke + `TO authenticated` в SQL-сниппете | 🟡 |
| tsc до регена `supabase.gen.ts` | 🟡 |
| Placement «до Активности» vs Materials/Team | 🟡 уточнить |

**Оценка: 90/100 (GO).** Архитектура и scope честные; executable. Warnings — hygiene миграции и types до gate, не ломают модель.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC на `feat/r2-stakeholders` от `main` @ `6137faf`. Миграцию **не apply**.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| `main` HEAD | `6137faf` — совпадает со входом спринта |
| Миграции | 090, 091 есть; **092 free** |
| `deal_stakeholders` | нет |
| `use-project-members` / `ProjectTeam` | образец на месте |
| `Combobox` + `useContacts` | `src/components/shared/Combobox.tsx`, `ProjectModal` / StageTransition |
| `contact_company` policies | select/insert/delete only — **нет UPDATE** (baseline) |
| Review | не было (этот документ) |
| Tests | **585** passed |

---

## С чем согласен полностью

### 1. Primary = `projects.contact_id`, не `is_primary`

Скаляр читают карточка (`ProjectDetail:644-650`), completeness (`:99`), `use-projects`. Второй флаг = второй источник истины (урок phones). Primary **вычисляется**; строку primary из карты не удалять — менять поле «Контакт» сделки. Верно.

### 2. Нет триггера sync junction → projects

Любой UPDATE `projects` будит `trg_zz_run_automations` и stage-sync. Побочный эффект «добавил контакт → автоматизации» недопустим. Стойкость решения.

### 3. Роль — закрытый MEDDIC-словарь, nullable

`contact_company.role` — free text должности / мусор импорта, часто пуст; для D3 бесполезен. Nullable role избегает дефолт-«ЛПР». Второе измерение (stance) — правильно в бэклог.

### 4. Hard delete + unique

Прецедент `contact_company` / `project_members`. Soft-delete сломал бы unique.

### 5. RLS-матрица и manager-delete

org boundary first; write owner/admin/manager; viewer read-only. Manager delete шире `cc_delete` (owner/admin only) — осознанно, чтобы карта не копила мусор. UPDATE WITH CHECK — урок 054.

### 6. Образец хука `use-project-members`

Ключ = имя таблицы, `useRealtimeSync`, optimistic cancel/rollback/settled, `23505` human text, pure helper + unit tests — копировать форму, не изобретать.

### 7. UI

- Combobox + `useContacts`, company contacts сверху — как `ProjectModal:163-174`.  
- `Badge` + `BadgeColor` (red/accent/green/blue/purple/yellow — все есть).  
- Inline confirm, не `window.confirm`.  
- Peek / completeness / stance — out of scope, правильно.

### 8. Gate checklist

apply → advisors → role smokes (owner/manager/viewer/чужак/tamper) → CLI gen-types → schema.md — полный контур.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. РАЗВЕДКА: путь `037_*.sql`

В `supabase/migrations/` файла 037 нет — только  
`supabase/migrations/archive/037_delivery_members_progress.sql`  
(+ baseline). Команда `sed … 037_*.sql` упадёт. В спринт/CC: читать archive + live `use-project-members.ts` / policies в baseline.

### W2. Grants / `TO authenticated` в 092

Сниппет: RLS + policies, **без**  
`revoke all … from anon` + `grant select, insert, update, delete … to authenticated`  
(паттерн 077/083; Claude.md: 082 даёт default arwd authenticated, но явный revoke anon — норма).  
Policies без `to authenticated` (077 пишет явно). Добавить в 092 для единообразия и gate-advisors.

### W3. tsc до apply/регена

`.from('deal_stakeholders')` типизируется через `Database['public']['Tables']` из gen — таблицы ещё нет. Доменные типы в `database.ts` **не** открывают `.from`.  
CC-варианты до gate:  
- временное расширение `Database.public.Tables` в `database.ts` (Row/Insert/Update), снести/заменить после регена; **или**  
- узкий cast на query builder.  
В отчёте: «реген не выполнен — таблицы нет» + как обошли tsc.

### W4. Класс «роль не указана»

Спринт: `text-mute`. В UI проекта — `text-text-mute` (токен `text-mute` в tailwind → класс `text-text-mute`). Использовать `text-text-mute`.

### W5. Точка вставки в `ProjectDetail`

«Под инфо-гридом, до Активности». Между grid (~699) и вкладками активности (~792): **ProjectTeam** (delivery only), **Материалы** (collapsible).  
Рекомендация: сразу **после info-grid** (до Team/Materials) — стейкхолдеры видны без скролла; не прятать в Materials. Для client-сделки Team не рендерится — блок всё равно нужен.

### W6. Realtime `ADD TABLE`

068/некоторые миграции оборачивают в `DO $$ … IF NOT EXISTS publication …`. Голый `alter publication … add table` на re-apply падает. Одноразовый apply OK; для идемпотентности — guard как в 068.

### W7. Мелочи

- Select embed: `contact:contacts(…, phone, phones)` — колонки есть в gen; `phones` jsonb — UI может не показывать, лишний payload OK.  
- Zod `z.enum(STAKEHOLDER_ROLES).nullable()` — для form empty string может понадобиться preprocess; смотреть RHF.  
- Cross-org contact UUID: FK не проверяет `contact.org_id = project.org_id` — тот же класс, что другие junctions; RLS org на insert stakeholder. Accept.  
- `schema.md` — гейт (спринт OK); CC может не трогать.  
- RBAC UI: `role !== 'viewer'` — зеркало RLS; не путать с `canManageDeliveryProject` (ProjectTeam).

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| `ProjectDetail.tsx:99, 644-650, 629-698` | completeness + contact cell + info grid | primary UX; insert block after grid |
| `ProjectDetail.tsx:700-790, 792+` | Team / Materials / tabs | stakeholders **before** activity tabs |
| `use-project-members.ts` | optimistic + parseMemberError + groupMembersByRole | mirror → use-deal-stakeholders |
| `archive/037_…sql` / baseline pm_* | junction RLS + set_org_id | pattern (not live path 037_*) |
| `baseline contact_company` | cc_select/insert/delete, **no update** | backlog claim confirmed |
| `Combobox.tsx`, `use-contacts.ts`, `ProjectModal` contact filter | picker | reuse |
| `Badge.tsx` BadgeColor | 6 colors | STAKEHOLDER_ROLE_CONFIG |
| `tests/unit/project-members.test.ts` | pure helper tests | deal-stakeholders.test.ts |
| `068` realtime DO-block | idempotent publication | optional for 092 |

Пропусков scope нет. Peek/FocusPanel/completeness — сознательно out.

---

## Предлагаемые правки в спринт (необяз.)

1. РАЗВЕДКА: `archive/037_delivery_members_progress.sql`.  
2. 092: revoke anon + grant authenticated; policies `to authenticated`.  
3. HOW types: как открыть tsc до регена (Database extend).  
4. Placement: «сразу после info-grid».  
5. `text-text-mute`.

CC может закрыть W2–W5 без правки markdown.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА (commands; path 037 stale → W1)  
- [x] Real names / new table explicit in 092  
- [x] Real UI paths  
- [x] learnings: freeze_org_id, update_updated_at, no confirm, hard delete  
- [x] Migration file, not apply from CC  
- [x] org_id first; role via current_org_role initplan  
- [x] triggers set_org_id / freeze / updated_at  
- [x] No soft-delete  
- [x] CSS tokens / Badge only  
- [ ] schema.md — **gate** (задокументировано)  
- [ ] Explicit grants — **добавить** (W2)

---

## Чеклист перед CC

- [ ] Branch `feat/r2-stakeholders` from `6137faf`  
- [ ] `092_deal_stakeholders.sql` + grants + 4 policies  
- [ ] Domain types + constants + zod  
- [ ] Hook + sortStakeholders + unit tests  
- [ ] `DealStakeholders` after info-grid; primary rules  
- [ ] Combobox path named in report  
- [ ] tsc / lint Δ / test 585+ / build last  
- [ ] No migration apply; no gen until gate  
- [ ] Commit message as in sprint; no merge  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Product / data model | 25 | 25 |
| SQL / RLS | 25 | 22 |
| Frontend / hooks / tests | 25 | 23 |
| Scope / process / RAZVEDKA accuracy | 25 | 20 |
| **Итого** | **100** | **90** |

**Итог: 90/100 GO** — можно в Claude Code.
