# Claude Code Prompt — Sprint AUDIT-A1: «Доверие к вводу»

По AUDIT-2026-07-12 (код 1.3, 1.4, 2.1 + визуал 1П-1, 1П-4) и REVIEW-AUDIT-2026-07-12
(Grok 9/10, порядок подтверждён гейтом Cowork). Ветка: main. НЕ миграционный спринт — только код.

**Суть:** закрыть класс «тихая потеря ввода»: клик мимо модалки без guard, молчаливые onError,
модалка за вьюпортом, протухшая сессия. Одно решение: единый Modal primitive + toast-провайдер +
mutation defaults + auth-обработка.

## РАЗВЕДКА

```bash
grep -n "onClick={onClose}" src/components/**/[A-Z]*Modal.tsx | head -12
grep -rn "isDirty" src/components/ | head          # ожидается 0
grep -rn "sonner\|Toaster" src/ | head             # ожидается 0
grep -n -A12 "new QueryClient" src/components/providers/QueryProvider.tsx src/lib/*.ts* 2>/dev/null
grep -n -A10 "onAuthStateChange" src/lib/hooks/use-auth.ts
sed -n '270,280p;1870,1890p' src/app/globals.css   # override-списки без yellow
grep -n "bg-yellow" src/components/dashboard/PomodoroWidget.tsx src/components/meetings/MeetingsList.tsx
```

## ЗАДАЧА 0: yellow в a11y-override списки (15 минут, [MEASURED] из аудита)

globals.css: в aura-блок (строки ~274-278) и dark-блок (~1873-1887) добавить `.bg-yellow`
по образцу существующих accent/green/red/blue/purple:
- aura: `.t-aura .bg-yellow { color: var(--bg); }` (или тёмный текст — сверь с парой green)
- dark: `.t-frost .bg-yellow, .t-aurora .bg-yellow, .t-tidal .bg-yellow { color: var(--bg); }`
Цель: PomodoroWidget «Пауза» и date-badge встреч ≥4.5:1 во всех темах.
⚠️ Проверить и aura CSS `globals.css:1817-1819` (meeting badge красится в var(--yellow) поверх
text-white в разметке) — итоговая пара тоже должна пройти.

## ЗАДАЧА 1: toast-провайдер + mutation defaults

1. `npm i sonner` (MIT, npm — Regional: VERIFIED).
2. `<Toaster richColors position="bottom-right" />` в root layout (client-обёртка).
3. QueryProvider: `new QueryClient({ mutationCache: new MutationCache({ onError }) })`:
   - глобальный onError → `toast.error(...)` с человекочитаемым текстом;
   - НЕ тостить гейт-ошибки, у которых свой UI: `stage_gate_failed`, `delivery_gate_failed`
     (парсеры уже в use-projects.ts) — проверять e.message и пропускать;
   - опция отключения на мутацию: `meta: { silentError: true }`.
4. Убрать `console.error`-заглушки из onSubmit 7 модалок (CallModal:147-149 и др.) — ошибку
   пробрасывать, глобальный обработчик покажет toast; catch оставить только там, где есть
   осмысленная локальная реакция.

## ЗАДАЧА 2: единый Modal primitive

`src/components/shared/Modal.tsx` (колокация shared — как GlobalModals):
- Props: `{ title, onClose, isDirty?, footer?, children, maxWidth? }`.
- Разметка: `[data-modal-overlay]` (fixed inset-0, клик по себе → requestClose) +
  `[data-modal]` (role="dialog", aria-modal): `flex flex-col max-h-[calc(100dvh-3rem)]`,
  header/footer `flex-none`, тело `overflow-y-auto min-h-0`.
- `requestClose`: если `isDirty` → inline-подтверждение ВНУТРИ модалки
  («Есть несохранённые изменения» + кнопки «Закрыть без сохранения» / «Продолжить редактирование»).
  НЕ window.confirm. Esc — тот же путь.
- Тёмные темы: непрозрачность уже решена глобально через `[data-modal]` — атрибуты обязательны.
- z-index: по иерархии проекта (overlay 999 / modal 1000 уже в globals для data-атрибутов).

## ЗАДАЧА 3: перевод 9 модалок на primitive

CallModal, CompanyModal, ContactModal, MeetingModal, LeadModal, LeadConversionModal,
ProjectModal, TaskModal + projects/DeliveryCompletionModal (свежая, P3).
- `isDirty` из RHF `formState.isDirty` (для DeliveryCompletionModal — не нужен, там нет формы).
- Копипасту оверлеев удалить. Поведение submit/валидации НЕ трогать.
- ProjectModal дополнительно: секцию «Связи» в 2 колонки на ≥md (585 строк в один столбец —
  источник вьюпорт-бага 1П-4).

## ЗАДАЧА 4: протухшая сессия (2.1)

use-auth.ts: в onAuthStateChange обработать `SIGNED_OUT` → `queryClient.clear()` +
`router.replace('/login')`. В глобальном mutation onError: коды JWT expired / 401 →
toast «Сессия истекла» + redirect. Проверить и query-слой: глобальный QueryCache onError
для auth-ошибок (не тостить каждый упавший запрос — один redirect).

## Тест-сценарии
1. Заполнить форму сделки, кликнуть мимо → подтверждение, данные живы.
2. Отключить сеть, создать компанию → toast ошибки, optimistic откатился ВИДИМО.
3. 1366×768: ProjectModal — header и submit видимы, тело скроллится колесом.
4. Гейт-ошибки delivery/stage — БЕЗ дублирующего toast (свой UI).
5. Pomodoro-кнопка и meeting-badge читаемы в aura/frost/aurora/tidal.
6. Убитая сессия (revoke в Supabase) → редирект на /login, кеш очищен.
7. tsc/build зелёные.

## КОММИТЫ (два)
```
git add src/app/globals.css package.json package-lock.json src/components/providers src/app/layout.tsx
git commit -m "feat(ux): toast-провайдер + mutation defaults + yellow a11y-override (AUDIT A1.0-1)"
git add src/
git commit -m "feat(ux): единый Modal primitive — isDirty-guard, viewport-fit; 9 модалок переведены; auth-expiry handling (AUDIT A1.2-4)"
```

## VERIFICATION (ожидаемое)
Type Safety: WARNING | RLS: NOT_APPLICABLE | Backward Compat: PASS-план (UX-замены точечные) |
Runtime: NOT_VERIFIED | Regional: VERIFIED (sonner/npm)
