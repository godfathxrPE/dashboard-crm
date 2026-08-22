#!/usr/bin/env bash
# Проверка расхождения между источником памяти (репо) и локальной копией Claude Code.
# Аккаунтную копию (Claude.ai → Customize → Skills) скрипт проверить не может —
# см. предупреждение в конце вывода.
set -uo pipefail

SRC="crm-architect"
DEST="$HOME/.claude/skills/crm-architect"

if [ ! -f "$SRC/SKILL.md" ]; then
  echo "skill-verify: нет $SRC/SKILL.md — скрипт запускается из корня репозитория" >&2
  exit 1
fi
if [ ! -d "$DEST" ]; then
  echo "skill-verify: локальной копии нет ($DEST) — раскатать scripts/skill-deploy.sh" >&2
  exit 1
fi

# -x '.*' отсекает .DS_Store и прочие точечные файлы: они мусор, не расхождение.
# README.md живёт только в репо (он для человека, открывшего папку) и в раскатку
# не входит — иначе каждый прогон показывал бы его как расхождение.
# STATUS.md — состояние проекта, живёт только в репо и в раскатку не входит
# намеренно (см. SKILL.md «Состояние проекта»); для diff это не расхождение.
diff_out="$(diff -r -x '.*' -x 'README.md' -x 'STATUS.md' "$SRC" "$DEST" 2>&1)"
rc=$?

if [ $rc -eq 0 ]; then
  echo "skill-verify: источник и локальная копия идентичны"
else
  echo "skill-verify: РАСХОЖДЕНИЕ между $SRC (источник) и $DEST (копия)"
  echo "$diff_out"
  echo
  echo "skill-verify: правь репозиторий и раскатывай scripts/skill-deploy.sh; обратно не копировать"
fi

echo "skill-verify: аккаунтную копию (Claude.ai → Customize → Skills) скрипт проверить не может — сверять глазами, пакет crm-architect.skill загружать сразу после раскатки"
exit $rc
