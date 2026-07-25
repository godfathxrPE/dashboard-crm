# Claude Code Prompt — Sprint T1: Контакты — единый телефон + дедуп ролей-чипов (D2)

Две находки live-аудита экрана «Контакты», обе про нормализацию:

1. **Телефоны в разнобой.** Таблица показывает сырой `c.phone`, поэтому в
   колонке соседствуют `8 913 470-41-30`, `+7 (911) 769-5012`, `8 (916)
   451-8055`, `+7 911-984-75-71` и битый `7110`. Нужен единый display-формат
   `+7 (XXX) XXX-XX-XX`, недеструктивно (хранимое значение не трогаем;
   непарсируемое — как есть).
2. **Дубли фильтр-чипов по роли.** Чипы «top-5 позиций» строятся из сырого
   `c.position` с точным match, поэтому синонимы дают отдельные чипы и дробят
   счётчики: «Генеральный директор 5» + «ГД 2», «Директор по информационным
   технологиям 2» + «ИТ-директор 2» + «IT директор 1» + «Директор IT 1».
   Схлопнуть синонимы в канонический чип с суммой.

Обе правки — display/filter-only, стораджа `contact.position`/`phone` не
переписывают. Чекаут: `feat/deal-card` (после P2 `bbb1045`). Миграций нет.

> Alias-карта ролей засеяна из РЕАЛЬНОЙ БД (26 distinct positions). Безопасные
> merge-кластеры: ГД→Генеральный директор; ИТ-директор/IT директор/Директор
> IT→Директор по информационным технологиям; Глав. бух.→Главный бухгалтер.
> «Технический директор», «Бухгалтер», «Директор», «И.О. Генерального
> директора» — РАЗНЫЕ роли, НЕ мерджить. `ts_Принимает решение` — тестовый
> мусор, игнор (в top-5 не попадёт).

---

## РАЗВЕДКА

```bash
git log --oneline -1
cat src/lib/utils/phone.ts                       # есть только normalizePhone (для сравнения)
grep -n "positionFilters\|freq\[c.position\]\|c.position === pos\|key: 'phone'\|EditableCell" src/components/contacts/ContactsTable.tsx
sed -n '86,99p' src/components/shared/EditableCell.tsx   # non-editing render ({value || placeholder})
grep -n "l.phone\|contact.phone\|PhoneList" src/components/leads/LeadsView.tsx src/components/contacts/ContactPeekContent.tsx src/components/contacts/ContactDetail.tsx
```

---

## ЗАДАЧА 1: два util'а

### 1a. `src/lib/utils/phone.ts` — добавить `formatPhone` (НЕ трогать `normalizePhone`)

```ts
/** Display-format RU phone → +7 (XXX) XXX-XX-XX.
 *  Недеструктивно: непарсируемое (напр. "7110") возвращаем как есть. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let n = raw.replace(/\D/g, '');
  if (n.length === 11 && n[0] === '8') n = '7' + n.slice(1);
  else if (n.length === 10) n = '7' + n;
  if (n.length === 11 && n[0] === '7') {
    return `+7 (${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7, 9)}-${n.slice(9, 11)}`;
  }
  return raw;
}
```

### 1b. `src/lib/utils/position.ts` — НОВЫЙ файл

```ts
// Схлопывание синонимов должностей в один фильтр-чип.
// Display/filter-only — стораджа contact.position НЕ переписывает.
const POSITION_ALIASES: Record<string, string> = {
  'гд': 'Генеральный директор',
  'ит-директор': 'Директор по информационным технологиям',
  'it директор': 'Директор по информационным технологиям',
  'директор it': 'Директор по информационным технологиям',
  'глав. бух.': 'Главный бухгалтер',
};

/** Каноническая должность: схлопнуть пробелы + известные синонимы. */
export function canonicalPosition(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  return POSITION_ALIASES[cleaned.toLowerCase()] ?? cleaned;
}
```

## ЗАДАЧА 2: `EditableCell` — опциональный `format` для покоящегося вида

Инпут правит и сохраняет СЫРОЕ значение; форматируем только не-editing вид,
чтобы inline-edit не сломать.

1. В `EditableCellProps` добавить:
```ts
  format?: (value: string) => string;
```
2. В деструктуризацию пропсов добавить `format`.
3. В non-editing `return` заменить:
```tsx
      {value || placeholder}
```
на:
```tsx
      {value ? (format ? format(value) : value) : placeholder}
```

(остальное — `draft`, `onSave`, guard'ы — НЕ трогать.)

## ЗАДАЧА 3: применить в `ContactsTable.tsx`

Импорт: `import { formatPhone } from '@/lib/utils/phone';` и
`import { canonicalPosition } from '@/lib/utils/position';`

**3a. Телефон-колонка** — добавить `format` в `EditableCell`:
```tsx
        <EditableCell
          value={c.phone}
          type="tel"
          format={formatPhone}
          className="text-text-dim whitespace-nowrap tabular-nums"
          onSave={(val) => updateContact.mutateAsync({ id: c.id, phone: val || null })}
        />
```

**3b. Дедуп чипов** — в `positionFilters` две точечные замены:

частота по канону:
```tsx
      if (c.position) freq[c.position] = (freq[c.position] || 0) + 1;
```
→
```tsx
      if (c.position) { const cp = canonicalPosition(c.position); freq[cp] = (freq[cp] || 0) + 1; }
```

матчер по канону:
```tsx
        acc[`pos_${pos}`] = (c) => c.position === pos;
```
→
```tsx
        acc[`pos_${pos}`] = (c) => c.position != null && canonicalPosition(c.position) === pos;
```

(Лейбл чипа `key.replace('pos_', '')` теперь = каноническая роль, счётчик
суммируется автоматически через `useChipFilter`. Ничего больше в chipOptions
не менять.)

## ЗАДАЧА 4: тот же `formatPhone` на read-only отображениях (консистентность)

Чтобы телефоны не были едины в Контактах и сырые в остальных местах:

- `LeadsView.tsx` — таблица (`<span…>{l.phone}</span>` → `{formatPhone(l.phone)}`)
  и карточка (`{lead.phone}` в card-view) → `{formatPhone(lead.phone)}`.
- `ContactPeekContent.tsx` — видимый текст `{contact.phone}` → `{formatPhone(contact.phone)}`.
  **href `tel:${contact.phone}` НЕ трогать** (ссылка на сырые цифры).
- `ContactDetail.tsx` → если `PhoneList` рендерит сырой номер — обернуть каждый
  в `formatPhone` внутри `PhoneList` (по РАЗВЕДКЕ; если там уже формат — пропустить).

Не трогать инпут-формы (`ContactModal`/`PhoneFields`/`CompanyModal`) — там ввод
сырого, формат display-only.

---

## СМОК

`/contacts`:
- Колонка «Телефон»: все валидные → `+7 (XXX) XXX-XX-XX`; битый `7110`
  остаётся `7110` (не искажён). Клик по номеру → инпут показывает СЫРОЕ
  хранимое значение, правка сохраняется (без двойного PATCH), формат
  возвращается после сейва.
- Чипы: «Генеральный директор» = **7** (было 5), чипа «ГД» **нет**;
  «Директор по информационным технологиям» = **6**, отдельных «ИТ-директор» /
  «IT директор» / «Директор IT` **нет**; «Юрист» = 2 без изменений. Клик по
  объединённому чипу фильтрует все синонимы.
- `/leads` и карточка контакта: телефоны в том же формате.

```bash
npx tsc --noEmit   # 0
```

## КОММИТ

```bash
git add src/lib/utils/phone.ts src/lib/utils/position.ts src/components/shared/EditableCell.tsx src/components/contacts/ContactsTable.tsx src/components/leads/LeadsView.tsx src/components/contacts/ContactPeekContent.tsx src/components/contacts/ContactDetail.tsx
git commit -m "feat(contacts): единый display-формат телефона + схлопывание синонимов ролей в фильтр-чипах"
```

НЕ пушить без подтверждения. Миграций нет.
