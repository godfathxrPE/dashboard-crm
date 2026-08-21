#!/usr/bin/env bash
# Раскатка памяти проекта из репозитория в производные копии.
# Источник истины — папка crm-architect/ в этом репозитории. Направление одно:
# репо → ~/.claude/skills/crm-architect/ (Claude Code) + crm-architect.skill (аккаунт).
# Обратного копирования нет намеренно: три несинхронизированных копии памяти
# 2026-08-05 стоили ложного вывода гейта по версии, замершей на 2026-07-29.
#
# Санити-проверки идут ДО того, как тронута цель: сломанный источник не должен
# затирать рабочую локальную копию.
set -euo pipefail

SRC="crm-architect"
DEST="$HOME/.claude/skills/crm-architect"
BACKUP_DIR="$HOME/.claude/skills/.backup"
PKG="crm-architect.skill"
REFS=(architecture journal learnings schema theme-system)

# ── 1. Санити-проверки источника ────────────────────────────────────────────
if [ ! -f "$SRC/SKILL.md" ]; then
  echo "skill-deploy: нет $SRC/SKILL.md — скрипт запускается из корня репозитория" >&2
  exit 1
fi
if [ "$(head -1 "$SRC/SKILL.md")" != "---" ]; then
  echo "skill-deploy: $SRC/SKILL.md не начинается с '---' — без YAML-фронтматтера скилл" >&2
  echo "              не грузится ни локально, ни в аккаунт. Ничего не тронуто." >&2
  exit 1
fi
grep -q "^name: crm-architect" "$SRC/SKILL.md" || {
  echo "skill-deploy: в $SRC/SKILL.md нет строки 'name: crm-architect' — ничего не тронуто" >&2
  exit 1; }
for ref in "${REFS[@]}"; do
  if [ ! -s "$SRC/references/$ref.md" ]; then
    echo "skill-deploy: $SRC/references/$ref.md отсутствует или пуст — ничего не тронуто" >&2
    exit 1
  fi
done

# ── 2. Бэкап текущей локальной копии ────────────────────────────────────────
# Там может лежать правка, которую ещё не перенесли в репо: раскатка её сотрёт.
BACKUP=""
if [ -d "$DEST" ]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/crm-architect-$(date +%Y%m%d-%H%M%S)"
  cp -R "$DEST" "$BACKUP"
fi

# ── 3. Раскатка через staging в той же ФС → подмена одним rename ────────────
STAGE="$(dirname "$DEST")/.crm-architect.stage.$$"
OLD="$(dirname "$DEST")/.crm-architect.old.$$"
mkdir -p "$(dirname "$DEST")"
rm -rf "$STAGE" "$OLD"
trap 'rm -rf "$STAGE" "$OLD"' EXIT

mkdir -p "$STAGE/references"
cp "$SRC/SKILL.md" "$STAGE/SKILL.md"
for ref in "${REFS[@]}"; do
  cp "$SRC/references/$ref.md" "$STAGE/references/$ref.md"
done
chmod -R u+rw,go+r "$STAGE"

# Цель — точное отражение источника: старый каталог уезжает целиком, лишние файлы
# (включая .DS_Store и забытые references) не переживают раскатку.
if [ -d "$DEST" ]; then
  mv "$DEST" "$OLD"
fi
mv "$STAGE" "$DEST"
rm -rf "$OLD"
trap - EXIT

# ── 4. Пакет для аккаунта ───────────────────────────────────────────────────
# rm перед zip обязателен: zip дописывает в существующий архив и оставил бы в нём
# файлы, которых в источнике уже нет.
rm -f "$PKG"
PKG_ABS="$PWD/$PKG"
( cd "$DEST" && zip -q -r -X "$PKG_ABS" SKILL.md references -x '.*' -x '*/.*' )

# ── 5. Отчёт ────────────────────────────────────────────────────────────────
lines=$(cat "$DEST/SKILL.md" "$DEST"/references/*.md | wc -l | tr -d ' ')
echo "skill-deploy: раскатано в $DEST ($(( ${#REFS[@]} + 1 )) файлов, $lines строк)"
pkg_files=$(unzip -Z1 "$PKG" | grep -cv '/$')
echo "skill-deploy: пакет $PKG собран ($pkg_files файлов)"
if [ -n "$BACKUP" ]; then
  echo "skill-deploy: бэкап прежней копии — $BACKUP"
else
  echo "skill-deploy: бэкап не нужен — локальной копии не было"
fi
echo "skill-deploy: ЗАГРУЗИТЬ $PKG руками в Claude.ai → Customize → Skills, иначе Cowork-сессии (и гейт) продолжат читать старую версию памяти"
