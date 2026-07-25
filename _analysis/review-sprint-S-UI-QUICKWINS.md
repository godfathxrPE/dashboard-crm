# Ревью: S-UI-QUICKWINS — F-05 / F-07 / F-11 (три quick-win из аудита aura)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/aura-nav` @ `e326821`)  
**Объект:** `_analysis/sprint-S-UI-QUICKWINS.md` — нейтральные win/loss-кнопки, KPI без зелени на /deals, телефон nowrap  
**Контекст:** аудит aura 2026-07-19; client-only; ветка `feat/ui-quickwins`; не пересекается с S-AURA-NAV-1 (другие файлы)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА vs live | ✅ строки и символы совпали |
| Schema / RLS | ✅ N/A |
| Scope / границы | ✅ три файла, точечные классы |
| Дизайн-правило (цвет = статус/намерение) | ✅ |
| EditableCell + className | ✅ прокидывается на display-span |
| Готовность к CC | ✅ |

**Оценка: 9/10.** Чистый quick-win-спринт, разведка 1:1, без блокеров.  
**Рекомендация:** запускать в CC as-is.

---

## С чем согласен полностью

### 1. F-05 — always-on кнопки vs статус-бейджи (ProjectDetail)

Действия (трогать):

```378:408:src/components/projects/ProjectDetail.tsx
                {wonStage && (
                  <button
                    ...
                    className="rounded-lg border border-green/40 px-2.5 py-1.5 text-xs font-medium text-green
                               transition-colors hover:bg-green-l"
                  >
                    Выиграна
                  </button>
                )}
                {lostStage && (
                  <button
                    ...
                    className="rounded-lg border border-red/40 ... text-red ... hover:bg-red-l"
                  >
                    Проиграна
                  </button>
                )}
          ...
            <button
              ...
              className="rounded-lg border border-green/40 ... text-green ... hover:bg-green-l"
            >
              Завершить проект
            </button>
```

Статусы (не трогать) — подтверждены рядом:

- L411–413: `Завершён` → `bg-green-l text-green`
- L415–420: won/lost badge → `bg-green-l text-green` / `bg-red-l text-red`

Целевые классы спринта (`border-border` + `text-text-dim` + hover color) — корректный паттерн «нейтраль в покое / цвет на намерении». Других кнопок «Выиграна»/«Проиграна»/«Завершить проект» в `src/` нет.

Панель выбора причины (L487+ `border-green/30 bg-green-l/40`) — post-click UI, не always-on в шапке; в scope не входит — ок.

### 2. F-07 — KPI на Сделках (PipelineBoard L137/L140)

```134:141:src/components/projects/PipelineBoard.tsx
  const metrics: ... = [
    { label: 'Активные', ... color: 'text-accent', ... },
    {
      label: 'Pipeline', ... color: 'text-green',
      ...
    },
    { label: 'Конверсия', ... color: 'text-green' },
    { label: 'Avg цикл', ... color: 'text-text-main' },
  ];
```

`HeroCard` применяет `color` к значению (L107) — смена на `text-text-main` сразу убирает success-зелень.  
`Активные` / `Avg цикл` — не трогать: верно.  
`DeliveryPipelineBoard` аналогичных green-KPI строк не имеет — gap нет.

Обзор: значения KPI уже `text-text-main` (`DashboardHome` AnimatedNumber); зелёный там — `iconBg`/тренды. Утверждение спринта «Обзор не трогаем» — корректно для *значений*.

### 3. F-11 — телефон + EditableCell

```116:124:src/components/contacts/ContactsTable.tsx
    {
      key: 'phone',
      label: 'Телефон',
      render: (c) => c.phone ? (
        <EditableCell
          value={c.phone}
          type="tel"
          className="text-text-dim"
          onSave={...}
        />
```

`EditableCell` принимает `className?` и вешает на display-`span` (L90–93):

```90:93:src/components/shared/EditableCell.tsx
    <span
      ...
      className={`inline-block cursor-pointer ... ${className}`}
```

`whitespace-nowrap tabular-nums` на `className` **сработает** без обёртки `td`. Fallback в спринте (вешать на td) не понадобится.  
В режиме edit `className` на input не идёт — для F-11 (перенос в idle) не критично.

### 4. Scope / коммит

Только 3 файла, без миграции, без рефакторинга — ок. Сообщение коммита отражает F-05/F-07/F-11.

---

## Блокеры

Нет.

---

## Предупреждения (не блокеры)

### W1. Путь к аудиту

Спринт: `_analysis/audit-aura-design.md`.  
В репо: `improvements/CRMs/audit-aura-design.md`. На исполнение не влияет.

### W2. F-11 в аудите шире (email)

Аудит F-11 также: «email — truncate+title». Спринт сознательно только phone — ок для quick-win; email — follow-up, не gap в scope.

### W3. F-07 в аудите упоминает Обзор

Аудит: «Сделки, Обзор». На Обзоре *значения* уже нейтральны; зелёный — иконки (звонки/конверсия). Спринт не трогает iconBg — правильно для «не раздувать scope»; если на гейте «зелень KPI» всё ещё раздражает — отдельный микро-пасс по `iconBg`, не этот спринт.

### W4. nowrap может дать горизонтальный overflow

Длинный номер без пробелов + nowrap → строка не прыгает (цель F-11), но ячейка может раздвигать колонку. Для таблицы контактов приемлемо; при жалобе — `max-w` + `truncate` + `title`, не сейчас.

### W5. База ветки

Сейчас `feat/aura-nav`. Спринт: main после merge NAV **или** от aura-nav (файлы не пересекаются).  
CC: `feat/ui-quickwins` от актуального base; не от `feat/chat-reactions` если тот ещё жив параллельно.

---

## Пропущенные места

| Файл | Находка | Действие |
|------|---------|----------|
| `ProjectDetail` win/loss reason panels | green chrome после клика | вне scope |
| `DeliveryPipelineBoard` | нет green Pipeline/Конверсия KPI | — |
| `DashboardHome` iconBg green | не значения | вне scope |
| `ContactsTable` email EditableCell | без nowrap/truncate | вне scope (аудит follow-up) |

---

## Предлагаемые правки в спринт (опционально)

1. Ссылка на аудит → `improvements/CRMs/audit-aura-design.md`.
2. В F-11 явно: «EditableCell прокидывает className на span — fallback td не нужен» (чтобы CC не тратил время).
3. В F-05: «панель причины выигрыша/проигрыша (ниже шапки) не трогать».

Иначе — в CC без правок промпта.

---

## Чеклист перед CC

- [x] РАЗВЕДКА: ProjectDetail L378–420, PipelineBoard L137/L140, ContactsTable L118–123, EditableCell className — OK
- [x] Нет SQL / RLS
- [x] Статус-бейджи won/lost/completed — в «не трогать»
- [ ] Ветка `feat/ui-quickwins` от актуального main/aura-nav
- [ ] Смоук: шапка сделки (покой/hover + badge); /deals KPI; /contacts телефоны; aura + тёмная тема

---

## crm-architect checklist

- [x] РАЗВЕДКА в начале
- [x] Реальные пути и символы
- [x] Нет угаданных таблиц / SQL
- [x] CSS: семантические утилиты (`border-border`, `text-text-dim`, `text-green` на hover)
- [x] Scope узкий, «ЖЁСТКО НЕ» согласовано с аудитом (F-04/F-01/F-08 out)
- [x] schema.md N/A
