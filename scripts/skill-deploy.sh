#!/usr/bin/env bash
# Раскатка памяти проекта из репозитория в производные копии.
# Источник истины — папка <skill>/ в этом репозитории (по умолчанию crm-architect/).
# Направление одно: репо → ~/.claude/skills/<skill>/ (Claude Code) + <skill>.skill (аккаунт).
# Вызов: scripts/skill-deploy.sh [имя-скилла]
# Обратного копирования нет намеренно: три несинхронизированных копии памяти
# 2026-08-05 стоили ложного вывода гейта по версии, замершей на 2026-07-29.
#
# Санити-проверки идут ДО того, как тронута цель: сломанный источник не должен
# затирать рабочую локальную копию.
set -euo pipefail

# Имя скилла — первым аргументом; без аргумента раскатывается crm-architect,
# как было до параметризации (обратная совместимость: старые вызовы не меняются).
SKILL="${1:-crm-architect}"
SRC="$SKILL"
DEST="$HOME/.claude/skills/$SKILL"
BACKUP_DIR="$HOME/.claude/skills/.backup"
PKG="$SKILL.skill"
# CORE — минимум, без которого память неполна: их отсутствие валит раскатку.
# REFS собирается из фактического содержимого references/ — захардкоженный список
# 2026-08-21 молча не раскатал новый файл, напечатав успех (дефект вскрыт в S-MEM-1).
# CORE задаётся по скиллу: для чужого скилла обязательный список свой или пустой.
case "$SKILL" in
  crm-architect)        CORE=(architecture journal learnings schema theme-system) ;;
  sprint-prompt-builder) CORE=(templates claude-code-guide examples) ;;
  *)                    CORE=() ;;
esac
REFS=()
for f in "$SRC"/references/*.md; do
  REFS+=("$(basename "$f" .md)")
done

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
grep -q "^name: $SKILL" "$SRC/SKILL.md" || {
  echo "skill-deploy: в $SRC/SKILL.md нет строки 'name: $SKILL' — ничего не тронуто" >&2
  exit 1; }
# ⚠️ `${CORE[@]+"${CORE[@]}"}` , а не `"${CORE[@]}"`: в bash 3.2 (штатный /bin/bash macOS)
# развёртывание ПУСТОГО массива под `set -u` — «unbound variable», и раскатка падает
# до единой строки вывода. Поймано боем 29.08: три скилла с пустым CORE не раскатались,
# а проверка шла в bash 5, где пустой массив под set -u уже легален.
for ref in ${CORE[@]+"${CORE[@]}"}; do
  if [ ! -s "$SRC/references/$ref.md" ]; then
    echo "skill-deploy: $SRC/references/$ref.md отсутствует или пуст — ничего не тронуто" >&2
    exit 1
  fi
done
for ref in ${REFS[@]+"${REFS[@]}"}; do
  if [ ! -s "$SRC/references/$ref.md" ]; then
    echo "skill-deploy: $SRC/references/$ref.md пуст — ничего не тронуто" >&2
    exit 1
  fi
done

# ── 2. Бэкап текущей локальной копии ────────────────────────────────────────
# Там может лежать правка, которую ещё не перенесли в репо: раскатка её сотрёт.
BACKUP=""
if [ -d "$DEST" ]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/$SKILL-$(date +%Y%m%d-%H%M%S)"
  cp -R "$DEST" "$BACKUP"
fi

# ── 3. Раскатка через staging в той же ФС → подмена одним rename ────────────
STAGE="$(dirname "$DEST")/.$SKILL.stage.$$"
OLD="$(dirname "$DEST")/.$SKILL.old.$$"
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
