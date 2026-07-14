# Claude Code Prompt — Fix: delivery P1 UX (won-список + подсветка spawn CTA)

Контекст: dashboard-crm, ветка `feat/aura-theme`, после коммитов 4c1f2ad + 8706399.
Три правки по итогам ручного прогона Олега. Только UI, без миграций и типов. D1-формат.

## Фикс 1: WonDeals — раскрываемый список (блокер UX)

**Проблема:** won-сделки уходят из колонок воронки в статичную плашку «Выиграно: N»
(`PipelineBoard.tsx:342-356`, ф-я `WonDeals`) — раскрыть нельзя, до карточки won-сделки не
добраться из воронки. А spawn проекта внедрения живёт именно на карточке won-сделки.

**Фикс:** переписать `WonDeals` по образцу `LostDeals.tsx` (тот же паттерн: `useState(isOpen)`,
chevron-toggle, collapsible список):
- Заголовок: Trophy + «Выиграно: N» + сумма — как сейчас, но кликабельный toggle (Chevron).
- В раскрытом списке каждая строка: имя (клик → `router.push('/deals/'+p.id)`), компания,
  бюджет, дата won (`actual_close_date` или `updated_at`).
- В строке — компактная кнопка `<Rocket size={11}/> Проект внедрения` → тоже переход на
  `/deals/[id]` (спавн-диалог там; прокидывать state не нужно — просто переход). Если у сделки
  уже есть delivery-проект — определить нельзя без доп. запроса; НЕ делаем в этом фиксе.
- Зелёная стилистика сохраняется (border-green/30 bg-green/5), внутренние строки — по образцу
  LostDeals (bg-bg, border-border/50).
- Проверить: `StageBoard.tsx` — если у него свой won-блок, тот же паттерн (РАЗВЕДКА:
  `grep -n "Выиграно" src/components/projects/StageBoard.tsx`).

## Фикс 2: CTA «Создать проект внедрения» — primary

`ProjectDetail.tsx` ~:482 — сейчас outline (`border-accent/40 text-accent`), визуально равна
соседней «Вернуть в работу». Сделать filled primary:

```tsx
className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs
           font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
```
(если в теме есть токен on-accent/аналог для текста на accent — использовать его вместо text-white;
сверить, как оформлена primary-кнопка «+ Сделка» в ProjectsTable/PipelineBoard и взять тот же стиль.)

## Фикс 3: Кнопки выбора шаблона — акцент вместо серого

`ProjectDetail.tsx` ~:541-549 — «Полный запуск»/«Эксперимент» сейчас `border-border text-text-dim`,
неотличимы от «Отмена». Новому пользователю нет ориентира. Сделать выбор-опции акцентными:

```tsx
className="rounded border border-accent/50 bg-accent-l/60 px-2.5 py-1 text-xs font-medium
           text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
```
«Отмена» оставить серой (text-text-mute) — контраст действий сохраняет ориентир.
Опционально: перед кнопками краткий hint в text-text-dim: «Полный запуск — весь цикл внедрения ·
Эксперимент — пилот» (одна строка, не перегружать).

## ПРОВЕРКА
```bash
npx tsc --noEmit 2>&1 | head -10 && npm run build 2>&1 | tail -5
```
Ручной чек: воронка → «Выиграно: 3» раскрывается, клик по сделке → /deals/[id]; на won-карточке
CTA заметно выделяется; в диалоге выбора «Полный запуск/Эксперимент» — акцентные, «Отмена» серая.
Регресс: LostDeals как раньше.

## КОММИТ
```bash
git add src/components/projects/
git commit -m "fix(delivery): won-сделки раскрываемым списком в воронке + подсветка spawn CTA и выбора шаблона"
```

```
Type Safety: WARNING (tsc) | RLS: NOT_APPLICABLE | Backward Compat: PASS (UI-only) | Runtime: NOT_VERIFIED
```
Трудоёмкость: ~30-45 мин, риск низкий.
