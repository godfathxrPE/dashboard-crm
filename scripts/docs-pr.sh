#!/usr/bin/env bash
# Документная правка одной командой: ветка от свежего origin/main → коммит → PR
# с ЯВНОЙ базой main → авто-мерж → возврат. Заменяет ручную церемонию из восьми
# шагов (ветка → коммит → пуш → gh pr create → номер в реестр → CI → мерж → pull),
# на которой 06.09 дважды спотыкались — детали в _analysis/sprint-S-DOCS-PR-1.md.
#
# Скрипт не даёт новых прав: он делает то же, что делают руки, без пропусков шагов.
#
# Вызов: scripts/docs-pr.sh <ветка> <сообщение коммита> [файл ...]
# Ветка — только docs/... или chore/...: у кодовых веток свой цикл (worktree, ревью,
# гейт, cold review), этот скрипт их не трогает.
# Сообщение коммита — первая строка идёт заголовком PR, остаток (если есть) — телом PR.
# Без списка файлов — берутся все изменённые и untracked пути под _analysis/,
# crm-architect/, docs/. Явный список файлов перекрывает автоопределение.
#
# Отказывает раньше единого действия (шаг 1), если: запуск не из корня репозитория;
# запуск из worktree (документная ветка ведётся в основном чекауте — worktree-isolation,
# Шаг 0.4); имя ветки не docs/ и не chore/; рабочее дерево несёт изменения вне
# _analysis/, crm-architect/, docs/, supabase/migrations/; в диффе файл не .md/.html
# (кроме ЧИСТО комментарной правки .sql под supabase/migrations/ — гейтовые правки
# «НЕ применена» → «applied» в шапках миграций, см. PR #72); висит .git/index.lock.
# «Нечего коммитить» — не отказ, выход 0.
#
# ⚠️ bash 3.2 — штатный /bin/bash на macOS у владельца. Без mapfile/readarray, без
# ${var,,}. Пустой массив под `set -u` разворачивать ТОЛЬКО через
# ${arr[@]+"${arr[@]}"} — дословно как в scripts/skill-deploy.sh (там пустой CORE
# ронял раскатку 29.08 ровно этим).
set -uo pipefail

prog="docs-pr"

die() {
  echo "$prog: $1" >&2
  exit 1
}

# После checkout -b (шаг 2) отказ обязан вернуть на main (шаг 9: "возврат в любом
# исходе, кроме отказа на шаге 1") — ветка и коммит при этом НЕ удаляются, они
# остаются локально для ручного разбора.
fail_after_checkout() {
  echo "$prog: $1" >&2
  git checkout main >/dev/null 2>&1
  exit 1
}

[ $# -ge 2 ] || die "использование: scripts/docs-pr.sh <ветка> <сообщение коммита> [файл ...]"
BRANCH="$1"
MESSAGE="$2"
shift 2
# "$@" пуст — валиден под set -u и в bash 3.2 (позиционные параметры — исключение
# из правила про unbound variable), в отличие от развёртывания пустого массива.
EXPLICIT_FILES=("$@")

# ── Шаг 1. Отказы до единого действия — ничего не менять, пока не пройдены все ──

# 1) Корень репозитория: рядом обязан быть .git (каталог — обычный чекаут, файл —
# linked worktree). Отсутствие означает подкаталог репозитория или не-репозиторий.
[ -e .git ] || die "запуск не из корня репозитория — рядом нет .git"

# 2) Не worktree: у корня основного чекаута git-common-dir буквально ".git"; у
# linked worktree он указывает наружу, на .git основного чекаута.
common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || die "не git-репозиторий"
if [ "$common_dir" != ".git" ]; then
  die "запуск из worktree — документная ветка ведётся в основном чекауте (worktree-isolation, Шаг 0.4)"
fi

# 3) Ветка — только документная. У кодовых веток свой цикл: worktree, ревью, гейт.
case "$BRANCH" in
  docs/*|chore/*) ;;
  *) die "ветка '$BRANCH' не docs/ и не chore/ — скрипт только для документных веток" ;;
esac

under_any_prefix() {
  # $1 — путь; $2.. — список разрешённых префиксов.
  local path="$1"; shift
  local p
  for p in "$@"; do
    case "$path" in
      "$p"*) return 0 ;;
    esac
  done
  return 1
}

# Всё изменённое в рабочем дереве: tracked-изменения к HEAD + untracked
# (не игнорируемые). Порядок не важен, дубликатов не бывает по построению.
CHANGED="$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard; } | sort -u)"

# 4) Рабочее дерево не должно нести правки вне разрешённых путей — иначе это
# кодовая правка, случайно зацепленная документным прогоном. supabase/migrations/
# разрешён здесь (для комментарных правок шапок миграций), но НЕ входит в
# автоопределение файлов ниже — туда он попадает только явным списком.
outside=""
if [ -n "$CHANGED" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    under_any_prefix "$f" "_analysis/" "crm-architect/" "docs/" "supabase/migrations/" \
      || outside="$outside$f
"
  done <<CHANGED_EOF
$CHANGED
CHANGED_EOF
fi
if [ -n "$outside" ]; then
  die "рабочее дерево несёт изменения вне _analysis/, crm-architect/, docs/, supabase/migrations/ — это кодовая правка, ей нужен спринт и гейт:
$outside"
fi

# Список файлов для коммита: явный аргумент перекрывает автоопределение;
# автоопределение — пересечение CHANGED с тремя документными каталогами
# (без supabase/migrations/ — туда только явным списком, см. ниже).
FILES=()
if [ ${#EXPLICIT_FILES[@]} -eq 0 ]; then
  # Автоопределение не заглядывает под supabase/migrations/ — только .md/.html
  # каталоги. Молча пропустить правку, повисшую там, значит унести .sql мимо
  # PR без единого слова: ровно так это и всплыло на гейте S-DOCS-PR-1.
  # Явность тут и есть защита от случайного захвата правки схемы, а не повод
  # добавить migrations/ в автоопределение.
  sql_leftover=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      supabase/migrations/*) sql_leftover="$sql_leftover$f
" ;;
    esac
  done <<CHANGED_EOF_SQL
$CHANGED
CHANGED_EOF_SQL
  if [ -n "$sql_leftover" ]; then
    die "в рабочем дереве есть правки под supabase/migrations/, а список файлов не передан явно — автоопределение их не подхватывает молча:
$sql_leftover
передать явным списком: scripts/docs-pr.sh '$BRANCH' '...' <файл.md> supabase/migrations/<файл>.sql"
  fi

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    under_any_prefix "$f" "_analysis/" "crm-architect/" "docs/" && FILES+=("$f")
  done <<CHANGED_EOF2
$CHANGED
CHANGED_EOF2
else
  # Опечатка в явном пути раньше пропускалась молча (файл просто не входил в
  # коммит). Теперь — отказ с именем: тихий недобор файлов не отличить от
  # намеренного сужения списка.
  missing=""
  for f in "${EXPLICIT_FILES[@]}"; do
    if printf '%s\n' "$CHANGED" | grep -Fxq -- "$f"; then
      FILES+=("$f")
    else
      missing="$missing$f
"
    fi
  done
  if [ -n "$missing" ]; then
    die "в явном списке файл(ы), которых нет среди изменённых/untracked — опечатка в пути?:
$missing"
  fi
fi

# Комментарная правка .sql под supabase/migrations/: все добавленные и удалённые
# строки — пустые или начинаются с "--". Временно стейджим файл, чтобы `git diff
# --cached` дал полный список изменённых строк независимо от того, добавлен ли он
# уже кем-то ещё, и сразу снимаем со стейджа — до основного `git add` (шаг 3)
# индекс обязан остаться таким, каким был до запуска скрипта.
sql_is_comment_only() {
  local f="$1" bad
  git add -- "$f" 2>/dev/null
  bad="$(git diff --cached -U0 -- "$f" \
    | grep -E '^[+-]' | grep -Ev '^(\+\+\+|---)' \
    | sed -E 's/^[+-]//' | grep -Ev '^[[:space:]]*(--.*)?$')"
  git reset -q -- "$f" >/dev/null 2>&1
  [ -z "$bad" ]
}

# 5) В диффе — только .md/.html, кроме комментарной .sql-правки под
# supabase/migrations/ (см. PR #72: шапки 129/130 "НЕ применена" → "applied").
# Любая НЕкомментарная строка в .sql — отказ: это правка схемы, ей нужен гейт.
bad_ext=""
for f in ${FILES[@]+"${FILES[@]}"}; do
  case "$f" in
    *.md|*.html) ;;
    supabase/migrations/*.sql)
      sql_is_comment_only "$f" || bad_ext="$bad_ext$f (не комментарная правка — нужен гейт)
"
      ;;
    *) bad_ext="$bad_ext$f
" ;;
  esac
done
if [ -n "$bad_ext" ]; then
  die "в диффе файл не .md/.html (и не комментарная правка supabase/migrations/*.sql):
$bad_ext"
fi

# 6) Висящий index.lock — отказ до checkout -b. 07.09 лок валил git add уже после
# успешного checkout -b, оставляя ветку созданной, а коммит — нет.
if [ -e .git/index.lock ]; then
  die "висит .git/index.lock — проверить: ps aux | grep \"[g]it \"; если процесса нет, снять руками (rm .git/index.lock)"
fi

# 7) Нечего коммитить — не ошибка.
if [ ${#FILES[@]} -eq 0 ]; then
  echo "$prog: нечего коммитить"
  exit 0
fi

# ── Шаг 2. Ветка всегда от свежего origin/main ──────────────────────────────
git fetch origin || die "git fetch origin не удался"
git checkout -b "$BRANCH" origin/main \
  || die "не удалось создать ветку '$BRANCH' от origin/main (уже существует?) — ничего не сделано"

# ── Шаг 3. Коммит ────────────────────────────────────────────────────────────
for f in "${FILES[@]}"; do
  git add -- "$f" || fail_after_checkout "git add '$f' не удался"
done
# Тело через stdin, не -m: многострочное сообщение через -m в zsh глотает
# "!" (history expansion) — урок 06.09.
printf '%s\n' "$MESSAGE" | git commit -F - || fail_after_checkout "git commit не удался"

# gh нужен для PR и мерджа — проверяем ДО push, чтобы при его отсутствии коммит
# остался локально на "$BRANCH", а не улетел на origin без возможности открыть PR.
if ! command -v gh >/dev/null 2>&1; then
  fail_after_checkout "gh не найден — коммит остался на '$BRANCH' локально, ветка не запушена; поставить gh и повторить (или запушить и открыть PR руками)"
fi
if ! gh auth status >/dev/null 2>&1; then
  fail_after_checkout "gh не авторизован — коммит остался на '$BRANCH' локально, ветка не запушена; gh auth login и повторить"
fi

# ── Шаг 4. Push ───────────────────────────────────────────────────────────────
git push -u origin "$BRANCH" || fail_after_checkout "git push не удался — коммит остался на '$BRANCH' локально"

# ── Шаг 5. PR ─────────────────────────────────────────────────────────────────
TITLE="$(printf '%s\n' "$MESSAGE" | head -1)"
BODY="$(printf '%s\n' "$MESSAGE" | tail -n +2)"
pr_create_out="$(gh pr create --base main --head "$BRANCH" --title "$TITLE" --body "$BODY")" \
  || fail_after_checkout "gh pr create не удался — ветка '$BRANCH' запушена, коммит на месте, PR не создан"
# Последняя строка вывода — URL PR; остальное (интерактивные подсказки, предупреждения)
# в непроверенном виде уходило прямиком в PR_NUM, если бы хвост считался всей строкой.
pr_url="$(printf '%s\n' "$pr_create_out" | tail -1)"
PR_NUM="${pr_url##*/}"
case "$PR_NUM" in
  ''|*[!0-9]*) fail_after_checkout "не удалось разобрать номер PR из вывода gh: $pr_url" ;;
esac
echo "$prog: PR #$PR_NUM создан ($pr_url)"

# ── Шаг 5б. Подстановка номера PR — литерал "| #PR |", БЕЗ регулярок по "#" ──
# (в прозе реестра STATUS номера PR встречаются десятками — широкий шаблон
# переписал бы историю). Плейсхолдера нет — шаг молча пропускается: документная
# правка не обязана быть закрытием спринта.
placeholder='| #PR |'
files_with_placeholder=()
for f in "${FILES[@]}"; do
  case "$f" in
    *.md|*.html) ;;
    *) continue ;;
  esac
  grep -qF -- "$placeholder" "$f" 2>/dev/null && files_with_placeholder+=("$f")
done

if [ ${#files_with_placeholder[@]} -gt 0 ]; then
  for f in "${files_with_placeholder[@]}"; do
    tmp="$(mktemp)" || fail_after_checkout "mktemp не удался при подстановке номера PR"
    sed "s/| #PR |/| #${PR_NUM} |/g" "$f" > "$tmp" && mv "$tmp" "$f"
  done
  changed_now=0
  for f in "${files_with_placeholder[@]}"; do
    git diff --quiet -- "$f" || changed_now=1
  done
  if [ "$changed_now" -eq 0 ]; then
    fail_after_checkout "плейсхолдер '$placeholder' найден, но замена ничего не изменила — текст разошёлся с ожиданием; PR #$PR_NUM создан, разобраться руками"
  fi
  git add -- "${files_with_placeholder[@]}" || fail_after_checkout "git add номера PR не удался"
  printf 'docs(status): номер PR в реестр\n' | git commit -F - || fail_after_checkout "коммит номера PR не удался"
  git push || fail_after_checkout "push номера PR не удался — PR #$PR_NUM открыт, коммит с номером остался локально"
fi

# ── Шаг 6. Сверка базы — молча продолжать нельзя, именно так ушёл в никуда #67 ──
base="$(gh pr view "$PR_NUM" --json baseRefName -q .baseRefName 2>/dev/null)"
if [ "$base" != "main" ]; then
  fail_after_checkout "PR #$PR_NUM создан с базой '$base', а не main — закрыть PR #$PR_NUM руками и разобраться (см. #67)"
fi

# ── Шаг 7. Авто-мерж ──────────────────────────────────────────────────────────
gh pr merge "$PR_NUM" --auto --squash --delete-branch \
  || fail_after_checkout "gh pr merge --auto для PR #$PR_NUM не удался"

# ── Шаг 8. Ожидание — раз в 10 секунд, максимум 5 минут ─────────────────────
merged=0
i=1
while [ "$i" -le 30 ]; do
  state="$(gh pr view "$PR_NUM" --json state -q .state 2>/dev/null)"
  if [ "$state" = "MERGED" ]; then
    merged=1
    break
  fi
  sleep 10
  i=$((i + 1))
done

# ── Шаг 9. Возврат на main в любом исходе, кроме отказа на шаге 1 ───────────
git checkout main >/dev/null 2>&1
if [ "$merged" -eq 1 ]; then
  git pull --ff-only >/dev/null 2>&1
  echo "$prog: PR #$PR_NUM смержен, main → $(git rev-parse --short HEAD)"
else
  echo "$prog: не успел за 5 минут — не ошибка: авто-мерж взведён, PR #$PR_NUM смержится сам;"
  echo "$prog: вернуться на main: git checkout main && git pull --ff-only"
fi
exit 0
