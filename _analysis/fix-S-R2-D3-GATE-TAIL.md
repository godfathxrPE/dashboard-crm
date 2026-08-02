# Fix S-R2-D3-GATE-TAIL — восстановить типы, безопасный реген, снять стаб

**Ветка:** та же, `feat/r2-stakeholders` (коммит `479cf8e` + незакоммиченные правки гейта).
Миграция **092 уже применена в прод** (`20260802095512`) — ничего применять не нужно.

**Незакоммиченные правки гейта (не трогать, они верные):**
`docs/schema.md` (блок 092), `src/components/projects/DealStakeholders.tsx` (`aria-label` на
`RoleSelect`).

---

## 🔴 Что случилось — прочитать до команд

`npm run db:gen-types` **уничтожил `src/types/supabase.gen.ts`**. Сейчас в файле две строки:

```
Need to install the following packages:
supabase@2.111.0
Ok to proceed? (y)
```

Механика: `supabase` нет в devDependencies, `npx` спросил подтверждение установки, вопрос ушёл
в **stdout**, а `>` в скрипте уже усёк файл. Команда не выполнилась вовсе — в файле лежит текст
приглашения. `git diff` показывает −3415/+3.

Это второй укус той же формы: handoff 2026-07-31 уже фиксировал, что `db:gen-types` целился в
рукописный `database.ts` и молча писал пустой файл при пустом `$SUPABASE_PROJECT_ID`. Тогда
поправили цель, но не сам приём «редирект в боевой файл». Чиним приём — ЗАДАЧА 2.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git status --porcelain
head -5 src/types/supabase.gen.ts        # должны быть те самые 2 строки мусора
git diff --stat -- src/types/supabase.gen.ts
```

---

## ЗАДАЧА 1 — Восстановить файл из git

Файл не редактируется руками и не «дописывается» — только откат к последней коммитнутой версии.

```bash
git checkout -- src/types/supabase.gen.ts
wc -l src/types/supabase.gen.ts          # должно быть тысячи строк, не 2
grep -c graphql_public src/types/supabase.gen.ts   # > 0
grep -c deal_stakeholders src/types/supabase.gen.ts # 0 — таблицы в типах ещё нет, это ожидаемо
```

Если `git checkout` ругается на `.git/index.lock` — удалить lock **только** если ни один git-процесс
не запущен: `rm -f .git/index.lock`.

### Проверка

`git status --porcelain -- src/types/supabase.gen.ts` — пусто.

---

## ЗАДАЧА 2 — Сделать реген неспособным испортить файл

**Почему:** любой редирект `команда > боевой_файл` усекает цель ДО того, как команда отработала.
Падение сети, отсутствующий CLI, интерактивный вопрос, пустой project-id — и файла нет.
Схема «во временный файл → проверить → подменить» убирает весь класс.

**2.1.** Создать `scripts/gen-types.sh` (папка `scripts/` уже есть):

```bash
#!/usr/bin/env bash
# Реген типов БД. Пишем во временный файл и подменяем боевой ТОЛЬКО после проверок:
# `команда > файл` усекает цель до запуска команды, и любой сбой (нет CLI, нет сети,
# интерактивный вопрос npx) оставляет пустой или мусорный supabase.gen.ts.
# Инцидент 2026-08-02: npx спросил «Ok to proceed?», вопрос ушёл в stdout и стал файлом.
set -euo pipefail

PROJECT_ID="${SUPABASE_PROJECT_ID:-uoiavcabxgdjugzryrmj}"
OUT="src/types/supabase.gen.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# -y: без интерактивного подтверждения установки пакета (иначе вопрос уедет в вывод).
npx -y supabase@latest gen types typescript --project-id "$PROJECT_ID" > "$TMP"

# Санити-проверки: файл правдоподобного размера и содержит блоки, которые отдаёт именно CLI.
lines=$(wc -l < "$TMP")
if [ "$lines" -lt 500 ]; then
  echo "gen-types: подозрительно мало строк ($lines) — боевой файл НЕ тронут" >&2
  head -5 "$TMP" >&2
  exit 1
fi
for marker in graphql_public "public: {" Database; do
  grep -q "$marker" "$TMP" || {
    echo "gen-types: в выводе нет '$marker' — боевой файл НЕ тронут" >&2; exit 1; }
done

mv "$TMP" "$OUT"
trap - EXIT
echo "gen-types: $OUT обновлён ($lines строк)"
```

`chmod +x scripts/gen-types.sh`.

**2.2.** `package.json` — заменить строку скрипта:

```json
"db:gen-types": "bash scripts/gen-types.sh"
```

**2.3.** Прогнать реген и убедиться, что теперь всё на месте:

```bash
npm run db:gen-types
grep -c deal_stakeholders src/types/supabase.gen.ts   # > 0 — таблица приехала
grep -c graphql_public src/types/supabase.gen.ts      # > 0 — блок CLI на месте
git diff --stat -- src/types/supabase.gen.ts          # ожидаемо: только добавление блока
```

⚠️ Если `git diff --stat` покажет **массовые удаления** (сотни строк минус) — остановиться и
не коммитить: это признак того, что вывод пришёл не от CLI. Показать дифф.

Если `npx supabase` требует логин (`supabase login`) — **дальше не идти, вернуть задачу**:
токен доступа я в промпт не кладу и в репозиторий он не попадает.

---

## ЗАДАЧА 3 — Снять временный стаб типов

**Почему:** `DealStakeholdersStub` в `src/types/database.ts` существовал ровно до регена. Теперь
ключ `deal_stakeholders` приходит из `GenDatabase`, и стаб становится вторым определением той же
таблицы — расхождение с БД будет молчать, потому что интерсекшен типов её не проверяет.

**3.1.** В `src/types/database.ts` удалить **целиком**:

- блок комментария `⚠️ ВРЕМЕННЫЙ СТАБ (S-R2-D3, миграция 092 ещё НЕ применена)` вместе с
  `type DealStakeholdersStub = { … };`;
- `& DealStakeholdersStub` в типе `Database` — строка должна вернуться к виду:

```ts
        GenDatabase['public']['Tables'][K],
        'Insert'
      > & { Insert: RelaxOrgId<GenDatabase['public']['Tables'][K]['Insert']> };
    };
  };
};
```

**3.2.** Блок `// ═══ S-R2-D3: карта стейкхолдеров сделки ═══` с `STAKEHOLDER_ROLES` /
`StakeholderRole` в конце файла **оставить** — это доменный union, он не генерируется и его
потребляют константы, валидатор и хук.

**3.3.** Убедиться, что стаба не осталось нигде:

```bash
grep -rn "DealStakeholdersStub" src/    # 0 совпадений
```

### Проверка

```bash
npx tsc --noEmit
```

Особое внимание: `.from('deal_stakeholders').select('*, contact:contacts(...)')` в
`src/lib/hooks/use-deal-stakeholders.ts` теперь типизируется по настоящим `Relationships`, а не
по пустому массиву стаба. Если embed перестал компилироваться — **не глушить кастом**, а
показать ошибку: значит, реген принёс форму, отличную от ожидаемой.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint      # baseline 15 errors / 34 warnings
npm test          # baseline 604 (585 + 19 из D3)
# dev-сервер остановить, build последним
npm run build
```

---

## КОММИТ

```bash
git add -A
git commit -m "chore(types): реген после 092, снят стаб deal_stakeholders

- supabase.gen.ts восстановлен из git и перегенерён: npm run db:gen-types усёк файл,
  npx спросил подтверждение установки и вопрос ушёл в редирект
- scripts/gen-types.sh: генерация во временный файл + санити-проверки, подмена только
  после них — редирект в боевой файл больше не может его испортить
- DealStakeholdersStub удалён, тип приходит из GenDatabase
- с гейта: aria-label у RoleSelect, docs/schema.md — блок 092"
```

Дальше — руками: браузерная проверка блока «Стейкхолдеры» на карточке сделки, затем мерж и пуш.

---

## Что НЕ делать

| | Почему |
|---|---|
| Править `supabase.gen.ts` руками, дописывать в него `deal_stakeholders` | Файл генерируемый; ручная правка разойдётся с генератором на следующем прогоне |
| Регенить через Supabase MCP | MCP не отдаёт блок `graphql_public` → ~28 ложных удалений в диффе |
| Применять/откатывать миграции | 092 уже в проде, смоки пройдены, откат не требуется |
| Трогать `docs/schema.md` и `aria-label` в `DealStakeholders.tsx` | Правки гейта, они верные — просто попадут в этот коммит |
| Класть токен Supabase в репозиторий или в скрипт | `.env` и секреты не трогаем |
