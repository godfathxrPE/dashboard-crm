# Claude Code Prompt — Sprint S-DEAL-CARD: карточка сделки на канбане ≤6 сигналов (аудит F-04)

> **Тип:** client-only, БЕЗ миграции. Один файл (`ProjectCard.tsx`). Пайплайн: промпт → ревью Grok → CC пишет+коммитит+пушит → гейт Cowork (визуальный смок канбана). База: `main` (после мёржа S-TYPO-SCALE) / `feat/typo-scale`. Ветка: `feat/deal-card`.
> Решение Олега (F-04, вариант A): свернуть 4 дублирующих сигнала внимания в ОДНУ строку, убрать декор/дубли. Стек неизменен, цвета — `var(--token)`/семантика.

---

## WHY

Карточка `ProjectCard` несёт ~13 постоянных сигналов — «ёлка», отдельные сигналы перестают работать. **4 из них** (health-dot, возраст-в-стадии, дедлайн-пилюля-как-тревога, статус-шага) отвечают на один вопрос «нужно ли внимание». Сворачиваем в **одну строку внимания**; убираем чистый декор и дубли. Ничего не теряется из системы: % и health и контакт остаются на детальной сделки.

## ЦЕЛЕВАЯ КАРТОЧКА

**Оставить (~6 сигналов):**
1. Stage-row: **phase-dot + название стадии** (uppercase mute) — и всё (без возраста/health/%).
2. **Имя сделки + бейдж направления** (IIoT/ERP/Внутр.) — как есть.
3. **Компания** (icon + имя) — как есть.
4. **Бюджет** (сумма, или ⚠ «Бюджет» если не указан) — как есть.
5. **Дедлайн** (icon + дата + пилюля срочности) — как есть, если задан.
6. **ОДНА строка внимания** (заменяет next-step блок + возраст + health-dot) — приоритет worst→best:
   - `getDealHealth === 'overdue-action'` → **red**, «шаг просрочен N дн.»
   - `getDealHealth === 'no-action'` → **yellow**, «нет даты шага» / «нет следующего шага»
   - `getStageAging(...).isStale` → **yellow**, «залипла N дн. в «{stage}»»
   - иначе (ok, не stale) → **mute**, «→ {next_step}» (+ дата шага мелким, если есть)
7. Прогресс-бар (низ), drag-handle (hover), actions (hover: advance/edit/delete) — как есть.

**Убрать:**
- **Corner notch** (декоративный треугольник `absolute top-0 right-0`) — целиком.
- **Вероятность %** (в stage-row) — статична по стадии (не deal-specific) → на детальной (чеврон).
- **HealthDot** (в stage-row) — композит из показанных сигналов; на детальной есть блок «Здоровье».
- **Возраст-в-стадии** span (в stage-row) — его stale-инфо сворачивается в строку внимания (п.6).
- **Блок «Контакт»** (icon + имя) — на детальной есть карточка «Контакт».

---

## РАЗВЕДКА

```bash
git status -sb && git log --oneline -1
# ProjectCard структура (ждём: corner notch, stage-row с HealthDot+%, aging-IIFE, contact-блок, next-step-IIFE)
grep -n "Corner notch\|HealthDot\|stageProbability\|getStageAging\|IconContact\|next_step\|calculateDealHealth\|getDealHealth" src/components/projects/ProjectCard.tsx
# Где рендерится ProjectCard (смок этих мест): ждём deals PipelineBoard (+ возможно projects)
grep -rn "ProjectCard" src/components --include="*.tsx" | grep -v "ProjectCard.tsx"
# HealthDot ещё где-то нужен? (не удалять сам компонент)
grep -rln "HealthDot" src/components | head
```

**⚠️ Расхождение — доложи.** ProjectCard может рендериться и на /projects (delivery-борд) — правка применится там же; смокнуть оба.

## ЗАДАЧА 1 — Убрать декор + очистить stage-row

1. Удалить блок **Corner notch** (`{/* Corner notch */}` + его `<div className="absolute top-0 right-0" ...>`).
2. **Stage-row** — оставить только phase-dot + `stageLabel`. Удалить:
   - IIFE возраста-в-стадии (`{!isTerminal && project.stage_entered_at && (() => { ... getStageAging ... })()}`) — **но** `getStageAging` понадобится в Задаче 2 (перенести вызов туда).
   - `<span className="ml-auto ...">` с `<HealthDot .../>` и `{stageProbability}%`.
3. Удалить блок **Contact** (`{project.contact && (...)}`).
4. Подчистить неиспользуемое: `calculateDealHealth`/`health` (был только для HealthDot), импорты `HealthDot`, `IconContact` — если больше не используются (tsc-lint поймает). `stageProbability` — если больше нигде.

## ЗАДАЧА 2 — Одна строка внимания (свернуть next-step + возраст + health)

Заменить весь IIFE «Next step + rotting indicator» на одну вычисляемую строку. Логика (worst→best, показывать РОВНО одну):

```tsx
{(() => {
  const dh = getDealHealth(project);
  const aging = !isTerminal && project.stage_entered_at
    ? getStageAging(project.stage_entered_at, pipelineStage?.phase_group ?? null)
    : null;

  // 1. шаг просрочен (red)
  if (dh === 'overdue-action') {
    const days = getNextActionOverdueDays(project.next_action_date!);
    return <AttentionLine tone="red"    dot="fill"    text={`шаг просрочен ${days} дн.`} />;
  }
  // 2. нет действия (yellow)
  if (dh === 'no-action') {
    return <AttentionLine tone="yellow" dot="outline" text={project.next_step?.trim() ? 'нет даты шага' : 'нет следующего шага'} />;
  }
  // 3. залипла в стадии (yellow)
  if (aging?.isStale && aging.daysInStage) {
    return <AttentionLine tone="yellow" dot="outline" text={`залипла ${aging.daysInStage} дн. в «${stageLabel}»`} />;
  }
  // 4. ok — следующий шаг мелким (mute), либо ничего
  if (!project.next_step) return null;
  return (
    <div className="mt-1">
      <p className="line-clamp-1 text-xs text-text-mute">→ {project.next_step}</p>
      {project.next_action_date && (
        <p className="text-xs tabular-nums text-text-mute">
          {new Date(project.next_action_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </p>
      )}
    </div>
  );
})()}
```

`AttentionLine` — маленький локальный компонент (или инлайн-JSX) в этом же файле: `mt-1 flex items-center gap-1.5`, цвет `tone` через токен (`red`→`var(--red-text, var(--red))`, `yellow`→`var(--yellow-text, var(--yellow))`), точка `dot` (fill = `bg-current`, outline = `border border-current`, `h-[6px] w-[6px] rounded-full shrink-0`), текст `text-xs`. Переиспользует существующий визуальный язык точек из старого блока — не изобретать новый.

## ЗАДАЧА 3 — Оставить нетронутыми

Бюджет, дедлайн (icon+дата+пилюля), прогресс-бар, actions (hover), drag-handle, name+направление, компания — **НЕ трогать**. Границы карточки/тени/радиус — как есть.

---

## ГРАНИЦЫ SCOPE

Только `ProjectCard.tsx`. **НЕ** детальную сделки, **НЕ** табличный вид сделок, **НЕ** другие карточки (LeadsView/TaskCard/delivery), **НЕ** helpers deal-health (используем существующие `getDealHealth`/`getStageAging`/`getNextActionOverdueDays`), **НЕ** цвета/размеры вне карточки.

## ПРОВЕРКА

```bash
rm -rf .next && npx tsc --noEmit 2>&1 | head -20 && npm run build 2>&1 | tail -8   # build не при живом dev
```

**Визуальный смок (aura + тёмная):** /deals канбан (+ /projects если ProjectCard там же) — карточка несёт ~6 сигналов: имя+направление, компания, бюджет, дедлайн, ОДНА строка внимания (проверить все 4 ветки на разных сделках: просрочен/нет-действия/залипла/ok), прогресс-бар. Уголка-декора нет, %/health-dot/контакта нет. Ничего не переполнено, drag/actions на hover работают, терминальные (won/lost) без прогресс-бара как раньше.

## КОММИТ

```bash
git switch -c feat/deal-card
git add src/components/projects/ProjectCard.tsx
git commit -m "refactor(deals): карточка канбана ~13→6 сигналов — свёрнута строка внимания, убраны декор/health-dot/%/контакт (S-DEAL-CARD, аудит F-04)"
```

## VERIFICATION (сборка промпта, Cowork)

```
Live-code sync:  PASS — ProjectCard прочитан целиком; corner notch, stage-row (HealthDot+%+aging), contact, next-step-IIFE — точные якоря
Решение:         вариант A Олега (свернуть 4 сигнала внимания в 1); % / health / контакт не теряются (есть на детальной)
Type Safety:     NOT_VERIFIED — удаление неиспользуемых импортов (calculateDealHealth/HealthDot/IconContact) поймает tsc
RLS/DB:          NOT_APPLICABLE
Backward Compat: WARNING — с карточки уходит инфо (%, health, контакт, возраст-как-отдельный) → на детальной; смок подтверждает, что urgency читается одной строкой
Runtime Tested:  NOT_VERIFIED — смок на гейте (обе темы, 4 ветки строки внимания)
```
