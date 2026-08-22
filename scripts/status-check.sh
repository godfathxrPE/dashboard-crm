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

fail=0
for pr in $prs; do
  if ! grep -qE "#${pr}([^0-9]|\$)" "$STATUS"; then
    echo "status-check: РАСХОЖДЕНИЕ — PR #$pr смержен после $last_tag, но в $STATUS не упомянут"
    fail=1
  fi
done

rev_line="$(head -3 "$STATUS" | grep -oE 'Ревизия [0-9]+ · [0-9]{4}-[0-9]{2}-[0-9]{2}')" || true
if [ $fail -eq 0 ]; then
  echo "status-check: сходится — PR после $last_tag: $(echo "$prs" | tr '\n' ' ')все в STATUS ($rev_line)"
else
  echo "status-check: обновить $STATUS по протоколу закрытия спринта (SKILL.md)" >&2
fi
exit $fail
