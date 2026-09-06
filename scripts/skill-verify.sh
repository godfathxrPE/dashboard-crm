#!/usr/bin/env bash
# Проверка расхождения между источником памяти (репо) и ДВУМЯ производными:
# локальной копией Claude Code и пакетом <skill>.skill для аккаунта.
#
# ⚠️ Пакет добавлен в проверку 06.09. До этого скрипт сверял источник только
# с локальной копией и на пакет не смотрел вовсе: раскатка из worktree клала
# пакет в корень worktree, локальная копия обновлялась верно (её путь от $HOME),
# `skill-verify` был зелён — а в основном чекауте лежал пакет от 05.09 при
# ревизии 34 в источнике. Зелёная проверка не ошибалась, она просто не покрывала
# третий экземпляр памяти.
#
# Загружен ли пакет в аккаунт, скрипт по-прежнему знать не может — см. конец вывода.
set -uo pipefail

SKILL="${1:-crm-architect}"
SRC="$SKILL"
DEST="$HOME/.claude/skills/$SKILL"
PKG="$SKILL.skill"

# Путь пакета обязан совпадать с тем, что считает skill-deploy.sh: корень ОСНОВНОГО
# чекаута — родитель общего git-dir. НЕ `--show-toplevel`: в linked worktree тот
# отдаёт корень worktree, и проверка искала бы не тот файл. Расходятся эти два
# вычисления — и скрипт начнёт сверять пакет, которого никто не грузит.
if REPO_ROOT="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; then
  REPO_ROOT="$(dirname "$REPO_ROOT")"
else
  REPO_ROOT="$PWD"
fi
PKG_ABS="$REPO_ROOT/$PKG"

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

# ── Пакет для аккаунта ──────────────────────────────────────────────────────
# Тот самый файл, который владелец руками грузит в Claude.ai. Сверяется с ИСТОЧНИКОМ,
# а не с локальной копией: две производные могли разъехаться независимо.
pkg_rc=0
if [ ! -f "$PKG_ABS" ]; then
  echo "skill-verify: ПАКЕТА НЕТ — $PKG_ABS; собрать scripts/skill-deploy.sh $SKILL"
  pkg_rc=1
else
  PKG_STAGE="$(mktemp -d)"
  trap 'rm -rf "$PKG_STAGE"' EXIT
  if unzip -q -o "$PKG_ABS" -d "$PKG_STAGE" 2>/dev/null; then
    # Те же исключения, что и выше: в пакет кладутся только SKILL.md и references/,
    # README.md и STATUS.md в него не входят намеренно.
    pkg_diff="$(diff -r -x '.*' -x 'README.md' -x 'STATUS.md' "$SRC" "$PKG_STAGE" 2>&1)"
    pkg_rc=$?
    if [ $pkg_rc -eq 0 ]; then
      echo "skill-verify: источник и пакет $PKG идентичны"
    else
      echo "skill-verify: РАСХОЖДЕНИЕ между $SRC (источник) и $PKG_ABS (пакет)"
      echo "$pkg_diff"
      echo
      echo "skill-verify: пересобрать scripts/skill-deploy.sh $SKILL и загрузить пакет в аккаунт"
    fi
  else
    echo "skill-verify: пакет $PKG_ABS не распаковывается — битый архив, пересобрать"
    pkg_rc=1
  fi

  # Возраст пакета — отдельный, более ранний сигнал: «раскатку не перезапускали».
  # ⚠️ Только ПРЕДУПРЕЖДЕНИЕ, не ошибка: git (checkout, rebase, clone) переписывает
  # mtime рабочих файлов, не меняя их содержимого, и жёсткая проверка краснела бы
  # после каждой смены ветки. Истина о расхождении — diff выше, mtime лишь намекает.
  newest_src="$(find "$SRC" -type f -name '*.md' -newer "$PKG_ABS" 2>/dev/null | head -3)"
  if [ -n "$newest_src" ]; then
    echo "skill-verify: ⚠️ пакет СТАРШЕ источника — раскатку не перезапускали после правки:"
    echo "$newest_src" | sed 's/^/  /'
    [ "$(printf '%s\n' "$newest_src" | wc -l | tr -d ' ')" -ge 3 ] && echo "  …"
  fi
fi

echo "skill-verify: ЗАГРУЖЕН ли пакет в аккаунт (Claude.ai → Customize → Skills), скрипт знать не может — сверять глазами; грузить $PKG_ABS сразу после раскатки"
[ $rc -ne 0 ] && exit $rc
exit $pkg_rc
