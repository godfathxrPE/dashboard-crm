# Claude Code Prompt — Sprint 29.1 (микро): чеврон детальной страницы → stage_id

## Контекст

Найдено на смоках S29: у стадии сделки два хранилища. Канбан, бейдж probability,
гейты S27 и автоматизация S29 живут на `projects.stage_id` (новая модель,
pipeline_stages); чеврон StackedPipeline на детальной странице пишет legacy
`projects.stage` (enum) — мёртвое поле, одностороннего синка stage → stage_id нет.
Симптом: клик по чеврону двигает только локальный прогресс-бар, «живой» контур
(бейдж, гейты, автозадачи) не видит перехода; расхождение видно как
«чеврон: Подготовка КП / бейдж: Лид · 5%».

**Цель S29.1 (узкая):** чеврон читает и пишет ТОЛЬКО stage_id. Legacy `stage`
перестаёт быть писуемым из UI вообще. Никаких DB-миграций не ожидается —
это UI-спринт (если разведка покажет иначе — стоп, репорт).

**Ключевая подсказка:** в `pipeline_stages` есть колонка `phase_group` —
почти наверняка это и есть три трека чеврона (Подготовка / Эксперимент / Проект).
Значит чеврон рендерится напрямую из стадий воронки сделки (GROUP BY phase_group,
ORDER BY order_index), без хардкод-маппинга. Проверь разведкой.

## РАЗВЕДКА

```bash
# 1. Компонент чеврона: что читает, что пишет
grep -rn "StackedPipeline\|preparation_stage\|experiment_stage\|project_stage" src/ --include="*.tsx" -l
# внутри найденного: чем обновляет стадию (какое поле, какая мутация)
# 2. ВСЕ читатели legacy stage в UI (их надо переключить или зафиксировать)
grep -rn "\.stage[^_I]" src/ --include="*.tsx" --include="*.ts" | grep -v "stage_id\|stage_entered\|pipeline_stages\|StageReadiness\|stage_requirements" | head -20
# 3. Как канбан делает переход (мутация с парсингом stage_gate_failed — переиспользовать)
grep -n "moveToStageId\|stage_gate_failed" src/lib/hooks/use-projects.ts src/components/**/PipelineBoard* | head
# 4. Есть ли у хуков доступ к стадиям воронки сделки (pipelines/pipeline_stages fetch)
grep -rn "pipeline_stages" src/lib/hooks/*.ts | head
```

Через Supabase MCP (если жив; иначе SQL Editor руками Олега):
```sql
-- phase_group: подтверждение гипотезы про три трека
SELECT phase_group, string_agg(name, ' → ' ORDER BY order_index), p.direction
FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id
WHERE p.entity_type = 'deal'
GROUP BY phase_group, p.direction ORDER BY p.direction, min(order_index);
```

## ЗАДАЧА 1: Чеврон на stage_id

1. Источник данных: стадии воронки текущей сделки (`pipeline_id` сделки),
   сгруппированные по `phase_group`, внутри группы — по `order_index`.
   Треки и сегменты — из БД, хардкод названий убрать.
2. Активная стадия: `deal.stage_id`. Подсветка пройденных — по order_index
   относительно активной.
3. Клик по сегменту → та же мутация, что у канбана (moveToStageId с парсингом
   `stage_gate_failed`): отказ гейта → существующий баннер с причинами
   (переиспользовать, не дублировать), успех → инвалидация, бейдж/probability
   обновляются сами.
4. Прогресс-бар страницы: производная от позиции stage_id (order_index / всего)
   или probability — выбери одно, зафиксируй в комментарии.
5. Записи в `preparation_stage/experiment_stage/project_stage` и legacy `stage`
   из этого компонента — удалить полностью.

## ЗАДАЧА 2: Остальные читатели legacy stage

По разведке №2: каждого читателя legacy `stage` в UI либо переключить на
stage_id-производную (если тривиально), либо внести в список
«читает legacy, переключить в S30+» в BACKLOG.md. НЕ переключать вслепую
сложные места — фиксируй.

## ЗАДАЧА 3: Docs + бэклог

- docs/schema.md: legacy `stage` — «read-only с S29.1, из UI не пишется;
  кандидат на вынос после переключения читателей».
- BACKLOG.md: обновить пункт S29.1 → done, добавить список оставшихся
  legacy-читателей (из Задачи 2), добавить «вынос legacy stage + 3-track колонок» 
  как отдельный будущий пункт.
- Скилл architecture.md: чеврон = stage_id, phase_group-группировка.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
# Чеврон больше не пишет legacy-поля:
grep -rn "preparation_stage\|experiment_stage\|project_stage" src/components/ | grep -v "// legacy" | wc -l  # ожидаемо 0 или только чтения, зафиксированные в Задаче 2
```

## КОММИТ

```bash
git add src/ docs/schema.md _analysis/BACKLOG.md
git commit -m "Sprint 29.1: чеврон детальной страницы на stage_id (phase_group из pipeline_stages), legacy stage больше не пишется из UI, гейт-баннер переиспользован"
```

## Гейт

UI-smoke Олега (главный): на детальной странице сделки клик по «Подготовка КП»
без бюджета/файла → баннер гейта с причинами; с заполненными → переход, бейдж
меняется на «Подготовка КП · 25%», автозадача создаётся (если правило ещё не
стреляло по этой паре сделка+стадия). Cowork SQL-верификация после: legacy и
stage_id больше не расходятся на свежих переходах.
