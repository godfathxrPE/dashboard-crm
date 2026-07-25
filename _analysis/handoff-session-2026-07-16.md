# Session Handoff — dashboard-crm, Волна 2 (2026-07-16, конец сессии Cowork)

**Точка входа для нового чата.** Полный статус — в `claude/wave2-progress.md` (читай первым, он канонический). Здесь — где мы стоим и что решать дальше.

## Процесс (как работаем)
- **CC (Claude Code на Маке `~/Downloads/dashboard-crm`)** пишет код и делает git/build. **Cowork (этот ассистент)** готовит промты-спринты, гейтит по **живой ФС** (не по докладу), исполняет **миграции через Supabase MCP** и **смок прода через Chrome**.
- Стек незыблем: Next 15 + TS strict + Tailwind (6 тем) + Supabase + Netlify.
- **Промты спринтов** → репо `_analysis/*.md` (через мост) + дубль в Claude Project `claude/`.
- Прод: Supabase ref `uoiavcabxgdjugzryrmj`, сайт `rococo-quokka-4ae212.netlify.app`, репо `godfathxrPE/dashboard-crm`.
- **Git — только терминал Мака.** build — нативно (мост SWC arm64 не тянет). Смок — Chrome (я залогинен в сессии Олега; если Chrome не залогинен — смок делает Олег).
- Roadmap развития: `improvements/CRM-ROADMAP-projects-deals.md` (13 эпиков P1–P5).

## Сделано в этой сессии (всё задеплоено и сможено, прод HEAD = 6d86d37)
1. **S-LEGACY-STAGE-1 ЗАКРЫТ** — B2 (миграция `047`: DROP `projects.stage`/`deal_stage`/2 триггера/индекс) + B3 (d904172: regen типов, `STAGE_CONFIG`→`LEGACY_STAGE_LABELS`, снос мёртвых легаси-символов). Смок ✅.
2. **S-GANTT-VIEW-2 (drag) ✅** (6d86d37) — drag-to-resize/move баров правит `start_date`/`end_date`. Смок ✅ (move +7дн точно, resize, click→modal, no snap-back, 0× 23514). Детали — в wave2-progress.

## СЛЕДУЮЩИЙ ШАГ — решение Олега (на этом остановились)
Развилка, что готовить следующим:
- **(A) S-DEPS-1** — Gantt-зависимости: таблица `task_dependencies` (FS) + DAG-валидация + стрелки на Гантте, разблокирует critical path. **Режим /architect** (новая сущность + RLS + `org_id` + soft-delete). Roadmap §9.3 / P2. Это логичное продолжение Gantt-трека.
- **(B) Добить непокрытые кейсы VIEW-2** — засеять 1 временную задачу и проверить вживую: материализация deadline-only, drag вехи (`is_milestone`), clamp end<start, drag в day/month-зуме. (Всё код-верифицировано, но не гонялось на проде — нет данных.)
- **(C) Другой P1-эпик roadmap** (не Gantt): delivery health score, Deal Delivery Hub на won-сделке, Notes в EntityTimeline, Workflow MVP (S-WF-2 — «главный структурный разрыв» по §14).

Мой дефолт-совет: **A (S-DEPS-1)** — держим Gantt-трек, deps дают причинность (иначе Гант «картинка»). B — быстро и дёшево, можно сделать попутно.

## Backlog (не потерять)
- **stage_id-логгер** — после B2 `stage_change`-события НЕ пишутся (триггер дропнут, degraded-логгер убран). Историч. лента жива через `LEGACY_STAGE_LABELS`. Нужен спринт: логировать смену стадии по stage_id.
- **`docs/schema.md` дельта 047** (DROP stage/deal_stage/триггеры/индекс) + пере-снять скилловый `references/schema.md`.

## Ключевые грабли (карта — полная в wave2-progress «УРОКИ»)
- **Cache-key в оптимистике:** мутация патчит ИМЕННО queryKey потребителя (Гант читает `['tasks','board',projectId]`, не `['tasks']`) — иначе snap-back. VIEW-2 закрыл через `useUpdateTaskDates` (патчит оба ключа).
- **Write-path смок на проде:** снять исходники из БД → выполнить → верифицировать SQL → **restore к исходным** (не портить данные Олега).
- **Деструктив-миграция:** reads→writes→хвост-читатели→deploy+смок→DROP→cleanup; каждый деплой ДО след. шага. Гейтить DROP по всему `src/` + по явным `.select()`.
- **«unused» — по реальным вызовам, не по имени.** Реген типов теряет hand-edits (CLI без токена падает) → править точечно. `entities.ts` деривит — не трогать.
- **Gantt-фаза = `column_id`→`category='phase'`** (`isPhaseBoard`), НЕ `phase_group`. Даты на клиенте — `mskDateKey` + UTC-полдень (off-by-one).
- **Мост нестабилен** (отваливается/возвращается). `~/.claude/skills` мосту недоступен — скилл правит только CC.
- **Смены стадии:** `moveToStageId(id, stageId, opts?)`. **projects hard-delete. notifications — только триггеры.**

## Скилл / память
- Скилл `crm-architect` актуализирован (7/16): 6 тем/дефолт aura, no-Radix, modals-колокация, schema→046. Для dashboard-crm сверяться с ним.
- Канон статуса — `claude/wave2-progress.md`. Volna 1 — `claude/wave1-progress.md`.
