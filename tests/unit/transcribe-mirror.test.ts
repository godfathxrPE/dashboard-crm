// S-R3-VOICE-1: страж синхронности зеркал «клиент ↔ edge».
//
// `glossary.ts` и `cleanup-prompt.ts` физически продублированы: Deno не умеет
// импортировать из `src/`, а тащить сборщик ради 150 строк дороже дубля. Цена дубля —
// риск расхождения, и он обязан валить CI, а не всплывать в проде разной пунктуацией
// у Whisper и разными правилами у вычитки.
//
// Сверка побайтовая, а не «по поведению»: львиная доля этих файлов — текст промпта,
// поведенческий тест правку в нём не заметит.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPrompt } from '@/lib/transcribe/glossary';
import { buildPrompt as edgeBuildPrompt } from '../../supabase/functions/transcribe/glossary';

const ROOT = resolve(__dirname, '../..');
const PAIRS = [
  ['src/lib/transcribe/glossary.ts', 'supabase/functions/transcribe/glossary.ts'],
  ['src/lib/transcribe/cleanup-prompt.ts', 'supabase/functions/transcribe/cleanup-prompt.ts'],
] as const;

describe('зеркала transcribe клиент ↔ edge синхронны', () => {
  for (const [client, edge] of PAIRS) {
    it(`${client} совпадает с ${edge} байт в байт`, () => {
      const a = readFileSync(resolve(ROOT, client), 'utf8');
      const b = readFileSync(resolve(ROOT, edge), 'utf8');
      expect(b, `расхождение зеркал: ${client} ↔ ${edge}`).toBe(a);
    });
  }

  it('обе копии собирают одинаковый initial prompt', () => {
    const probes = [
      {},
      { userTerms: 'Сертолово, Дарья' },
      { previousTail: 'а мы тогда договорились про аппликатор и коды' },
      { userTerms: 'Дарья', previousTail: 'по УПД вопрос закрыт' },
    ];
    for (const opts of probes) {
      expect(edgeBuildPrompt(opts)).toBe(buildPrompt(opts));
    }
  });
});
