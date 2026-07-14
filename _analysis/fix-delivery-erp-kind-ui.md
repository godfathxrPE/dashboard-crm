# Claude Code Prompt — Fix: direction-aware выбор шаблона внедрения + лейблы kind (D1)

Контекст: dashboard-crm, ветка `feat/aura-theme`, после P2a. Данные корректны (spawn ERP-сделки
создаёт ERP-доску 6 фаз × 40 задач — проверено по проду). Проблема — UI-терминология:
диалог spawn и бейджи используют IIoT-лексику («Полный запуск/Эксперимент») для всех направлений,
а «Эксперимент» на ERP-сделке создаёт проект с пустой доской (шаблона erp+experiment нет — graceful).

## Фикс 1: делаем лейблы kind direction-aware

`src/lib/constants/delivery-phases.ts` — добавить хелпер (существующий `DELIVERY_KIND_LABELS` не
удалять — он может использоваться в фильтрах/списках; проверить грепом и заменить точки чтения):

```ts
/** Лейбл вида внедрения с учётом направления: у ERP нет «запусков» и экспериментов */
export function deliveryKindLabel(kind: string, direction?: string | null): string {
  if (direction === 'erp') return kind === 'launch' ? 'Внедрение' : 'Эксперимент';
  return DELIVERY_KIND_LABELS[kind] ?? kind;
}
```

Точки чтения (РАЗВЕДКА): `grep -rn "DELIVERY_KIND_LABELS" src --include="*.tsx"` —
заменить на `deliveryKindLabel(kind, direction)` там, где direction доступен
(бейдж в ProjectDetail delivery-проекта, карточки/список «Проекты»).

## Фикс 2: spawn-диалог на won-сделке — по направлению

`ProjectDetail.tsx`, панель выбора шаблона (~:541, кнопки «Полный запуск»/«Эксперимент»):

- `deal.direction === 'erp'` → ОДНА кнопка **«Внедрение (6 этапов)»** → `spawn(deal.id, 'launch')`.
  Кнопку «Эксперимент» НЕ показывать: шаблона erp+experiment нет, получится проект с пустой
  доской — ловушка. Hint-строка: «Полный цикл: Обследование → … → Эксплуатация».
- `deal.direction === 'iiot'` → как сейчас: «Полный запуск» / «Эксперимент»,
  hint «Полный запуск — весь цикл внедрения · Эксперимент — пилот».

## ПРОВЕРКА
```bash
npx tsc --noEmit 2>&1 | head -5 && npm run test 2>&1 | tail -3
grep -rn "DELIVERY_KIND_LABELS" src --include="*.tsx"   # остались только легитимные точки
```
Ручной чек: won ERP-сделка → одна кнопка «Внедрение (6 этапов)»; won IIoT — две кнопки;
бейдж ERP-проекта — «Внедрение», IIoT — «Полный запуск»/«Эксперимент».

## КОММИТ
```bash
git add src/
git commit -m "fix(delivery): direction-aware выбор шаблона внедрения и лейблы kind — у ERP нет экспериментов"
```

```
Type Safety: WARNING (tsc) | RLS: NOT_APPLICABLE | Backward Compat: PASS (UI-only, БД не тронута)
Runtime: NOT_VERIFIED
```
Трудоёмкость: ~30–40 мин | Риск: низкий.

_Заметка на P2b: если ERP-эксперименты появятся как практика — сидим шаблон erp+experiment,
и кнопка возвращается сама (данные уже direction-aware)._
