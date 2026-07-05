# Claude Code Prompt — Sprint W2a: Command palette 2.0 (действия, не только поиск)

## Контекст

Паттерн Linear: ⌘K — единая точка входа. Сейчас палитра умеет поиск по
сущностям + навигацию (router.push). Цель: добавить ДЕЙСТВИЯ — создание
любой сущности с любой страницы.

Фундамент уже есть, но мёртвый: в ui-store определены `activeModal: ModalId`
('task'|'project'|'call'|'meeting'|'contact'|'company'|...), `openModal`,
`closeModal` — и НИ ОДИН компонент их не слушает. Спринт оживляет этот задел.

**Правила:** цвета через CSS-переменные; модалки НЕ дублировать — использовать
существующие (TaskModal, ProjectModal, CallModal, MeetingModal, Contact/
CompanyModal — найди фактические имена/пропсы разведкой); z-index модалок —
через [data-modal-overlay]/[data-modal] (глобальные 999/1000).

## РАЗВЕДКА

```bash
# Палитра: структура CmdItem, секции, обработчик выбора
sed -n '1,60p' src/components/shared/CommandPalette.tsx
sed -n '160,200p' src/components/shared/CommandPalette.tsx

# ui-store: полный контракт modal-части
cat src/lib/stores/ui-store.ts

# Все модалки и их пропсы (isOpen/onClose — совпадает ли сигнатура)
grep -rn "interface.*ModalProps" src/components/*/[A-Z]*Modal.tsx | head
grep -n "isOpen" src/components/tasks/TaskModal.tsx src/components/calls/CallModal.tsx src/components/meetings/MeetingModal.tsx src/components/contacts/ContactModal.tsx src/components/companies/CompanyModal.tsx 2>/dev/null | head

# Где палитра рендерится и как открывается
grep -n "CommandPalette\|commandPalette" "src/app/(dashboard)/layout.tsx" src/components/layout/Header.tsx src/components/shared/Hotkeys.tsx
```

ВНИМАНИЕ: MeetingModal.tsx исторически имел 6 TS-ошибок (company_id/contact_id).
Если они ещё есть — почини попутно (поля есть в БД с миграции 012, типы
в database.ts уже добавлены; проверь validator meeting.ts) — это разблокирует
чистый tsc навсегда. Если уже починены — пропусти.

## ЗАДАЧА 1: GlobalModals host

Новый `src/components/shared/GlobalModals.tsx`:
- читает `activeModal` + `closeModal` из ui-store;
- рендерит соответствующую модалку с isOpen/onClose (маппинг ModalId → компонент);
- монтируется один раз в `src/app/(dashboard)/layout.tsx` рядом с CommandPalette.

Проверь коллизию: страницы уже рендерят эти модалки локально со своим
useState — это НЕ конфликт (разные инстансы), но убедись, что порталы/оверлеи
не дублируются визуально при одновременном открытии (не должно случаться —
палитра закрывается перед openModal).

## ЗАДАЧА 2: Секция «Действия» в палитре

В начало списка (до навигации), section: 'Действия':

| Команда | Действие | Подсказка-shortcut |
|---|---|---|
| Новая задача | openModal('task') | T |
| Новый звонок | openModal('call') | C |
| Новая сделка | openModal('project') | P |
| Новая встреча | openModal('meeting') | M |
| Новый контакт | openModal('contact') | — |
| Новая компания | openModal('company') | — |

- Выбор действия: закрыть палитру → openModal.
- Пустой query показывает «Действия» + «Навигация»; при вводе — фильтруются
  вместе с сущностями (текущая логика фильтрации).
- Быстрые клавиши ВНУТРИ открытой палитры при пустом query: нажатие T/C/P/M
  запускает действие (обычные буквы при непустом query — это ввод текста,
  аккуратно: перехватывать только когда input пуст).

## ЗАДАЧА 3: Актуализация навигации и подсказки shortcuts

1. Пункты навигации: «Дашборд /» → «Сегодня /» + добавить «Обзор /overview»
   (после W1b список устарел).
2. Справа у пунктов — kbd-подсказки (⌘K у поиска уже есть в Header; внутри
   палитры показать T/C/P/M у действий, стилем text-mute, размер 10-11px).
3. В футере палитры строка-легенда: «↑↓ — навигация · Enter — выбрать ·
   Esc — закрыть» (если футера нет — добавь, hairline-разделитель).

## ЗАДАЧА 4: Глобальный quick-create (опционально, если дёшево)

Глобальный хоткей `N` (без модификатора, вне инпутов — проверь по образцу
существующего Hotkeys.tsx, там уже есть перехват с проверкой target):
открывает палитру с préфильтром секции «Действия». Если Hotkeys-механика
не позволяет сделать чисто за ~30 строк — пропусти, отметь в отчёте.

## ПРОВЕРКА

```bash
npx tsc --noEmit    # цель: 0 ошибок, включая MeetingModal
npm run dev
```

Руками: с /companies нажми ⌘K → «Новый звонок» → CallModal открылась;
создание работает; с / (Сегодня) → ⌘K → T → TaskModal; Esc-цепочка:
Esc закрывает модалку, не ломая страницу; навигация «Сегодня»/«Обзор»
из палитры; t-scandi + тёмная (модалки через data-modal — стили уже есть).

Обнови references/architecture.md (GlobalModals, палитра-действия).

## КОММИТ

```bash
git add src/components src/lib "src/app/(dashboard)/layout.tsx"
git commit -m "feat(palette): Sprint W2a — command palette 2.0: действия создания, GlobalModals host, shortcuts"
```
