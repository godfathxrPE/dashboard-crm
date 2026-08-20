// ⚠️ ЗЕРКАЛО — S-R3-VOICE-1. Две копии обязаны совпадать БАЙТ В БАЙТ:
//   src/lib/transcribe/glossary.ts            — читает браузер (bundler),
//   supabase/functions/transcribe/glossary.ts — читает Deno (edge-функция).
// Deno не умеет импортировать из `src/`, а тащить сборщик ради 150 строк дороже
// дубля. Правишь одну копию — правь вторую; расхождение ловит
// tests/unit/transcribe-mirror.test.ts.
//
// Перенесено из ~/Documents/Projects/trans-app/lib/glossary.ts без изменения логики.
//
// Initial prompt для Whisper: задаёт словарь и — не менее важно — стиль
// пунктуации. Жёсткий лимит Groq: 224 токена на весь prompt.
// Русский в токенизаторе Whisper — примерно 2-3 символа на токен,
// поэтому держим общий бюджет в символах.

export const PROMPT_CHAR_BUDGET = 500;

/**
 * Сколько знаков пользовательских терминов реально доезжает до Whisper.
 *
 * ⚠️ ЭТО НЕ «СКОЛЬКО МЫ ПРИНИМАЕМ». Границ ДВЕ, и они намеренно разные:
 *      • `MAX_TERMS_CHARS = 300` в `transcribe/index.ts` — сколько мы СОГЛАСНЫ
 *        ПРИНЯТЬ от клиента (веб-форма, бот, кто угодно);
 *      • `TERMS_CHAR_BUDGET = 200` — сколько ВЛЕЗАЕТ В PROMPT рядом с глоссарием.
 *    Клиент вправе прислать больше, чем поместится; мы берём сколько влезает.
 *
 * ⚠️ ДО S-TG-VOICE-TERMS 200 СТОЯЛО ЛИТЕРАЛОМ ВНУТРИ `buildPrompt`, и сто знаков
 *    терминов принимались, а затем молча выбрасывались — без единого признака. Тот
 *    же класс, что `DIRECT_UPLOAD_LIMIT` против `MAX_CHUNK_BYTES` в S-R3-VOICE-1:
 *    одна величина под двумя числами всегда долг.
 *
 * Читается не только `buildPrompt`: `telegram-webhook` укладывает в этот бюджет
 * имена клиентов и коллег ДО отправки — обрубок имени собственного в подсказке
 * хуже, чем его отсутствие, и резать его должен тот, кто знает границы элементов.
 */
export const TERMS_CHAR_BUDGET = 200;

// Домен маркировки. Короткая связная фраза работает лучше списка слов —
// модель перенимает и терминологию, и пунктуацию.
export const DOMAIN_GLOSSARY =
  "Обсуждаем маркировку и Честный Знак: ГИС МТ, код маркировки, КИЗ, " +
  "DataMatrix, GS1, агрегация, аппликатор, этикетка, принтер, короб, паллета, " +
  "ТСД, Клеверенс, УПД, ЭДО, 1С:ERP, ввод в оборот, вывод из оборота, " +
  "нанесение, линия, упаковщик.";

/**
 * Собирает prompt из глоссария, пользовательских терминов и хвоста
 * предыдущего чанка. Приоритет при нехватке места: термины > глоссарий >
 * контекст, потому что имена собственные ломаются чаще всего.
 */
export function buildPrompt(opts: {
  userTerms?: string;
  previousTail?: string;
}): string {
  const parts: string[] = [];
  let budget = PROMPT_CHAR_BUDGET;

  const terms = opts.userTerms?.trim();
  if (terms) {
    const clipped = terms.slice(0, TERMS_CHAR_BUDGET);
    parts.push(`Имена и термины: ${clipped}.`);
    budget -= clipped.length + 20;
  }

  if (budget >= DOMAIN_GLOSSARY.length) {
    parts.push(DOMAIN_GLOSSARY);
    budget -= DOMAIN_GLOSSARY.length;
  }

  const tail = opts.previousTail?.trim();
  if (tail && budget > 80) {
    // Хвост берём с конца и обрезаем по границе слова
    const slice = tail.slice(-budget);
    const cut = slice.indexOf(" ");
    parts.push(cut > 0 ? slice.slice(cut + 1) : slice);
  }

  return parts.join(" ").slice(0, PROMPT_CHAR_BUDGET);
}
