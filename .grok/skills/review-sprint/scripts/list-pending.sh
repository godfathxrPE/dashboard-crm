#!/usr/bin/env bash
# List sprint/handoff files that need review (no review file, or sprint newer than review).
set -euo pipefail

REPO_ROOT="$(git -C "${BASH_SOURCE[0]%/*}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
fi

for f in "${REPO_ROOT}"/_analysis/sprint-*.md "${REPO_ROOT}"/_analysis/handoff-*.md; do
  [[ -f "${f}" ]] || continue
  base="$(basename "${f}")"
  review="${REPO_ROOT}/_analysis/review-${base}"
  if [[ ! -f "${review}" ]]; then
    echo "NEW      ${f#${REPO_ROOT}/}"
  elif [[ "${f}" -nt "${review}" ]]; then
    echo "STALE    ${f#${REPO_ROOT}/}  (review older than sprint)"
  fi
done