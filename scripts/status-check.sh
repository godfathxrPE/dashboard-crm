#!/usr/bin/env bash
# Сверка crm-architect/STATUS.md с git: каждый PR, смерженный после последнего тега,
# обязан быть упомянут в STATUS. Ловит молчаливый дрейф состояния — класс дефекта,
# пять раз всплывавший в сессии 21–22.08 (см. хендофф §6): механизм не падает, он молчит.
#
# Истина для фактов — git; STATUS — интерпретация. Разойтись молча они не должны.
# Запуск из корня репозитория. Выход 0 — сходится; 1 — расхождение, чинить сразу.
set -uo pipefail

STATUS="crm-architect/STATUS.md"
[ -f "$STATUS" ] || { echo "status-check: нет $STATUS — запуск из корня репозитория" >&2; exit 1; }

last_tag="$(git describe --tags --abbrev=0 2>/dev/null)" || {
  echo "status-check: в репозитории нет тегов — сверять не от чего" >&2; exit 1; }

# PR-номера с момента тега: merge-коммиты («Merge pull request #N») и squash-мержи
# (заголовок оканчивается на «(#N)»). Оба формата встречаются в истории.
prs="$(git log --format='%s' "${last_tag}..HEAD" \
  | grep -oE 'Merge pull request #[0-9]+|\(#[0-9]+\)$' \
  | grep -oE '[0-9]+' | sort -un)"

if [ -z "$prs" ]; then
  echo "status-check: после тега $last_tag смерженных PR нет — сверять нечего"
  exit 0
fi

# PR, который правит ТОЛЬКО сам реестр, себя упоминать не обязан: иначе бесконечная
# регрессия — каждая правка STATUS требует следующей правки STATUS. Реестр, меняющий
# только себя, по определению уже в реестре.
only_status_pr() {
  local sha files
  sha="$(git log --format='%H %s' "${last_tag}..HEAD" \
    | grep -E "(Merge pull request #$1 |\(#$1\)$)" | head -1 | cut -d' ' -f1)"
  [ -n "$sha" ] || return 1
  # для merge-коммита сравниваем со вторым родителем, для squash — с первым
  if git rev-parse --verify -q "${sha}^2" >/dev/null; then
    files="$(git diff --name-only "${sha}^1" "${sha}")"
  else
    files="$(git diff --name-only "${sha}^" "${sha}")"
  fi
  [ -n "$files" ] && [ -z "$(echo "$files" | grep -v '^crm-architect/STATUS.md$')" ]
}

fail=0
skipped=""
for pr in $prs; do
  if grep -qE "#${pr}([^0-9]|\$)" "$STATUS"; then
    continue
  fi
  if only_status_pr "$pr"; then
    skipped="$skipped $pr"
    continue
  fi
  echo "status-check: РАСХОЖДЕНИЕ — PR #$pr смержен после $last_tag, но в $STATUS не упомянут"
  fail=1
done
[ -n "$skipped" ] && echo "status-check: пропущены как правки самого реестра:$skipped"

rev_line="$(head -3 "$STATUS" | grep -oE 'Ревизия [0-9]+ · [0-9]{4}-[0-9]{2}-[0-9]{2}')" || true
if [ $fail -eq 0 ]; then
  echo "status-check: сходится — PR после $last_tag: $(echo "$prs" | tr '\n' ' ')все в STATUS ($rev_line)"
else
  echo "status-check: обновить $STATUS по протоколу закрытия спринта (SKILL.md)" >&2
fi
exit $fail
