# Claude Code Prompt — Sprint UI-D1: скобки-артефакты + мультителефон + клип дропдауна

Три независимых пункта от Олега (скрины-эталоны у него). Ветка: main. Одна миграция (D1.2),
её применяет гейт Cowork — НЕ применять.

## РАЗВЕДКА
```bash
sed -n '1010,1055p' src/app/globals.css                      # aura bracket-suppression (образец)
grep -rn "<Bracket\|className=\"bracket\|Bracket>" src --include="*.tsx"   # где .bracket
cat src/components/shared/AssigneeSelect.tsx | sed -n '1,140p' # popup absolute z-50
cat src/components/shared/Combobox.tsx | sed -n '120,170p'    # тот же паттерн popup
grep -n "phone" src/types/database.ts src/lib/validators/contact.ts src/lib/validators/company.ts
sed -n '155,175p' src/components/contacts/ContactModal.tsx    # phone input
grep -n "phone\|useFieldArray" src/components/companies/CompanyModal.tsx
```

## ЗАДАЧА 1 (баг): убрать угловые скобки 「 」 на всех темах кроме aura

Скобки — декор эпохи scandi (глобальный `.bracket::before/::after` в `src/components/ui/Bracket.tsx`).
После удаления scandi (AUDIT C) они «протекли» на CompanyDetail/ContactHub/Calls/лейны/drawer во
washi/fuji/frost/aurora/tidal как висящие уголки (артефакт на скрине HH detail). Aura их уже гасит
(`.t-aura .bracket::before/::after{display:none}`, globals ~:1018) + даёт карточное оформление.

**Фикс:** распространить подавление уголков на ВСЕ темы — вынести правило из `.t-aura`-скоупа в
глобальное `.bracket::before, .bracket::after { display: none !important; }`. Скобки больше не нужны
ни в одной из 6 тем (scandi, для которой они были, удалён).
- Карточное оформление (`[data-card]/.contact-profile-card/aside .bracket → surface+border+radius+
  shadow`) — тоже сделать глобальным ИЛИ проверить, что без уголков detail-блоки читаются как есть
  (flat labels). На тёмных стеклянных темах surface полупрозрачен — если даёшь карточку, бери
  непрозрачный тон как у модалок, иначе оставь flat. Реши по живому виду, приоритет — чтобы не было
  «висящих уголков» и блоки читались.
- НЕ трогать fuji sidebar diagonal-corners (`:502-521`, это активный маркер нава, не .bracket-декор).

## ЗАДАЧА 2 (фича): несколько телефонов на contacts И companies

Решение Олега: **JSONB-массив** `phones` на обеих таблицах, старая `phone` остаётся primary-зеркалом.

### 2.1 Миграция `supabase/migrations/041_multi_phone.sql` (НЕ применять — гейт)
```sql
ALTER TABLE public.contacts  ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Бэкфилл: существующий одиночный phone → первый элемент массива type='mobile', is_primary=true
UPDATE public.contacts  SET phones = jsonb_build_array(jsonb_build_object(
  'type','mobile','value',phone,'is_primary',true)) WHERE phone IS NOT NULL AND phones = '[]'::jsonb;
UPDATE public.companies SET phones = jsonb_build_array(jsonb_build_object(
  'type','work','value',phone,'is_primary',true))   WHERE phone IS NOT NULL AND phones = '[]'::jsonb;
```
Никаких новых функций → REVOKE-правило проекта не применяется (только колонки). RLS не меняется
(phones живёт в той же строке, покрыт существующими политиками contacts/companies).
schema.md: добавить colonку phones в обе таблицы, пометить `Pending 041`.

### 2.2 Типы + валидатор
- `database.ts`: `phones: PhoneEntry[]` (или Json) в contacts/companies Row/Insert/Update.
  Локальный тип `interface PhoneEntry { type: 'mobile'|'work'|'other'; value: string; is_primary: boolean }`.
- Zod: `phoneEntrySchema` + `phones: z.array(phoneEntrySchema).default([])` в contact.ts/company.ts.
  Оставить `phone` в схеме для обратной совместимости (Backward Compat H2).

### 2.3 UI формы (ContactModal + CompanyModal)
- React Hook Form `useFieldArray({ name: 'phones' })`. Строка = [select type (Мобильный/Рабочий/
  Другой)] + [input value, normalizePhone на blur] + [radio/кнопка «основной»] + [удалить].
  Кнопка «+ телефон» добавляет строку. Минимум 0 строк (телефон необязателен).
- **Синхронизация с legacy `phone`**: на submit — primary-телефон (is_primary || первый)
  пишется и в `phone` (одиночная колонка), чтобы дедуп-логика (ContactModal:78-87, normalizePhone)
  и списки, читающие `phone`, не сломались. Это ключевой момент backward-compat.
- Существующий одиночный input phone заменить на этот field-array (в ContactModal ~:165, в
  CompanyModal — поле phone из конфига :99 вынести в кастомный блок).

### 2.4 Отображение (ContactDetail :77 / CompanyDetail :88)
Вместо одной строки «Телефон: value» — список: primary сверху с меткой, остальные с типом
(Мобильный/Рабочий/Другой). Если phones пуст, fallback на legacy `phone`. Клик — tel: ссылка.

## ЗАДАЧА 3 (баг): дропдаун селекта клипается скроллом модалки

Modal primitive (A1) даёт телу `overflow-y-auto overscroll-contain` (Modal.tsx:110). Попапы
AssigneeSelect (`absolute z-50`, :116) и Combobox (:142) абсолютно позиционированы ВНУТРИ этого
скролл-контейнера → обрезаются, «Ответственный» внизу требует прокрутки, дропдаун виден частично
(скрин Олега).

**Фикс:** портал попапа наружу overflow-контейнера. В AssigneeSelect И Combobox:
- Считать позицию триггера через `ref.getBoundingClientRect()`, рендерить `<ul>` через
  `createPortal(…, document.body)` с `position: fixed`, координаты от триггера, `z-index: 1100`
  (выше модалки 1000, ниже тоста — сверь иерархию z-index в theme-system/globals).
- Ширина = ширине триггера; пересчёт на scroll/resize (listener) ИЛИ закрывать попап на скролл
  контейнера (проще, приемлемо).
- Клик-аутсайд и клавиатура (Esc/стрелки, если уже есть) сохранить. Фокус-менеджмент не ломать.
- Проверить оба компонента в модалках И вне модалок (на страницах-списках как фильтр) — портал не
  должен сломать позиционирование там.

Альтернатива если портал слишком инвазивен: drop-up (открывать вверх, когда триггер в нижней
трети вьюпорта) — но портал правильнее и чинит класс проблемы для всех селектов в модалках.

## ВЕРИФИКАЦИЯ (tsc/build/vitest + гейт Cowork live)
1. Все 6 тем: нет висящих уголков `「 」`; detail-блоки читаются.
2. Контакт/компания: добавить 2 телефона (мобильный+рабочий), сохранить, primary в списке и в
   legacy phone; дедуп по телефону работает; отображение в detail.
3. Модалка «Новый контакт»: селект «Ответственный» и «Компания» открываются ПОЛНОСТЬЮ, без
   прокрутки тела, не обрезаны.
4. Селекты вне модалок (фильтры) не сломаны.
5. Гейт: применить 041, смоук бэкфилла (contacts/companies phones заполнены из phone), advisors.

## КОММИТЫ
```
git add src/app/globals.css src/components/ui/Bracket.tsx
git commit -m "fix(themes): убраны декор-скобки 「」 во всех темах (реликт scandi, артефакты после AUDIT C)"
git add supabase/migrations/041_multi_phone.sql docs/schema.md src/types src/lib/validators
git commit -m "feat(contacts): мультителефон — phones jsonb на contacts/companies (041, pending), типы+валидаторы"
git add src/components
git commit -m "feat(contacts): UI мультителефона (useFieldArray) + fix клипа дропдаунов в модалках (портал попапа)"
```

## VERIFICATION LABELS (ожидаемо)
Type Safety: WARNING | RLS: PASS (phones в существующих политиках) | Backward Compat: WARNING
(legacy phone синхронизируется — проверить дедуп/списки) | Runtime: NOT_VERIFIED
