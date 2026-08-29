#!/usr/bin/env bash
# Watch _analysis/ for new or updated sprint/handoff prompts and auto-review them.
#
# Usage:
#   ./.grok/skills/review-sprint/scripts/watch-sprints.sh          # poll every 30s
#   ./.grok/skills/review-sprint/scripts/watch-sprints.sh --once   # single pass, exit
#   ./.grok/skills/review-sprint/scripts/watch-sprints.sh --interval 60
#
# Requires: grok CLI (~/.grok/bin/grok or on PATH)
# Stop: Ctrl+C

set -euo pipefail

REPO_ROOT="${DASHBOARD_CRM_ROOT:-}"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(git -C "${BASH_SOURCE[0]%/*}" rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
fi
cd "${REPO_ROOT}"

GROK_BIN="${GROK_BIN:-}"
if [[ -z "${GROK_BIN}" ]]; then
  if command -v grok >/dev/null 2>&1; then
    GROK_BIN="$(command -v grok)"
  elif [[ -x "${HOME}/.grok/bin/grok" ]]; then
    GROK_BIN="${HOME}/.grok/bin/grok"
  else
    echo "error: grok CLI not found. Set GROK_BIN or install Grok." >&2
    exit 1
  fi
fi

INTERVAL=30
ONCE=false
BATCH_SIZE=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --once) ONCE=true; BATCH_SIZE=0; shift ;;
    --interval) INTERVAL="${2:?}"; shift 2 ;;
    --batch-size) BATCH_SIZE="${2:?}"; shift 2 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done
# BATCH_SIZE=0 means unlimited (used by --once)

STATE_DIR="${REPO_ROOT}/.grok/sprint-review-watcher"
mkdir -p "${STATE_DIR}"
LOG="${STATE_DIR}/watcher.log"
LOCK_DIR="${STATE_DIR}/review.lock.d"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "${LOG}"
}

needs_review() {
  local sprint="$1"
  local base review
  base="$(basename "${sprint}")"
  review="${REPO_ROOT}/_analysis/review-${base}"
  if [[ ! -f "${review}" ]]; then
    return 0
  fi
  if [[ "${sprint}" -nt "${review}" ]]; then
    return 0
  fi
  return 1
}

find_candidates() {
  local f
  # Newest sprint/handoff first — fresh files from Claude Code don't wait behind old backlog.
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    if needs_review "${f}"; then
      echo "${f}"
    fi
  done < <(
    find "${REPO_ROOT}/_analysis" -maxdepth 1 \( -name 'sprint-*.md' -o -name 'handoff-*.md' \) -type f -print0 2>/dev/null \
      | xargs -0 stat -f '%m %N' 2>/dev/null \
      | sort -rn \
      | cut -d' ' -f2-
  )
}

review_file() {
  local sprint_path="$1"
  local rel="${sprint_path#${REPO_ROOT}/}"
  local out_rel="_analysis/review-$(basename "${rel}")"
  local out_path="${REPO_ROOT}/${out_rel}"
  local tmp_out="${STATE_DIR}/review.tmp.md"

  log "reviewing ${rel}"

  local prompt
  prompt="$(cat <<EOF
Load and follow the project skill review-sprint (.grok/skills/review-sprint/SKILL.md).

Review this sprint/handoff prompt: ${rel}

Verify claims against the live codebase and crm-architect references
(schema.md, architecture.md, learnings.md). Use grep/read tools as needed.

IMPORTANT — headless CLI mode:
- Do NOT write files with tools.
- Print ONLY the complete review markdown document to stdout.
- First line must be "# Ревью:" (or "# Review:").
- No preamble, no closing remarks, no code fences around the whole document.

Do not edit the sprint file. Do not commit.
EOF
)"

  local raw_out="${STATE_DIR}/review.raw.md"
  : > "${raw_out}"
  if ! "${GROK_BIN}" \
    --cwd "${REPO_ROOT}" \
    --permission-mode dontAsk \
    --max-turns 30 \
    -p "${prompt}" \
    > "${raw_out}" 2>> "${LOG}"; then
    log "FAILED review for ${rel} — grok exited non-zero, see ${LOG}"
    rm -f "${raw_out}" "${tmp_out}"
    return 1
  fi

  # grok -p may emit preamble (sometimes glued to the heading on one line)
  if ! python3 - "${raw_out}" "${tmp_out}" <<'PY'
import re, sys
raw, out = sys.argv[1], sys.argv[2]
text = open(raw, encoding="utf-8").read()
m = re.search(r"# (?:Ревью|Review):", text)
if not m:
    sys.exit(1)
open(out, "w", encoding="utf-8").write(text[m.start():].lstrip())
PY
  then
    log "FAILED review for ${rel} — no review heading in stdout (raw kept at ${raw_out})"
    rm -f "${tmp_out}"
    return 1
  fi
  rm -f "${raw_out}"

  mv "${tmp_out}" "${out_path}"
  log "done: ${out_rel}"
}

acquire_lock() {
  if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
    log "another review is in progress — skip"
    return 1
  fi
  return 0
}

release_lock() {
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}

scan_and_review() {
  if ! acquire_lock; then
    return 0
  fi
  trap release_lock EXIT

  local candidates=()
  while IFS= read -r line; do
    [[ -n "${line}" ]] && candidates+=("${line}")
  done < <(find_candidates)

  if [[ ${#candidates[@]} -eq 0 ]]; then
    log "no pending sprints"
    release_lock
    trap - EXIT
    return 0
  fi

  local limit="${BATCH_SIZE}"
  if [[ "${limit}" -eq 0 ]]; then
    limit="${#candidates[@]}"
  fi

  log "pending: ${#candidates[@]}, processing up to ${limit}"

  local c count=0
  for c in "${candidates[@]}"; do
    review_file "${c}" || true
    count=$((count + 1))
    if [[ "${count}" -ge "${limit}" ]]; then
      break
    fi
  done

  release_lock
  trap - EXIT
}

log "watcher started (repo=${REPO_ROOT}, grok=${GROK_BIN}, interval=${INTERVAL}s)"

if [[ "${ONCE}" == true ]]; then
  scan_and_review
  exit 0
fi

while true; do
  scan_and_review
  sleep "${INTERVAL}"
done