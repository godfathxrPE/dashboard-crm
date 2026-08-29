#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
case "${1:-status}" in
  status)
    "${REPO_ROOT}/.grok/skills/review-sprint/scripts/list-pending.sh" | sed 's/^/  /' || true
    echo
    PID_FILE="${REPO_ROOT}/.grok/sprint-review-watcher/watcher.pid"
    if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
      echo "watcher: running (pid $(cat "${PID_FILE}"))"
    else
      echo "watcher: stopped"
    fi
    ;;
  start)
    exec "${HOME}/.grok/bin/start-sprint-watcher-tmux.sh"
    ;;
  stop)
    PID_FILE="${REPO_ROOT}/.grok/sprint-review-watcher/watcher.pid"
    if [[ -f "${PID_FILE}" ]] && kill "$(cat "${PID_FILE}")" 2>/dev/null; then
      rm -f "${PID_FILE}"
      echo "stopped"
    else
      echo "not running"
    fi
    ;;
  once)
    exec bash "${REPO_ROOT}/.grok/skills/review-sprint/scripts/watch-sprints.sh" --once --batch-size "${2:-1}"
    ;;
  *)
    echo "usage: manage-watcher.sh {status|start|stop|once [batch]}"
    exit 1
    ;;
esac