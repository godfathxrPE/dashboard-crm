# Claude Code Prompt — Sprint M5: Проект — план к сгибу (D2)

Закрывает F-10 аудита: на деталке проекта табы (Активность/План/Гант/Чат — там
живёт работа) стоят ПОСЛЕ пяти полноширинных мета-блоков, план начинается за
~2 экрана скролла. Фикс — 1С:ДО + Заметки + Файлы + Видео уходят в
сворачиваемую секцию «Материалы проекта» (по умолчанию закрыта). Info-grid и
Команда остаются видимыми (компактны и контекстно полезны).

Хирургический перенос JSX, без правки логики стадий/гейтов/пайплайна.
Компактизация самого стептера — отдельный M5b, в этот спринт НЕ входит.

Чекаут: feat/deal-card. Файл большой (~48KB) — работать по маркерам секций,
не по номерам строк.

---

## РАЗВЕДКА

```bash
git log --oneline -1
F=src/components/projects/ProjectDetail.tsx
grep -n "1С:ДО\|Заметки проекта\|<ProjectFiles\|<ProjectVideos\|<ProjectTeam\|PCT-1: вкладки\|Info grid" $F
grep -n "useState\|ChevronRight\|ChevronDown\|import { cn }" $F | head
```

Ожидаемый порядок в return-дереве (подтвердить грепом): Info grid → ProjectTeam
→ **1С:ДО → Заметки → ProjectFiles → ProjectVideos** → tabs (комментарий
«PCT-1: вкладки»). Переносим средний блок (1С:ДО…Видео), Info-grid и Team не
трогаем, tabs остаются на месте — но окажутся сразу под Team.

---

## ЗАДАЧА 1: Сворачиваемая секция «Материалы проекта»

1. Стейт (рядом с прочими useState компонента):

```tsx
const [showMaterials, setShowMaterials] = useState(false);
```

Проверить импорты: `useState`, `cn` (`@/lib/utils/cn`), `ChevronRight`
(lucide) — добавить недостающее.

2. Вырезать четыре смежных блока JSX ЦЕЛИКОМ, сохранив их разметку без
изменений: `1С:ДО` (span+input ссылки) · `Заметки проекта` (StickyNote + textarea)
· `<ProjectFiles … />` · `<ProjectVideos … />`.

3. На их место (после ProjectTeam, перед комментарием «PCT-1: вкладки»)
вставить disclosure и внутрь него — вырезанные блоки без изменений:

```tsx
<div className="mb-4">
  <button
    type="button"
    onClick={() => setShowMaterials((v) => !v)}
    aria-expanded={showMaterials}
    className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-surface px-4 py-2.5 text-left transition-colors hover:bg-surface2"
  >
    <ChevronRight size={15} className={cn('shrink-0 text-text-mute transition-transform', showMaterials && 'rotate-90')} />
    <span className="text-xs font-semibold uppercase tracking-wide text-text-mute">Материалы проекта</span>
    <span className="ml-auto text-[11px] text-text-mute">1С:ДО · заметки · файлы · видео</span>
  </button>
  {showMaterials && (
    <div className="mt-3 space-y-4">
      {/* сюда — 1С:ДО, Заметки, ProjectFiles, ProjectVideos без изменений */}
    </div>
  )}
</div>
```

Если у вырезанных блоков были собственные внешние отступы (mb-4/mb-6) — оставить
как есть внутри `space-y-4` контейнера, лишний нижний margin последнего убрать
при необходимости визуально.

## ЗАДАЧА 2 (проверка, не правка): дефолтный таб

Убедиться, что логика `activeTab = tab ?? (isDelivery ? 'board' : 'activity')`
не тронута — delivery-проект по-прежнему открывается на «План», клиентский на
«Активность». Перенос материалов НЕ должен её задеть.

---

## СМОК

Проект «Аграрная группа — внедрение» на 1440×900:
- секция «Материалы проекта» свёрнута по умолчанию; табы (Активность/План/Гант/
  Чат) и доска Плана видны без скролла ниже пайплайна+Info-grid+Команды;
- клик по «Материалы» раскрывает 1С:ДО, Заметки, Файлы, Видео; повторный —
  скрывает; шеврон поворачивается;
- редактирование заметок, загрузка файла, добавление видео работают внутри
  раскрытой секции (перенос не сломал обработчики);
- delivery открывается на План, клиентский проект — на Активность;
- прогнать на minimal + одной тёмной теме (frost) — карточка disclosure на
  surface читается.
tsc 0.

## КОММИТ

```bash
git add src/components/projects/ProjectDetail.tsx
git commit -m "refactor(project): материалы (1С:ДО/заметки/файлы/видео) в сворачиваемую секцию — план к сгибу (F-10)"
```

НЕ пушить без подтверждения. Миграций нет.
