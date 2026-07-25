# Claude Code Prompt — Sprint M8: Excel-импорт плана на вкладке «Гант» (D2)

Фича Excel→задачи-с-датами уже есть (`PlanImportButton`, S-PLAN-IMPORT-1), но
живёт ТОЛЬКО на вкладке «План» (доска). На «Ганте» её нет — а именно там
датированный план из Excel строит таймлайн (датированные задачи → бары,
недатированные → «БЕЗ ДАТ»). Задача: вынести существующую кнопку на Гант +
добавить скачивание шаблона .xlsx (формат колонок сейчас нигде не подсказан).

НЕ переписывать импортер — переиспользовать. Не трогать «БЕЗ ДАТ»-стену (это
отдельный трек). Чекаут: feat/deal-card (после M5b/M6/M7 пуша).

> v1.1 — по ревью Grok (8/10): B1 — у модалки НЕТ экрана «выбор файла» (поток =
> скрытый input + внешний триггер → сразу mapping). «Скачать шаблон» вешать
> РЯДОМ с кнопкой «Импорт плана» внутри PlanImportButton (виден и на Плане, и на
> Ганте), не в модалке. + try/catch на download (W2), Download из lucide,
> пример даты в шаблоне — RU дд.мм.гггг (W1).

---

## РАЗВЕДКА

```bash
git log --oneline -1
grep -n "PlanImportButton\|activeTab === 'timeline'\|activeTab === 'board'\|GanttTimeline" src/components/projects/ProjectDetail.tsx
grep -n "export function PlanImportButton\|fileRef\|accept=\".xlsx\|import('xlsx')\|type=\"file\"\|Загруз\|выбер\|drop" src/components/tasks/PlanImport.tsx
```

Подтвердить: на `activeTab === 'board'` есть
`{isDelivery && <div className="mb-2 flex justify-end"><PlanImportButton projectId={projectId} canImport={canManage} /></div>}`;
на `activeTab === 'timeline'` — только `<GanttTimeline … />`. `PlanImportButton`
уже импортирован в ProjectDetail.

---

## ЗАДАЧА 1: Кнопка импорта на вкладке «Гант»

В `ProjectDetail.tsx`, блок `activeTab === 'timeline'`, обернуть GanttTimeline и
добавить ту же кнопку тем же паттерном, что на доске (delivery-only,
right-aligned над Гантом):

```tsx
{activeTab === 'timeline' && (
  <div>
    {isDelivery && (
      <div className="mb-2 flex justify-end">
        <PlanImportButton projectId={projectId} canImport={canManage} />
      </div>
    )}
    <GanttTimeline
      projectId={projectId}
      canManage={canManage}
      onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true); }}
    />
  </div>
)}
```

(пропсы GanttTimeline не менять — только обёртка + кнопка. `PlanImportButton`
самодостаточен: своя модалка, `if (!canImport) return null` внутри.)

## ЗАДАЧА 2: Скачивание шаблона .xlsx — РЯДОМ с кнопкой импорта

ВАЖНО (B1 ревью): у модалки НЕТ экрана «выбор файла» — поток PlanImport это
скрытый `<input type="file">` + внешняя кнопка-триггер, после парсинга модалка
открывается сразу на шаге mapping. Поэтому «Скачать шаблон» вешать НЕ в модалку
(там он появился бы уже после загрузки файла — бессмысленно для онбординга), а
РЯДОМ с самой кнопкой «Импорт плана» внутри `PlanImportButton` — тогда шаблон
доступен и на «Плане», и на «Ганте» (один компонент, два mount'а).

1. Функция (внутри PlanImportButton):

```tsx
async function downloadTemplate() {
  try {
    const XLSX = await import('xlsx');   // тот же lazy-паттерн, что при чтении
    const rows = [
      ['Фаза', 'Задача', 'Дата начала', 'Дата окончания', 'Веха', 'WBS'],
      ['Обследование', 'Согласовать договор и ДС на этап', '20.07.2026', '24.07.2026', '', '1.1'],
      ['Обследование', 'Отчёт об обследовании', '25.07.2026', '30.07.2026', 'да', '1.8'],
      ['Моделирование', 'Разработка контрольных примеров', '31.07.2026', '07.08.2026', '', '2.2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'План');
    XLSX.writeFile(wb, 'план-шаблон.xlsx');
  } catch {
    toast.error('Не удалось скачать шаблон');
  }
}
```

2. По РАЗВЕДКЕ найти в `PlanImportButton` рендер кнопки-триггера «Импорт плана»
и обернуть её + новую кнопку в группу:

```tsx
<div className="flex items-center gap-2">
  <button type="button" onClick={() => void downloadTemplate()}
    className="flex items-center gap-1 text-xs text-accent hover:underline">
    <Download size={13} /> Скачать шаблон .xlsx
  </button>
  {/* существующая кнопка «Импорт плана» — БЕЗ изменений */}
</div>
```

- `Download` импортировать из lucide (рядом с `Upload`).
- Колонки шаблона обязаны совпадать с `autoDetectPlanMapping`
  (Фаза/Задача/Дата начала/Дата окончания/Веха/WBS) — иначе автодетект на
  скачанном шаблоне не сработает. Даты `дд.мм.гггг` парсит `parsePlanDate`.
- `type="button"` на template — чтобы не сабмитило форму.

---

## СМОК

Проект «Аграрная группа — внедрение» (delivery):
- вкладка «Гант»: над таймлайном справа появилась «Импорт плана» (как на «Плане»);
- клик → та же модалка mapping→preview→import;
- «Скачать шаблон .xlsx» — кнопка РЯДОМ с «Импорт плана» (и на Ганте, и на
  Плане); отдаёт файл с 6 колонками + примерами; повторный импорт этого шаблона
  проходит автодетект без ручного маппинга (все колонки замаплены сами);
- импортированные задачи с датами появляются барами на Ганте, без дат — в
  «БЕЗ ДАТ» (поведение самого Ганта не менялось);
- у client-проекта (не delivery) кнопки нет (isDelivery-гейт), как на доске;
- вкладка «План» — кнопка на месте, не задвоилась.
tsc 0.

## КОММИТ

```bash
git add src/components/projects/ProjectDetail.tsx src/components/tasks/PlanImport.tsx
git commit -m "feat(gantt): импорт плана из Excel на вкладке Гант + скачивание шаблона .xlsx"
```

НЕ пушить без подтверждения. Миграций нет.
