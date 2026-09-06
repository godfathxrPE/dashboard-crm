# Спринт S-DEAL-CHZ-1 — блок «Честный Знак» на карточке сделки

**Вход:** `main` = `a3d182d`. **Миграций НЕТ** — вся работа на существующих данных.
**Ветка:** `feat/deal-chz-1` (через `worktree-isolation`; не забыть симлинк `.env.local`).
**Baseline:** снять в разведке (lint / vitest), сверить в финальной проверке.
**Мокап не требуется:** это точечная правка — одна карточка на существующей рельсе
«Контекст», не новый экран и не перекомпоновка (тип 3 у `crm-ui-designer`).

---

## Зачем (прочитать до кода)

Маркировка — предметная область сделок Первого Бита, и профиль ЧЗ компании уже
собран: `companies.chz_groups` (123, applied), справочник-снапшот
`src/lib/data/chz-groups.ts`, резолвер `resolveChzProfile` (declared > derived),
`ChzBadge`. Показывается он **только на карточке компании и в лиде**. На карточке
сделки — там, где идёт разговор и готовится КП — его нет: `grep -rn chz
src/components/projects/` пуст.

Второе: справочник датирован **комментарием в шапке файла**, а не значением.
Дата снапшота 2026-08-03 недоступна коду и не может быть показана человеку.
По этим данным готовят КП со сроками обязательной маркировки — «откуда цифра и
на какое число» должно быть видно на экране, а не в исходнике.

Спека «Сделка v2» просит ровно эти две вещи: `chzGroups` и `chzDictVersion`.

### Чего в спринте НЕТ и почему

| | Почему |
|---|---|
| Новая таблица / миграция | Профиль хранится в `companies.chz_groups`, справочник — файл. Второго хранилища не заводим |
| Расширение `PROJECT_SELECT` (`use-projects.ts:175`) | `companies(id, name)` тянется в КАЖДОМ списке сделок — воронка, канбан, очередь дня. Добавить туда `chz_groups[]` и `okved` значит грузить два поля на сотню строк ради одной карточки. Блок берёт данные своим хуком, enabled только когда открыта сделка |
| Редактирование групп на сделке | Профиль принадлежит КОМПАНИИ, не сделке. Правка — в `CompanyModal`, блок даёт ссылку туда. Второй ввод = второй источник истины |
| Актуализация самого справочника | Снапшот правится сверкой с честныйзнак.рф — отдельная работа с источником, не код |

---

## РАЗВЕДКА (выполнить до правок)

```bash
git log --oneline -1
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -5

sed -n '1,40p' src/lib/data/chz-groups.ts
grep -n '^export' src/lib/data/chz-groups.ts
diff src/lib/data/chz-groups.ts supabase/functions/ai-run/chz-groups.ts && echo "ЗЕРКАЛА ИДЕНТИЧНЫ"

sed -n '1,40p' tests/unit/chz-groups.test.ts
ls tests/unit/ | grep -i chz

sed -n '140,175p' src/components/companies/CompanyDetail.tsx
grep -n 'ChzBadge\|resolveChzProfile\|unknown' src/components/companies/CompanyDetail.tsx

sed -n '155,200p' src/components/projects/DealContextRail.tsx
grep -n 'RailCard' src/components/shared/RailCard.tsx | head -5

grep -n 'company:companies' src/lib/hooks/use-projects.ts
grep -n 'chz_groups\|okved' src/lib/hooks/use-companies.ts
```

Ответить в отчёте:
1. Зеркала идентичны на входе? (если нет — это находка ДО правок, сообщить)
2. Какие кейсы уже покрывает `tests/unit/chz-groups.test.ts` и есть ли тест на `chz-profile`
3. Как именно `CompanyDetail` рендерит `unknown`-сироты — блок на сделке повторяет ЭТОТ язык, а не изобретает свой

---

## ЗАДАЧА 1 — версия справочника становится значением

### Context

Дата снапшота живёт в комментарии `src/lib/data/chz-groups.ts:3`. Коду она
недоступна, показать её нельзя. Выносим в экспорт — там же, где данные, чтобы
дата и таблица не разъехались.

### Steps

**1.1.** В `src/lib/data/chz-groups.ts`, сразу после `export type ChzStatus`,
добавить:

```ts
/**
 * Дата снапшота справочника (ISO). Значение, а не комментарий: по этим данным
 * готовят КП со сроками обязательной маркировки, и «на какое число» обязано
 * доезжать до экрана. Меняется ТОЛЬКО вместе со сверкой CHZ_GROUPS с
 * честныйзнак.рф — правка даты без правки таблицы делает справочник врущим
 * увереннее, чем он есть.
 */
export const CHZ_SNAPSHOT_DATE = '2026-08-03';

/** Источники снапшота — показываются человеку рядом с датой. */
export const CHZ_SNAPSHOT_SOURCES = [
  'kontur.ru/markirovka/spravka/54370',
  'garant.ru/article/2131746',
] as const;
```

Дату брать из шапки файла, НЕ придумывать. Если в шапке она отличается от
`2026-08-03` — верна шапка, поправить константу и сказать об этом в отчёте.

**1.2.** Ту же вставку — дословно — в зеркало
`supabase/functions/ai-run/chz-groups.ts`. Файлы обязаны остаться побайтово
идентичными (кроме первой строки с путём, если она отличается — проверить
разведкой).

**1.3.** В `tests/unit/chz-groups.test.ts` — кейс на новую константу:
формат `YYYY-MM-DD`, и она совпадает в обоих зеркалах. Существующий deepEqual
экспортов это поймает только если сравниваются ВСЕ экспорты; проверить и, если
сравнение поимённое, добавить обе новые константы в список.

### Verification

```bash
diff src/lib/data/chz-groups.ts supabase/functions/ai-run/chz-groups.ts && echo "ЗЕРКАЛА ОК"
npx vitest run tests/unit/chz-groups.test.ts 2>&1 | tail -10
npx tsc --noEmit 2>&1 | head -10
```

---

## ЗАДАЧА 2 — хук профиля ЧЗ по компании сделки

### Context

Сделке нужны `companies.chz_groups` и `companies.okved`, а `PROJECT_SELECT`
(`use-projects.ts:175`) отдаёт только `companies(id, name)`. Расширять его нельзя
(причина — в таблице «Чего в спринте нет»), поэтому блок берёт данные отдельным
запросом, включённым только при открытой карточке.

### Steps

**2.1.** `src/lib/hooks/use-company-chz.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface CompanyChzRow {
  id: string;
  chz_groups: string[] | null;
  okved: string | null;
}

/**
 * Маркировочный профиль КОМПАНИИ сделки. Отдельным запросом, а не расширением
 * PROJECT_SELECT: тот джойн тянется в каждом списке сделок, а два этих поля
 * нужны ровно на открытой карточке.
 *
 * `chz_groups` NULL = не выяснено; `[]` = выяснено, что групп нет. Разница
 * значимая, схлопывать в одно состояние нельзя — её различает resolveChzProfile.
 */
export function useCompanyChz(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['company-chz', companyId ?? null],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<CompanyChzRow | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('companies')
        .select('id, chz_groups, okved')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}
```

⚠️ Поле `chz_groups` может отсутствовать в автогенерированных типах — в проекте
для него есть стаб `CompaniesChzStub` (`src/types/database.ts`). Разведать, как
`use-companies.ts` обходит это сегодня, и повторить ТОТ ЖЕ приём. Генерируемые
типы руками не править.

### Verification

```bash
npx tsc --noEmit 2>&1 | head -10
grep -n 'CompaniesChzStub' src/types/database.ts src/lib/hooks/use-companies.ts
```

---

## ЗАДАЧА 3 — карточка «Честный Знак» в зоне «Контекст»

### Context

Зона «Контекст» карточки сделки (`DealContextZone` в
`src/components/projects/DealContextRail.tsx`) — место для «кто, сколько, что
собрано». Профиль маркировки — ровно оттуда.

### Steps

**3.1.** `src/components/projects/DealChzCard.tsx` — по образцу соседей рельса
(`DealSummaryCard`, `DealMaterialsCard`), шапка через `RailCard`, иконка Lucide.

Содержимое:
- группы профиля — `ChzBadge` (`src/components/shared/ChzBadge.tsx`), тот же
  компонент, что на карточке компании: язык статусов один на весь продукт;
- `unknown`-сироты — нейтральным тегом, **повторяя приём `CompanyDetail`**
  (разведка, п. 3), не изобретая свой;
- подпись источника: `source === 'derived'` — «гипотеза по ОКВЭД», `'declared'`
  — «подтверждено». Гипотеза, поданная как факт, уедет в КП;
- строка версии: «Справочник на {CHZ_SNAPSHOT_DATE}» мелким, `--text-dim`;
- ссылка «Уточнить в карточке компании» → `/companies/<company_id>` (правка
  профиля живёт там).

**3.2.** Состояния обязательны и различимы:

| Состояние | Что показать |
|---|---|
| у сделки нет `company_id` | карточка не рендерится вовсе (`return null`) |
| загрузка | скелет/«…», не пустое место |
| ошибка | текст ошибки, не пустота |
| `chz_groups = NULL`, ОКВЭД молчит | «Не выяснено» + ссылка уточнить |
| `chz_groups = []` | «Групп маркировки нет» — это ВЫЯСНЕННЫЙ факт, не пустота |
| `source = 'derived'` | группы + явная пометка «гипотеза по ОКВЭД» |

Различие NULL и `[]` — не косметика: первое означает «не спросили», второе
«спросили, ответ отрицательный». Схлопывание в один экран стирает работу продавца.

**3.3.** Смонтировать в `DealContextZone` (`DealContextRail.tsx`) — после
`DealSummaryCard`, до материалов. Только для сделок (`type !== 'delivery'`):
у внедрения профиль ЧЗ уже не переговорная тема.

**3.4.** Ноль хардкод-цветов — только токены. Семантические цвета статусов уже
внутри `ChzBadge`, своих не заводить. Проверить, что блок читается во всех восьми
темах (в `t-washi` акцент равен `--red`).

### Verification

```bash
npx tsc --noEmit 2>&1 | head -10
npm run lint 2>&1 | tail -3
grep -rn '#[0-9a-fA-F]\{6\}' src/components/projects/DealChzCard.tsx | wc -l
grep -n 'DealChzCard' src/components/projects/DealContextRail.tsx
```

Последняя команда должна вернуть 0 хардкод-цветов и непустой монтаж.

---

## ТЕСТЫ

**Т1. Константа снапшота** — `tests/unit/chz-groups.test.ts` (дополнить):
- `CHZ_SNAPSHOT_DATE` матчит `/^\d{4}-\d{2}-\d{2}$/`;
- значение совпадает в основном файле и в зеркале Deno-функции;
- `CHZ_SNAPSHOT_SOURCES` непуст.

**Т2. `resolveChzProfile`** — `tests/unit/chz-profile.test.ts`.
Разведка покажет, есть ли этот файл. **Нет — завести в этом спринте**: функция
домена, у которой с сегодняшнего дня два потребителя вместо одного, обязана быть
покрыта до второго монтажа, а не после. Кейсы поведением:

| Вход | Ожидание |
|---|---|
| `declared = ['Обувь']`, `okved = '46.90'` | `source='declared'`, гипотеза по ОКВЭД НЕ подмешана |
| `declared = null`, `okved = '15.20'` | `source='derived'`, группы из `matchChzGroups` |
| `declared = []`, `okved = null` | `source='none'`, `groups=[]` — «выяснено, что групп нет» |
| `declared = []`, `okved = '15.20'` | `source='derived'` — пустой массив уступает гипотезе (текущее поведение, зафиксировать) |
| `declared = ['Обувь','Обувь']` | дубль схлопнут, одна группа |
| `declared = ['Скрепки']` | `groups=[]`, `unknown=['Скрепки']`, `source='declared'` |
| `declared = ['Обувь','Скрепки']` | порядок как во входе, сирота в `unknown` |

Последний кейс важен отдельно: порядок — человеческий ввод из пикера, сортировка
по статусу его переставила бы.

**Т3. UI-часть (ЗАДАЧА 3) тестами не покрывается** — только разметка и состояния,
логика вся в `chz-profile.ts` и покрыта Т2.

```bash
npx vitest run tests/unit/chz-groups.test.ts tests/unit/chz-profile.test.ts 2>&1 | tail -15
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -5
npx vitest run 2>&1 | tail -10
diff src/lib/data/chz-groups.ts supabase/functions/ai-run/chz-groups.ts && echo "ЗЕРКАЛА ОК"
npm run build 2>&1 | tail -10
```

Dev-сервер остановить до `npm run build`. Дельту lint и числа тестов к baseline
из разведки — в отчёт.

---

## КОММИТ

Тело коммита сначала записать во временный файл — многострочный коммит через
`-m` в zsh владельца глотает `!` (history expansion):

```bash
cat > /tmp/commit-chz.txt <<'MSG'
feat(deals): блок «Честный Знак» на карточке сделки

- CHZ_SNAPSHOT_DATE и CHZ_SNAPSHOT_SOURCES — дата справочника стала значением,
  синхронно в зеркале Deno-функции
- use-company-chz: профиль компании отдельным запросом, PROJECT_SELECT не тронут
- DealChzCard в зоне «Контекст»: группы, гипотеза-vs-подтверждено, версия
  справочника, ссылка на правку в карточке компании
- различие NULL / [] сохранено в UI: «не выяснено» и «групп нет» — разные экраны
- тесты: константа снапшота, resolveChzProfile поведением (7 кейсов)
MSG

git add .
git commit -F /tmp/commit-chz.txt
```

**Не мержить.** Отчёт — на гейт.

---

## Что проверит гейт

1. Дифф против отчёта; `git log main..HEAD` — в диффе только этот спринт.
2. Линзы: базовая (`qa-engineer`) · `crm-design-auditor` + `a11y-auditor` — новый
   блок и восемь тем · `supabase-patterns` — новый хук. `security` и `api` — n/a,
   миграций и внешних вызовов нет.
3. Зеркала `chz-groups.ts` идентичны, тест синхронности зелёный.
4. Состояния блока: пустой профиль, `[]`, `derived`, сирота, отсутствие компании.
5. `PROJECT_SELECT` не расширен — проверяется грепом по `use-projects.ts`.
6. Тесты: Т1 и Т2 в диффе, кейсы описаны поведением.

Cold review НЕ требуется: миграций, RLS, ролей, денег и удаления данных в спринте нет.
