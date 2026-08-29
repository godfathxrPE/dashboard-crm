#!/usr/bin/env bash
# Cold review диффа перед мержем: собрать вход → заполнить acceptance → прогнать Grok.
#
# Usage:
#   ./.grok/skills/review-diff/scripts/cold-review.sh prepare            # собрать дифф в _analysis/cold-<branch>.md
#   ./.grok/skills/review-diff/scripts/cold-review.sh run                # прогнать Grok, записать _analysis/cold-review-<branch>.md
#   ./.grok/skills/review-diff/scripts/cold-review.sh prepare --base develop
#   ./.grok/skills/review-diff/scripts/cold-review.sh run --branch feat/x
#
# Между prepare и run руками заполняется секция ## ACCEPTANCE — что должно
# получиться в терминах поведения. Без неё run откажется работать: cold review
# без критерия приёмки вырождается в вкусовщину.
#
# Requires: grok CLI (~/.grok/bin/grok или на PATH)

set -euo pipefail

REPO_ROOT="${DASHBOARD_CRM_ROOT:-}"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(git -C "${BASH_SOURCE[0]%/*}" rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
fi
cd "${REPO_ROOT}"

MODE="${1:-}"
shift || true

BASE="main"
BRANCH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="${2:?}"; shift 2 ;;
    --branch) BRANCH="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ -n "${BRANCH}" ]] || BRANCH="$(git branch --show-current)"
if [[ -z "${BRANCH}" ]]; then
  echo "error: detached HEAD — передай --branch" >&2
  exit 1
fi
if [[ "${BRANCH}" == "${BASE}" ]]; then
  echo "error: ветка совпадает с базой (${BASE}) — нечего ревьюить" >&2
  exit 1
fi

SLUG="${BRANCH//\//-}"
IN=".grok/cold-review/cold-${SLUG}.md"
OUT="_analysis/cold-review-${SLUG}.md"
PLACEHOLDER="<!-- ЗАПОЛНИ: 5–10 строк о том, что должно получиться, в терминах наблюдаемого поведения. Без деталей реализации. -->"

# Сгенерированное и шумное — из диффа вон; факт их изменения виден в --stat.
EXCLUDES=(
  ':(exclude)package-lock.json'
  ':(exclude)deno.lock'
  ':(exclude)src/types/supabase.gen.ts'
  ':(exclude)CHANGELOG.md'
  ':(exclude)tsconfig.tsbuildinfo'
  ':(exclude)_analysis/**'
  ':(exclude)test-results/**'
  ':(exclude)screenshots/**'
)

prepare() {
  mkdir -p "$(dirname "${IN}")"
  git rev-parse --verify "${BASE}" >/dev/null 2>&1 || {
    echo "error: базовая ветка '${BASE}' не найдена" >&2; exit 1; }

  local range="${BASE}...${BRANCH}"
  local ndiff
  ndiff="$(git diff --name-only "${range}" -- "${EXCLUDES[@]}" | wc -l | tr -d ' ')"
  if [[ "${ndiff}" -eq 0 ]]; then
    echo "error: в диффе ${range} нет содержательных изменений" >&2
    exit 1
  fi

  # Уже заполненный acceptance переживает пересборку диффа.
  local acceptance="${PLACEHOLDER}"
  if [[ -f "${IN}" ]]; then
    local saved
    saved="$(awk '/^## ACCEPTANCE/{f=1;next} /^## DIFF/{f=0} f' "${IN}" | sed '/^[[:space:]]*$/d')"
    if [[ -n "${saved}" && "${saved}" != *"ЗАПОЛНИ"* ]]; then
      acceptance="${saved}"
      echo "note: acceptance из прежнего ${IN} сохранён"
    fi
  fi

  {
    echo "# Cold review вход: ${BRANCH}"
    echo
    echo "**База:** \`${BASE}\` · **Дата сборки:** $(date '+%Y-%m-%d %H:%M')"
    echo
    echo "## ACCEPTANCE"
    echo
    echo "${acceptance}"
    echo
    echo "## DIFF"
    echo
    echo '### Изменённые файлы (включая сгенерированные)'
    echo
    echo '```'
    git diff --stat "${range}"
    echo '```'
    echo
    echo '### Содержательный дифф'
    echo
    echo '```diff'
    git diff "${range}" -- "${EXCLUDES[@]}"
    echo '```'
  } > "${IN}"

  local lines
  lines="$(wc -l < "${IN}" | tr -d ' ')"
  echo "готово: ${IN} (${ndiff} файлов, ${lines} строк)"
  if [[ "${lines}" -gt 2500 ]]; then
    echo "⚠️  дифф большой — ревью будет поверхностным. Разбей спринт или ревьюй по частям." >&2
  fi
  if [[ "${acceptance}" == "${PLACEHOLDER}" ]]; then
    echo
    echo "Заполни секцию ## ACCEPTANCE в ${IN}, затем:"
    echo "  $0 run --branch ${BRANCH}"
  fi
}

run() {
  [[ -f "${IN}" ]] || { echo "error: нет ${IN} — сначала prepare" >&2; exit 1; }

  local acceptance
  acceptance="$(awk '/^## ACCEPTANCE/{f=1;next} /^## DIFF/{f=0} f' "${IN}" | sed '/^[[:space:]]*$/d')"
  if [[ -z "${acceptance}" || "${acceptance}" == *"ЗАПОЛНИ"* ]]; then
    echo "error: секция ## ACCEPTANCE в ${IN} не заполнена." >&2
    echo "       Cold review без критерия приёмки — вкусовщина. Опиши поведение и повтори." >&2
    exit 1
  fi

  local grok_bin="${GROK_BIN:-}"
  if [[ -z "${grok_bin}" ]]; then
    if command -v grok >/dev/null 2>&1; then
      grok_bin="$(command -v grok)"
    elif [[ -x "${HOME}/.grok/bin/grok" ]]; then
      grok_bin="${HOME}/.grok/bin/grok"
    else
      echo "error: grok CLI не найден. Задай GROK_BIN." >&2
      exit 1
    fi
  fi

  local prompt
  prompt="$(cat <<EOF
Load and follow the project skill review-diff (.grok/skills/review-diff/SKILL.md).

Cold review of branch \`${BRANCH}\` against \`${BASE}\`.
Input file: ${IN} — read it fully: sections ## ACCEPTANCE and ## DIFF.

HARD RULE — this is a COLD review. Do NOT read, open or grep:
  _analysis/sprint-*.md, _analysis/fix-*.md, _analysis/handoff-*.md,
  _analysis/review-*.md, _analysis/cold-review-*.md,
  crm-architect/references/journal.md
You may read the working tree (src/, supabase/, tests/, docs/schema.md) to check
callers and neighbouring code, and — only AFTER forming a finding —
crm-architect/references/learnings.md and CLAUDE.md to filter it.

IMPORTANT — headless CLI mode:
- Do NOT write files with tools.
- Print ONLY the complete review markdown to stdout.
- First line must be "# Cold review: ${BRANCH}".
- No preamble, no closing remarks, no code fence around the whole document.

Read-only. Do not edit anything. Do not commit.
EOF
)"

  local state_dir="${REPO_ROOT}/.grok/cold-review"
  mkdir -p "${state_dir}"
  local raw="${state_dir}/raw.md"
  local tmp="${state_dir}/out.md"
  : > "${raw}"

  echo "прогон Grok по ${IN} …"
  if ! "${grok_bin}" \
    --cwd "${REPO_ROOT}" \
    --permission-mode dontAsk \
    --max-turns 40 \
    -p "${prompt}" \
    > "${raw}" 2>"${state_dir}/stderr.log"; then
    echo "error: grok вышел с ненулевым кодом, см. ${state_dir}/stderr.log" >&2
    exit 1
  fi

  if ! python3 - "${raw}" "${tmp}" <<'PY'
import re, sys
raw, out = sys.argv[1], sys.argv[2]
text = open(raw, encoding="utf-8").read()
m = re.search(r"# Cold review:", text)
if not m:
    sys.exit(1)
open(out, "w", encoding="utf-8").write(text[m.start():].lstrip())
PY
  then
    echo "error: в stdout нет заголовка '# Cold review:' — сырой ответ в ${raw}" >&2
    exit 1
  fi
  rm -f "${raw}"

  mv "${tmp}" "${REPO_ROOT}/${OUT}"
  echo "готово: ${OUT}"
}

case "${MODE}" in
  prepare) prepare ;;
  run) run ;;
  *) sed -n '2,17p' "$0"; exit 1 ;;
esac
