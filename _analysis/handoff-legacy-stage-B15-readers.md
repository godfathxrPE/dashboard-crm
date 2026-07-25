# Claude Code — S-LEGACY-STAGE-1 · B1.5: миграция читателей `p.stage` → stage_id/status/phase_group (перед DROP)

**Почему:** Фаза A вычистила читателей `projects.stage` только в `components/projects/`. Ещё **7 читателей** живут в
`widgets/`/`analytics/`/`shared/`/`contacts/` и кормятся из `useProjects()`→`PROJECT_COLUMNS`. Убрать `stage` из
select'а без их миграции = **тихо неверные данные** (tsc не ловит, тип `Project.stage` ещё в supabase.gen). Это
недочищенный хвост Фазы A и **блокер DROP** (B2 нельзя, пока задеплоен явный select `stage` ИЛИ живой читатель).

**После B1.5: коммит → пуш → нативный build → деплой → смок прода → доклад Cowork → B2 (DROP).** БД не трогаем.
Маппинги сверены по живой БД (deal-пайплайны erp+iiot: phase_group ∈ attraction/working/approval/closing, 1:1 к воронке).

## A. Общий резолвер stage_id → стадия (реюз в читателях)
В `lib/hooks/use-pipelines.ts` добавить (рядом с `usePipelineStages`):
```ts
import { useMemo } from 'react';
export function useStagesMap(): Map<string, PipelineStage> {
  const { data: stages } = usePipelineStages();
  return useMemo(() => new Map((stages ?? []).map((s) => [s.id, s])), [stages]);
}
```
В `lib/utils/stage-track.ts` добавить (рядом с `trackFromPhaseGroup`) — **1:1, verified по БД**:
```ts
import type { Phase } from '@/lib/validators/project';
export function phaseFromPhaseGroup(pg: string | null | undefined): Phase | null {
  switch (pg) {
    case 'attraction': return 'attract';
    case 'working':    return 'develop';
    case 'approval':   return 'negotiate';
    case 'closing':    return 'close';
    default:           return null;
  }
}
```

## B. FunnelWidget (`components/widgets/FunnelWidget.tsx`) — ФУНКЦИОНАЛЬНО
Строка ~15: `active.filter((p) => p.stage && getPhaseForStage(p.stage) === phase)` →
```tsx
const stagesMap = useStagesMap();
// ...
const items = active.filter((p) => phaseFromPhaseGroup(stagesMap.get(p.stage_id ?? '')?.phase_group) === phase);
```
Импорты: убрать `STAGE_CONFIG, getPhaseForStage`; оставить `phases, PHASE_CONFIG, Phase` (лейблы/цвета воронки не меняются — поведение сохранено). Смок: воронка снова считает сделки по фазам (не 0).

## C. WeeklyReview (`components/analytics/WeeklyReview.tsx`) — ФУНКЦИОНАЛЬНО
Строки ~36-37:
```tsx
// «выиграно за неделю» — status (истина из stage_id), дата закрытия точнее updated_at
const projectsWon = (projects ?? []).filter(
  (p) => p.type === 'client' && p.status === 'won' && inWeek(p.actual_close_date ?? p.updated_at));
// «двигались по воронке за неделю» — стадия входа этой недели (stage_entered_at пишет sync_project_stage при смене stage_id)
const projectsMoved = (projects ?? []).filter(
  (p) => p.type === 'client' && p.stage_entered_at != null && inWeek(p.stage_entered_at));
```
⚠️ Семантика `projectsMoved` чуть уточнилась: теперь это «реально сменили стадию на этой неделе» (по stage_entered_at), а не «обновлены + не new_lead». Это ТОЧНЕЕ (легаси-прокси врал). Включает и созданных на этой неделе (у них stage_entered_at=создание) — если надо строго исключать новых, скажи, добавим `order_index>первой`. `actual_close_date`/`stage_entered_at` уже в PROJECT_COLUMNS.

## D. Label-читатели (4) — КОСМЕТИКА, `p.stage` shortLabel → `stage_id`→имя
В каждом: `const stagesMap = useStagesMap();`, затем `p.stage ? STAGE_CONFIG[p.stage]?.shortLabel : '—'` →
`stagesMap.get(p.stage_id ?? '')?.name ?? '—'`. Убрать импорт `STAGE_CONFIG`.
- `components/contacts/ContactDetailHub.tsx:517`
- `components/shared/CommandPalette.tsx:187`  (`sub:` — `?? undefined` сохранить: `stagesMap.get(p.stage_id ?? '')?.name`)
- `components/contacts/ContactDetail.tsx:219`
- `components/widgets/DeadlineRadar.tsx:48`
⚠️ Имя из `pipeline_stages.name` полное (напр. «Подготовка КП»), а `shortLabel` был сокращён («Подг. КП») — метки станут чуть длиннее. Норм (реальное имя стадии). CompanyDetail НЕ трогать (у него stage_id-имя уже основное).

## E. Снять явный select `stage` из PROJECT_COLUMNS (`lib/hooks/use-projects.ts:~141`)
Убрать `stage,` из списка (оставить `stage_id`): `...contact_id, stage, budget...` → `...contact_id, budget...`.
(Timeline-select `use-entity-timeline.ts` уже поправлен в прошлом заходе — не трогать.)

## ПРОВЕРКА
```bash
grep -rn "\.stage\b\|STAGE_CONFIG\|getPhaseForStage" src/ | grep -v "stage_id\|stage_entered\|stage-track\|StageTrack\|// \|validators/project.ts:"  # ридеров p.stage не осталось
grep -n "stage," src/lib/hooks/use-projects.ts   # PROJECT_COLUMNS без bare stage
npx tsc --noEmit   # 0 (STAGE_CONFIG/DealStage/dealStages ещё живы — уйдут в B3 после regen)
# нативный build
```
Смок прода (ПОСЛЕ деплоя): **FunnelWidget** — воронка с ненулевыми фазами; **WeeklyReview** — «выиграно/двигались» считаются; **лейблы стадий** в ContactHub/CommandPalette/ContactDetail/DeadlineRadar — показывают имя стадии (не «—»); **список сделок + таймлайн** грузятся. БД не ругается (колонка stage ещё есть).

## КОММИТ / ПУШ / ДЕПЛОЙ
```bash
git add -A && git commit -m "refactor(stage): мигрировать читателей p.stage на stage_id/status/phase_group (B1.5, перед DROP)"
git push origin main   # после build; деплой обязателен ДО B2
```
**Дождаться Netlify Published + смок → доложить Cowork.** Тогда B2 (DROP триггеров+column+type) — я исполню через MCP, затем B3 (regen типов, снос DealStage/dealStages/STAGE_CONFIG).

## Заметка гейта (Cowork)
- **B2 (DROP) блокирован, пока задеплоены (а) явный select stage ИЛИ (б) любой читатель p.stage.** B1.5 снимает оба. Гейтить DROP надо по всему `src/`, не по одной папке (грабля Фазы A: reader-гейт был `components/projects/`-only).
- `select('*')` пережил бы DROP, **явный список колонок — нет**. Гейтить и по явным select.
- STAGE_CONFIG/DealStage/dealStages/getActiveStages — ещё живут (STAGE_CONFIG юзают ~12 файлов косвенно?); проверить в B3 после regen, снести неиспользуемое.
