# Ревью: sprint-audit-A1-input-trust — «Доверие к вводу»

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-audit-A1-input-trust.md` — toast + mutation defaults + Modal primitive + auth-expiry + yellow a11y  
**Контекст:** AUDIT-2026-07-12 (код 1.3, 1.4, 2.1 + визуал 1П-1, 1П-4). На `main` уже лежат коммиты с **теми же** сообщениями, что в разделе «КОММИТЫ» спринта.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз аудита (1.3 / 1.4 / 2.1 / 1П-4) | ✅ верный на момент написания |
| Архитектурное решение (один primitive + глобальный onError) | ✅ зрелое, совпадает с architecture.md |
| Пути / РАЗВЕДКА (актуальность на `main`) | ❌ устарели: работа **уже влита** |
| Schema / RLS / миграции | ✅ NOT_APPLICABLE — корректно |
| learnings.md (z-index, custom Modal, feature-folders) | ✅ учтено / не нарушено |
| Безопасность повторного запуска в CC | ❌ **не запускать** — дублирование/регрессия |

**Оценка: 4/10 как handoff «запусти сейчас».**  
Как *исторический* дизайн-спек до реализации — было ~8.5/10; как живой промпт для Claude Code на текущем `main` — **непригоден**.

**Рекомендация:** **не запускать в CC.** Спринт закрыт в коде. При необходимости — отдельный микро-fix (GlobalModals Esc), не переигрывать A1 целиком.

---

## Статус реализации (факт репо)

| Задача спринта | Статус на `main` | Доказательство |
|----------------|------------------|----------------|
| 0. yellow a11y-override | ✅ сделано | `a37370f`; `globals.css:215–217`, `1178–1199`, `1128–1130` |
| 1. sonner + mutation defaults | ✅ сделано | `package.json` `sonner@^2.0.7`; `layout.tsx:5,79`; `QueryProvider.tsx` + `lib/errors.ts` |
| 2. `shared/Modal.tsx` | ✅ сделано | `src/components/shared/Modal.tsx` (157 строк, isDirty + viewport-fit) |
| 3. 9 модалок на primitive | ✅ сделано | `13c9bb8`; все 9 import’ят `@/components/shared/Modal` |
| 4. auth-expiry | ✅ сделано | `use-auth.ts:SIGNED_OUT`; `lib/session.ts`; Query/MutationCache onError |
| Коммиты из спринта | ✅ уже есть | `a37370f`, `13c9bb8` (сообщения 1:1) |
| Unit: modal-guard | ✅ сверх спринта | `tests/unit/modal-guard.test.tsx` |

Коммиты:

- `a37370f` — `feat(ux): toast-провайдер + mutation defaults + yellow a11y-override (AUDIT A1.0-1)`
- `13c9bb8` — `feat(ux): единый Modal primitive — isDirty-guard, viewport-fit; 9 модалок переведены; auth-expiry handling (AUDIT A1.2-4)`

`architecture.md` уже описывает `shared/Modal.tsx` (viewport-fit + isDirty-guard), sonner, layout `QueryProvider` — skill-референсы **после** A1, а не «как до спринта».

---

## С чем согласен полностью (как с планом до реализации)

### 1. Класс проблем один — решение одно

Тихая потеря ввода (клик по оверлею, silent `console.error`, длинная модалка за viewport, протухший JWT) закрывается **общей инфраструктурой**, а не правками по одной модалке. Это совпадает с AUDIT 1.3 / 1.4 / 2.1.

### 2. Modal primitive без Radix

Кастомный `shared/Modal.tsx` + `data-modal` / `data-modal-overlay` — по learnings (z-index 999/1000) и architecture (Radix не в стеке). Inline-confirm вместо `window.confirm` — правильно.

### 3. Глобальный mutation onError + исключения гейтов

`stage_gate_failed` / `delivery_gate_failed` с локальным UI (parse* в `use-projects.ts`) нельзя дублировать toast’ом. В коде: `isGateError` + `meta.silentError` в `QueryProvider`.

### 4. isDirty из RHF; DeliveryCompletion без формы

Контракт `formState.isDirty` → prop `isDirty` — верный; DeliveryCompletion без dirty-guard — верно.

### 5. ProjectModal «Связи» в 2 колонки

Снижение высоты под 1366×768 (1П-4) — уместно. В коде: `md:grid-cols-2` у секции «Связи» (`ProjectModal.tsx:495–498`).

### 6. Не миграционный спринт

SQL/RLS/schema не трогаем — корректно. VERIFICATION: Type Safety WARNING / RLS N/A / Regional sonner — адекватно.

---

## Блокеры (критично — до «запуска» в CC)

### B1. Спринт уже выполнен на `main` — повторный прогон опасен

РАЗВЕДКА спринта ожидает:

| Ожидание спринта | Факт `main` (2026-07-16) |
|------------------|---------------------------|
| `isDirty` → 0 | много вхождений (Modal + 7 form-модалок) |
| `sonner\|Toaster` → 0 | `layout.tsx`, `QueryProvider`, `session.ts`, ExcelImport, SpawnWizard |
| `console.error` в onSubmit модалок | catch с комментарием «глобальный toast», без `console.error` |
| «создать» `shared/Modal.tsx` | файл есть, экспорт в `shared/index.ts` |
| «npm i sonner» | уже в `package.json` / lock |

Повторный CC-прогон → конфликты, переписывание рабочего кода, риск отката guard’ов. **Handoff нужно пометить DONE / архивировать**, а не отдавать агенту.

### B2. РАЗВЕДКА указывает неверные пути (даже «до» A1 часть была неверной)

| В спринте | Реально |
|-----------|---------|
| `src/components/providers/QueryProvider.tsx` | `src/components/layout/QueryProvider.tsx` (architecture.md: layout/) |
| `src/components/dashboard/PomodoroWidget.tsx` | `src/components/widgets/PomodoroWidget.tsx` |
| `globals.css` ~274–278 / ~1873–1887 | yellow a11y: ~215–217 (aura), ~1178–1199 (dark + fuji/washi); aura meeting-badge ~1128–1130 |
| `CallModal:147-149` console.error | сейчас catch без log; номера сдвинуты |
| `onClick={onClose}` как сигнал «нет guard» | после A1 это кнопки «Отмена»/крестик **внутри** Modal; оверлей идёт через `requestClose` |

Без живой переразведки агент правил бы не те строки.

### B3. (условно) Если цель — «закрыть A1», статус = закрыт

Тест-сценарии 1–6/7 в репо закрыты кодом + unit `modal-guard`. Runtime/визуал на 1366×768 и revoke session в спринте `NOT_VERIFIED` — это **ручной** QA, не повторная реализация.

---

## Предупреждения (остаточный долг / нюансы)

### W1. GlobalModals: Esc обходит isDirty-guard

`GlobalModals.tsx:23–30` — отдельный `window` listener:

```ts
if (e.key === 'Escape') closeModal();
```

Комментарий: «сами модалки Escape не слушают» — **устарел**: `Modal` слушает Esc и зовёт `requestClose` (с dirty-confirm).

Эффект для модалок из палитры (`openModal`): Esc может закрыть **без** «Есть несохранённые изменения». Локальные инстансы на страницах — ок (нет этого listener’а).

**Не в скоупе A1-промпта**, но реальный residual после A1:

- убрать Esc-handler из `GlobalModals`, **или**
- не вызывать `closeModal` напрямую — дать сработать Modal.

### W2. Кнопка «Отмена» в footer → `onClose` без guard

Во всех form-модалках «Отмена» зовёт `onClose` напрямую. В `Modal.tsx` это **задокументировано** (осознанный отказ vs случайный клик/Esc/крестик). Спринт этого не специфицировал — реализация разумна; UX-риск: привычка «Отмена = confirm» у части пользователей.

### W3. yellow: реализация ≠ текст спринта (но лучше)

Спринт: `color: var(--bg)` на `.bg-yellow`.  
Факт: затемнение **fill** до `--yellow-text` (aura/fuji/washi) + dark themes `color: #0d1020…` на `.bg-yellow.text-white` — в одном стиле с accent/green a11y. Meeting-badge aura: `background: var(--yellow-text)` на `[data-meeting-status="upcoming"]`. Цель ≥4.5:1 закрыта другим приёмом — **не регрессия**, но grep по тексту спринта «добавь color: var(--bg)» сейчас врёт.

### W4. `router.replace` vs `window.location.replace`

Спринт: `router.replace('/login')`.  
Факт: `handleSessionExpired` → `client.clear()` + `window.location.replace('/login')` + single-flight `redirecting`. Полная перезагрузка сбрасывает React-стейт сильнее App Router — **удачнее** для «пустой CRM под anon». Плюс `showToast=false` на добровольном SIGNED_OUT.

### W5. `meta.silentError` без TS-augmentation и без consumers

Используется optional chaining; module augmentation `Register.mutationMeta` нет. Consumers с `silentError: true` — 0 (гейти идут через `isGateError`). API на будущее — ок; при строгом meta-typing возможен mild TS-шум.

### W6. AiWorkspaceModal вне списка 9 — ок

Отдельный AI-shell без RHF-формы; `onClick={onClose}` на оверлее допустим. Viewport: `max-h-[85vh] overflow-y-auto` на всём dialog, не sticky header/footer — вне A1; при желании позже посадить на primitive **без** isDirty.

### W7. Toaster вне QueryProvider-tree — ок для sonner

`<Toaster />` в `layout.tsx` sibling к `QueryProvider` — для sonner нормально (императивный API).

---

## Пропущенные места (если бы спринт гоняли «с нуля»)

| Файл | Находка | Действие |
|------|---------|----------|
| `src/components/shared/GlobalModals.tsx:23–30` | Esc → `closeModal()` без dirty | Убрать/согласовать с Modal (W1) |
| `src/components/layout/QueryProvider.tsx` | реальный путь провайдера | Править РАЗВЕДКУ/коммиты, не `providers/` |
| `src/components/widgets/PomodoroWidget.tsx:111–113` | `bg-yellow` + `text-white` «Пауза» | Не `dashboard/` |
| `src/lib/errors.ts`, `src/lib/session.ts` | появились в A1, в спринте не названы явно | Хорошее уточнение для handoff; реализация вынесла правильно |
| `tests/unit/modal-guard.test.tsx` | сверх скоупа | Оставить; в VERIFICATION можно добавить |

Схема БД / RPC / RLS — **не затронуты**, сверка schema.md не требуется.

---

## Предлагаемые правки в спринт (если документ оставляют живым)

1. **Шапка:** статус `DONE (main: a37370f + 13c9bb8, 2026-07)` — **не в CC**.
2. РАЗВЕДКА: заменить ожидания «0» на «verify present»; пути `layout/QueryProvider`, `widgets/PomodoroWidget`.
3. Residual backlog (опционально micro-sprint): **GlobalModals Esc vs isDirty**.
4. Не перечислять `npm i sonner` и «создать Modal.tsx» как to-do.
5. Зафиксировать фактический yellow-приём (darken fill / on-color), не `color: var(--bg)`.
6. Упомянуть `lib/errors.ts` + `lib/session.ts` как часть A1.1/2.1.

Если нужен только «что осталось после A1» — достаточно пункта 3 + ручные тест-сценарии 2, 3, 5, 6.

---

## Чеклист crm-architect (condensed)

- [x] Есть РАЗВЕДКА (но **stale** на текущем дереве)
- [x] Нет выдуманных table/column/RPC
- [x] Пути модалок — feature-folders (calls/, meetings/, …) ✅; QueryProvider/Pomodoro — ❌ в тексте
- [x] learnings: custom Modal, z-index 999/1000, CSS variables / theme class
- [x] Миграций нет; из CC SQL не применяется
- [x] org_id / RLS / SECURITY DEFINER — N/A
- [x] Нет `flowType: 'implicit'`
- [x] schema.md обновлять не нужно

---

## Чеклист перед CC

- [x] ~~Можно в CC as-is~~ → **нет**
- [x] Работа A1 на `main` подтверждена (Modal, sonner, QueryCache/MutationCache, session, 9 модалок, yellow)
- [ ] (Опционально) micro-fix GlobalModals Esc
- [ ] (Опционально) ручной QA: offline toast, 1366×768 ProjectModal, revoke session, gate errors без double-toast
- [ ] Пометить/архивировать `sprint-audit-A1-input-trust.md` как DONE, чтобы watcher не слал в CC

---

## Итог одной строкой

Спека A1 была сильной и **уже реализована** на `main` теми же двумя коммитами; повторный запуск Claude Code по этому файлу — блокер, а не «ещё один UX-спринт».
