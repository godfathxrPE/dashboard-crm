#!/usr/bin/env bash
# Реген типов БД. Пишем во временный файл и подменяем боевой ТОЛЬКО после проверок:
# `команда > файл` усекает цель до запуска команды, и любой сбой (нет CLI, нет сети,
# интерактивный вопрос npx) оставляет пустой или мусорный supabase.gen.ts.
# Инцидент 2026-08-02: npx спросил «Ok to proceed?», вопрос ушёл в stdout и стал файлом.
set -euo pipefail

PROJECT_ID="${SUPABASE_PROJECT_ID:-uoiavcabxgdjugzryrmj}"
OUT="src/types/supabase.gen.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# -y: без интерактивного подтверждения установки пакета (иначе вопрос уедет в вывод).
npx -y supabase@latest gen types typescript --project-id "$PROJECT_ID" > "$TMP"

# Санити-проверки: файл правдоподобного размера и содержит блоки, которые отдаёт именно CLI.
lines=$(wc -l < "$TMP")
if [ "$lines" -lt 500 ]; then
  echo "gen-types: подозрительно мало строк ($lines) — боевой файл НЕ тронут" >&2
  head -5 "$TMP" >&2
  exit 1
fi
for marker in graphql_public "public: {" Database; do
  grep -q "$marker" "$TMP" || {
    echo "gen-types: в выводе нет '$marker' — боевой файл НЕ тронут" >&2; exit 1; }
done

mv "$TMP" "$OUT"
trap - EXIT
echo "gen-types: $OUT обновлён ($lines строк)"
