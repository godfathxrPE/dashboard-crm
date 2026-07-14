# Handoff: delivery-модуль «Проекты» — P1 закрыт (2026-07-11)

Для новой Cowork-сессии по dashboard-crm. Роль сессии: архитектор + гейт миграций
(CC пишет код по sprint-промптам из `_analysis/`, Cowork верифицирует по живому коду/БД,
применяет миграции через Supabase MCP + смоуки + advisors). Прод: `uoiavcabxgdjugzryrmj`.
Ветка: `feat/aura-theme` (локальная, НЕ задеплоена на Netlify).

## Состояние на момент handoff

**P1 delivery-модуля закрыт полностью.** Коммиты: `4c1f2ad` (B0 routing split) →
`8706399` (миграция+фича) → `005bf20` (UX-фиксы). tsc/build зелёные.
Миграция **035 применена на прод** (гейт: смоуки + advisors пройдены, гейт-фикс: REVOKE anon).
Ручной прогон Олега: частично (spawn-флоу до конца не прогнан на момент handoff).

### Ключевые решения (не пересматривать без причины)
- Роутинг: `/deals` = сделки (client), `/projects` = «Проекты» (delivery-канбан «Внедрение» + список «Внутренние»). Redirect-бэкстопы по `type` в обоих detail-роутах. Хелпер `projectHref(p)`.
- Модель: delivery = `projects.type='delivery'`, parent_deal_id (RESTRICT), delivery_kind (launch|experiment), do_url/do_external_id/do_synced_at, progress_done/total (пока не считаются).
- Состояние = `phase_group` слаги на стадиях project-пайплайнов: `initiated/planning/execution/completed` (Инициирован/Планируется/Исполняется/Завершён). Константы: `src/lib/constants/delivery-phases.ts` (единый источник; deal-слаги attraction/… в 6 файлах НЕ тронуты).
- ERP-пайплайн (8 стадий): Инициация→Планирование→Обследование→Моделирование→Проектирование→Разработка→Внедрение→Эксплуатация. Обследование = execution (billable, решение Олега). IIoT (7): Инициация→Подготовительный→БИТ.MDT→Оборудование→Запуск→Регулярные→Передача на поддержку.
- Статус delivery: только open/completed (без won/lost/on_hold/cancelled). «Завершить проект» — кнопка, не автопереход.
- CRM зеркалит 1С:ДО, не заменяет. Spawn: RPC `spawn_delivery_project(p_deal_id, p_kind)` — org-гард NULL-safe + ownership (owner/created_by или memberships owner/admin).
- `useProjects(scope)`: 'deals' | 'projects', scoped-кеши. `WonDeals.tsx` — общий раскрываемый список won в обоих бордах.

### Уроки (в learnings crm-architect при случае)
- `REVOKE FROM public` НЕ снимает default-грант anon у функций Supabase → всегда явный `REVOKE ... FROM anon` после `GRANT ... TO authenticated`.
- Роль-функций `user_role()` в БД НЕТ (миф из старых доков) — есть `current_org_id()` + таблица `memberships(profile_id, org_id, role)`; роли сейчас: только owner.
- Все delivery-стадии обязаны `is_won=false/is_lost=false` — иначе триггеры sync_* выставят status='won' и нарушат delivery_status_chk.
- `null_internal_stage` расширен: нулит legacy `stage` для internal И delivery.
- `database.ts` рукописный (кастомные хелперы) — полный regen через generate_typescript_types перезапишет их; CC дополняет вручную.

## Следующие шаги (по приоритету, выбирает Олег)

1. **Ручной прогон P1** (если ещё не): spawn с won-сделки → канбан /projects → drag 4 состояния → do_url → «Завершить проект»; раскрытие «Выиграно» в воронке и StageBoard.
2. **P2 delivery**: фазовая доска (колонки = фазы СДР, статус задачи = badge; `seed_project_columns` type-aware guard), шаблоны Запуск/Эксперимент (`delivery_templates`/`_tasks`; источники: pptx «Технология реализации проекта 1С v2.2» — ERP 6 этапов, слайды 9–15; СДР 1С:ДО — IIoT, раздел 7 `_analysis/delivery-process-DO.md`), `project_members` (3 роли: manager/implementer/installer), прогресс X/Y из задач.
3. **Деплой feat/aura-theme на Netlify** — ветка накопила rename+Cmd+K+B0+delivery; чем дольше, тем дороже первый деплой.
4. Отложено: синк docs/schema.md (17 tenant-таблиц), Telegram (S30), Contact AI rollups.

## Ключевые файлы
- `_analysis/architecture-delivery-projects.md` — D3-архитектура (v2+§8+§9 ФИНАЛ, мэппинги фаз).
- `_analysis/delivery-process-DO.md` — домен 1С:ДО (4 состояния, СДР, гейт «Передача на поддержку»).
- `_analysis/sprint-delivery-projects-p1.md` (v2) + `review-sprint-delivery-projects-p1.md` (Grok) + `sprint-delivery-p1-ux-fixes.md`.
- `docs/schema.md` — обновлён CC до 035.
- Grok используется как внешний ревьюер; его блокеры верифицировать по живому коду перед принятием (проверено: сильная стратегия, детали перепроверять).
