# Claude Code Prompt — Sprint W1a: Always Next Action + Rotting Indicator

## Контекст

Паттерн Pipedrive «activity-based selling»: у каждой активной сделки всегда
есть следующий шаг с датой; сделка без шага или с просроченным шагом «гниёт»
и подсвечивается. В projects уже есть `next_step` (text) — добавляем к нему
дату и индикацию, НЕ создавая дублирующее поле.

**Правила проекта:** миграции — отдельные файлы в `supabase/migrations/`,
применяются вручную в SQL Editor (никакого `supabase db push`); порядок
Migration → Types → Validator → Hook → Component; `ADD COLUMN IF NOT EXISTS`;
цвета только через CSS-переменные; тест на t-scandi + одной тёмной теме.

## РАЗВЕДКА

```bash
# Актуальная схема projects (поля стадий после «Пути A»)
grep -n "stage_id\|phase_group\|next_step" src/types/database.ts | head -20

# Как определяется «закрытая» сделка после депрекейта stage
grep -rn "phase_group" src/lib src/components --include="*.ts*" | grep -i "closed\|won\|lost\|active" | head -10

# Где рендерится next_step
grep -rn "next_step" src/components/projects/ProjectCard.tsx src/components/projects/ProjectsTable.tsx src/components/projects/ProjectModal.tsx

# Номер следующей миграции (в repo 016 последняя, но проверь применённые)
ls supabase/migrations/
```

Если фактические значения phase_group отличаются от предположений ниже —
скорректируй условие «активная сделка» по факту разведки.

## ЗАДАЧА 1: Миграция

Файл `supabase/migrations/017_next_action_date.sql`:

```sql
-- Sprint W1a: activity-based selling
ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_action_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pinned_note text;

COMMENT ON COLUMN projects.next_action_date IS 'Дата следующего шага (next_step). NULL у активной сделки = rotting';
COMMENT ON COLUMN projects.pinned_note IS 'Закреплённая заметка (Focus panel, Sprint W1c)';
```

НЕ применяй сам — файл создаётся для ручного применения в SQL Editor.
После создания файла напомни пользователю применить миграцию.

## ЗАДАЧА 2: Типы и валидатор

1. `src/types/database.ts`: добавь `next_action_date: string | null` и
   `pinned_note: string | null` в Row/Insert/Update таблицы projects.
2. `src/lib/validators/project.ts`: `next_action_date` — optional nullable
   строка-дата (по образцу существующего поля deadline).

## ЗАДАЧА 3: Rotting-утилита

Новый файл `src/lib/utils/deal-health.ts`:

```typescript
import type { Project } from '@/types/entities';

export type DealHealth = 'ok' | 'no-action' | 'overdue-action';

export function getDealHealth(project: Project): DealHealth {
  // Закрытые сделки не гниют — условие уточни по факту разведки phase_group
  if (isClosed(project)) return 'ok';
  if (!project.next_step?.trim()) return 'no-action';
  if (!project.next_action_date) return 'no-action';
  const today = new Date(new Date().toDateString());
  if (new Date(project.next_action_date) < today) return 'overdue-action';
  return 'ok';
}
```

`isClosed` реализуй по фактической модели стадий (phase_group из разведки).

## ЗАДАЧА 4: UI-индикация

Все цвета — через переменные (--yellow / --red + их *-l), никаких hex.

1. **ProjectCard**: рядом с `next_step` (или на его месте, если пуст):
   - `no-action` → маркер + «нет следующего шага» цветом var(--yellow-text, var(--yellow))
   - `overdue-action` → «шаг просрочен N дн.» цветом var(--red-text, var(--red))
   - `ok` → как сейчас, плюс дата шага мелким рядом.
2. **ProjectsTable**: точка-индикатор в строке (та же логика), title с текстом.
3. **ProjectModal**: поле «Дата следующего шага» (date input) рядом с next_step.
   RHF + Zod по образцу deadline.
4. В Scandi статусы монохромные — проверь, что маркеры различимы формой
   (заполненная/контурная точка), по паттерну .pill-* из globals.css.

## ЗАДАЧА 5: Prompt при смене стадии (мягкий)

В месте, где сделка перетаскивается в новую стадию (kanban board, разведай
обработчик drop): после успешного переноса, если next_action_date пустая или
в прошлом — показать ненавязчивый toast/inline-подсказку «Запланируй следующий
шаг» с кнопкой, открывающей ProjectModal на этом поле. БЕЗ блокирующей модалки.

## ПРОВЕРКА

```bash
npx tsc --noEmit   # MeetingModal — 6 pre-existing ошибок, игнорируй только их
npm run dev
```

Руками: Projects kanban + table в t-scandi и t-frost — сделка без next_step
помечена; с просроченной датой — помечена красным; закрытая — нет.
Обнови references/schema.md в скилле crm-architect (новые колонки, migration 017).

## КОММИТ

```bash
git add supabase/migrations/017_next_action_date.sql src/types src/lib src/components
git commit -m "feat(deals): Sprint W1a — next_action_date + rotting indicator (activity-based selling)"
```
