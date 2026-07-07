#!/usr/bin/env bash
# S28 негативные HTTP-смоки для edge ai-summarize (гейт-хвост из BACKLOG.md).
# Запуск:  bash _analysis/smoke-s28-negative.sh
# Опционально USER_JWT (для теста 7, 404-чужак/несуществующий):
#   USER_JWT="<access_token>" bash _analysis/smoke-s28-negative.sh
#   (access_token: DevTools → Application → Local Storage → sb-...-auth-token → access_token)

set -u
URL="https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/ai-summarize"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvaWF2Y2FieGdkanVnenJ5cm1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1ODUyOTgsImV4cCI6MjA4OTE2MTI5OH0.Q64IVBFl_7LQd1SaBqbFu-QFkMwPQViMAnnmZPommqo"
NIL="00000000-0000-0000-0000-000000000000"
PASS=0; FAIL=0

check () { # $1 имя, $2 ожидаемый код, $3 фактический код, $4 тело
  if [ "$3" = "$2" ]; then PASS=$((PASS+1)); echo "PASS  [$1] $3  $4"
  else FAIL=$((FAIL+1)); echo "FAIL  [$1] ожидали $2, получили $3  $4"; fi
}

req () { curl -s -o /tmp/smoke_body -w "%{http_code}" "$@"; }

# 1. Без auth вообще → 401 (gateway verify_jwt)
code=$(req -X POST "$URL" -H 'content-type: application/json' \
  -d "{\"entity_type\":\"call\",\"entity_id\":\"$NIL\"}")
check "no-auth → 401" 401 "$code" "$(cat /tmp/smoke_body)"

# 2. anon JWT + битое тело (не JSON) → 400
code=$(req -X POST "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H 'content-type: application/json' -d 'не json')
check "bad-json → 400" 400 "$code" "$(cat /tmp/smoke_body)"

# 3. anon JWT + неверный entity_type → 400
code=$(req -X POST "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H 'content-type: application/json' -d "{\"entity_type\":\"deal\",\"entity_id\":\"$NIL\"}")
check "bad-entity-type → 400" 400 "$code" "$(cat /tmp/smoke_body)"

# 4. anon JWT + невалидный uuid → 400
code=$(req -X POST "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H 'content-type: application/json' -d '{"entity_type":"call","entity_id":"not-a-uuid"}')
check "bad-uuid → 400" 400 "$code" "$(cat /tmp/smoke_body)"

# 5. anon JWT (не юзер) + валидное тело → 401 из getUser
code=$(req -X POST "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H 'content-type: application/json' -d "{\"entity_type\":\"call\",\"entity_id\":\"$NIL\"}")
check "anon-not-user → 401" 401 "$code" "$(cat /tmp/smoke_body)"

# 6. GET → 405
code=$(req "$URL" -H "Authorization: Bearer $ANON" -H "apikey: $ANON")
check "GET → 405" 405 "$code" "$(cat /tmp/smoke_body)"

# 7. (опционально) живой юзер + несуществующий/чужой id → 404, не 403 (нейтральность)
if [ -n "${USER_JWT:-}" ]; then
  code=$(req -X POST "$URL" -H "Authorization: Bearer $USER_JWT" -H "apikey: $ANON" \
    -H 'content-type: application/json' -d "{\"entity_type\":\"call\",\"entity_id\":\"$NIL\"}")
  check "user+nonexistent → 404" 404 "$code" "$(cat /tmp/smoke_body)"
else
  echo "SKIP  [user+nonexistent → 404] задай USER_JWT, чтобы прогнать"
fi

echo; echo "Итого: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
