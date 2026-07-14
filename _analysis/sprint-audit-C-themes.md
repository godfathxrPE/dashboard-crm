# Claude Code Prompt — Sprint AUDIT-C: «Темы: дефолт aura, минус три темы, один shell»

По AUDIT-2026-07-12 (1П-2, 1П-3, 2П-4, 2.8 + «стоимость удаления»). Решение Олега:
как в аудите — дефолт aura, удалить scandi/paper/sand, единый shell. ПОСЛЕ спринтов A1/A2.
Ветка: main. Порядок задач ЖЁСТКИЙ — нарушение ломает первый рендер у пользователей.

## РАЗВЕДКА
```bash
grep -n "scandi" src/lib/stores/theme-store.ts src/components/providers/ThemeProvider.tsx src/app/layout.tsx | head
grep -n -B2 -A8 "ScandiSidebar\|Sidebar" "src/app/(dashboard)/layout.tsx" | head -40
grep -c "t-scandi\|t-paper\|t-sand" src/app/globals.css
grep -rn "SCANDI_" src --include="*.ts*" -l
grep -n "add-on-hover\|modalIn\|reduced-motion\|z-index" src/app/globals.css | sed -n '1,20p'
grep -rn "THEMES" src/lib -l
```

## ЗАДАЧА 1: дефолт → aura (1П-2) — ПЕРВОЙ, блокер всего остального
- theme-store.ts:16 default → 't-aura'; ThemeProvider fallback; app/layout.tsx SSR-класс и
  inline theme-init (дефолт-ветка сейчас завязана на 't-scandi' — обнови сравнение).
- Миграция persisted: в theme-init и store — если сохранённая тема ∉ актуального списка ЛИБО
  ∈ {t-scandi, t-paper, t-sand} → заменить на t-aura (гард устаревшей темы уже есть — расширь).

## ЗАДАЧА 2: вынос глобальных правил из .t-scandi — ДО удаления
Внутри scandi-блока живут ГЛОБАЛЬНЫЕ вещи (аудит: z-index модалок, @keyframes modalIn,
reduced-motion, .add-on-hover). Вынести в глобальный слой globals.css, проверить что без
t-scandi на body всё работает.

## ЗАДАЧА 3: add-on-hover глобально (1П-3)
Единое правило вне тем: скрыто по умолчанию (`opacity-0`/`visibility`), показ на `tr:hover`
и `:focus-within` (a11y: клавиатура). Убрать пер-темные исключения (:1305-1313).
Эффект: во frost/washi/fuji и остальных пустые ячейки больше не стена «+ добавить».

## ЗАДАЧА 4: удалить paper/sand (~0.5 дня по аудиту)
CSS-блоки, 3 TSX-упоминания (Header, ScandiContentHeader, SettingsContent), THEMES-список.

## ЗАДАЧА 5: удалить scandi + переименование shell
- ScandiSidebar → TextNavSidebar, ScandiContentHeader → ContentHeader (это shell aura — НЕ удалять!).
- ~620 строк CSS `.t-scandi`, ~150 SCANDI_* hex-констант, 74 упоминания в 14 TSX (grep-чеклист).
- Шрифт Inter: загрузка убирается, если использовался только scandi (сверь --font-app блоки).

## ЗАДАЧА 6: единый shell для всех тем (2П-4 + hydration 2.8)
(dashboard)/layout.tsx: убрать ветвление по persisted-теме — ВСЕ темы на TextNavSidebar
(+Header по совр. дизайну aura). Тёмные темы отличаются токенами, не скелетом.
Это устраняет hydration mismatch: SSR и клиент рендерят одно дерево.
Старый иконочный Sidebar удалить после перевода.

## Тест-сценарии
1. Чистый localStorage → первый рендер aura, БЕЗ вспышки и hydration warning в консоли.
2. localStorage с 't-scandi' → авто-миграция на aura.
3. Все 6 оставшихся тем (aura/washi/fuji/frost/aurora/tidal): переключение живо, модалки
   непрозрачны, z-index цел, reduced-motion работает.
4. Таблица компаний с пустыми ячейками: ghost-CTA виден только на hover строки, во всех темах.
5. Навигация идентична во всех темах (один shell).
6. tsc/build зелёные; grep t-scandi/t-paper/t-sand/SCANDI_ = 0.

## КОММИТЫ (по задачам, минимум три)
```
git commit -m "feat(themes): дефолт aura + миграция persisted (AUDIT C1)"
git commit -m "refactor(themes): глобальные правила вынесены из scandi; add-on-hover на row-hover глобально (AUDIT C2-3)"
git commit -m "feat(themes)!: удалены scandi/paper/sand; единый shell TextNavSidebar для всех тем (AUDIT C4-6)"
```

## VERIFICATION (ожидаемое)
Type Safety: WARNING | RLS: NOT_APPLICABLE | Backward Compat: WARNING (визуальный регресс-прогон
по 6 темам обязателен) | Runtime: NOT_VERIFIED
