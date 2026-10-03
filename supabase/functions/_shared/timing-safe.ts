// supabase/functions/_shared/timing-safe.ts — S-BRIEF-IN-DEAL-1.1
//
// Сравнение общего секрета (X-Dispatch-Key) без ранней остановки.
//
// ⚠️ Модуль ЧИСТЫЙ: ни импортов, ни `Deno` — его импортирует vitest.
//
// Пустой ожидаемый ключ функция НЕ отсекает: «пусто и пусто» даёт `true`. Секрет не
// задан — это решение вызывающего (401 до сравнения), а не тихое `false` отсюда.
// Разницу длин не скрываем осознанно — та же позиция, что в webhook-dispatch: длина
// общего секрета не то, что его защищает.
//
// Долг: локальные копии в webhook-dispatch, telegram-send, telegram-webhook (там пустая
// строка даёт `false`) свести сюда при следующем касании этих функций — сейчас не
// тронуты, чтобы не редеплоить чужие функции.

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}
