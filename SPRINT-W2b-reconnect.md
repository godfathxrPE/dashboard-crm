# Claude Code Prompt — Sprint W2b: Reconnect («контакты остывают»)

## Контекст

Паттерн Clay/folk: CRM сама говорит, какие отношения остывают. Для длинных
B2B-циклов (сделки Олега 500K–10M, месяцы переговоров) потеря касания =
потеря сделки.

**Архитектурное решение (принято, не менять): last_touch считается на
клиенте.** Calls и meetings уже целиком в React Query-кеше — деривация
бесплатна. НИКАКИХ миграций, view и триггеров в этом спринте.

## РАЗВЕДКА

```bash
# Поля связи звонков/встреч с контактами (фактические имена)
grep -n "contact_id" src/lib/hooks/use-calls.ts src/lib/hooks/use-meetings.ts | head
# Контакты: структура Contact, есть ли last_touch-подобное
grep -n "interface Contact\|type Contact" -A 15 src/lib/hooks/use-contacts.ts | head -25
# TodayView: куда встраивать секцию (после «Сделки без шага»)
grep -n "СДЕЛКИ БЕЗ ШАГА\|Сделки без шага\|section" src/components/today/TodayView.tsx | head
# Таблица контактов: колонки
grep -n "thead\|<th" src/components/contacts/*.tsx | head
# W2a: сигнатура openModal — можно ли передать контекст (contactId)
grep -n "openModal" src/lib/stores/ui-store.ts src/components/shared/GlobalModals.tsx | head
```

## ЗАДАЧА 1: Хук useLastTouch

Новый `src/lib/hooks/use-last-touch.ts`:

```typescript
// Map<contactId, { date: string; kind: 'call' | 'meeting' }>
// max по: calls.date (только status done!), meetings.date (только прошедшие)
export function useLastTouchMap(): Map<string, LastTouch>
export function daysSince(dateIso: string): number
```

- Запланированный, но не сделанный звонок — НЕ касание. Только состоявшиеся.
- Порог тишины: в `src/lib/constants/` — `RECONNECT_THRESHOLD_DAYS = 21`
  (одна константа, позже станет настройкой).
- «Остывающий контакт»: last_touch старше порога ИЛИ касаний нет вовсе,
  НО показываем только контакты, привязанные к активным сделкам или
  компаниям с активными сделками (иначе весь справочник из 75+ компаний
  хлынет в очередь). Разведай связь contact → project (contact_id в
  projects) и реализуй фильтр «участвует в активной сделке».

## ЗАДАЧА 2: Секция «Остывают» в TodayView

После «Сделки без шага»:
- топ-5 по давности (самые холодные сверху), счётчик в заголовке — общий;
- строка: имя контакта + компания; meta: «N дн. без касания» / «касаний
  не было» (yellow-text); при >2×порога — red-text;
- primary-действие «Запланировать звонок»: openModal('call') с préfill
  contact_id — если ui-store openModal не умеет payload, расширь вторым
  опциональным аргументом `context?: { contactId?: string }`, GlobalModals
  пробрасывает в CallModal (разведай его пропсы: defaultContactId есть ли,
  по образцу defaultCompanyId в ProjectModal);
- тело строки → /contacts/[id];
- секция под тем же collapse-паттерном, что остальные (если его нет — все
  секции равноправны, просто добавь).

## ЗАДАЧА 3: Колонка в таблице контактов

«Касание» — дата последнего касания (formatDisplay «12 июн» / «—»),
муted; при превышении порога — yellow-text + значение «N дн.».
Сортировка по этой колонке, если таблица уже умеет сортировку по колонкам
(разведай); если нет — только отображение, сортировку не городить.

## ЗАДАЧА 4: ContactDetailHub

В шапку 360-карточки контакта — тот же индикатор («N дн. без касания»)
рядом с существующими метаданными, тем же визуальным языком, что
«Здоровье» в DealFocusPanel (W1c).

## ПРОВЕРКА

```bash
npx tsc --noEmit   # baseline 0 — держим 0
npm run dev
```

Руками: контакт со старым звонком → в «Остывают» на /; «Запланировать
звонок» открывает CallModal с préfilled контактом; контакт без активных
сделок в очередь НЕ попадает; колонка в /contacts; индикатор в карточке
контакта; t-scandi + тёмная.

Обнови references/architecture.md (use-last-touch, секция Остывают).

## КОММИТ

```bash
git add src/components src/lib
git commit -m "feat(reconnect): Sprint W2b — last_touch на клиенте, секция Остывают, касание в контактах"
```
