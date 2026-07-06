'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { AiSummary } from '@/types/database';

export type AiSummaryEntity = 'call' | 'meeting';

interface GenerateInput {
  entity_type: AiSummaryEntity;
  entity_id: string;
}

interface GenerateResult {
  ok: true;
  ai_summary: AiSummary;
}

/**
 * Sprint 28: генерация AI-резюме звонка/встречи через Edge Function `ai-summarize`.
 * Ключ Anthropic на клиент не попадает — вся работа в функции под JWT юзера (RLS).
 * По успеху инвалидирует кэш calls/meetings, чтобы подтянулось сохранённое резюме.
 */
export function useAiSummary() {
  const qc = useQueryClient();

  return useMutation<GenerateResult, Error, GenerateInput>({
    mutationFn: async ({ entity_type, entity_id }) => {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke('ai-summarize', {
        body: { entity_type, entity_id },
      });

      if (error) {
        // Edge Function вернул non-2xx — тело с нейтральным сообщением в error.context.
        let message = 'Не удалось сгенерировать резюме';
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) message = body.error;
        } catch { /* нейтральное сообщение по умолчанию */ }
        throw new Error(message);
      }

      return data as GenerateResult;
    },
    onSuccess: (_data, { entity_type }) => {
      qc.invalidateQueries({ queryKey: [entity_type === 'call' ? 'calls' : 'meetings'] });
    },
  });
}
