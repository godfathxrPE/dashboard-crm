import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RunCostMeta } from '@/components/ai/RunCostMeta';
import type { AiRunRow } from '@/types/database';

afterEach(cleanup);

// ═══════════════════════════════════════════════════════
// S-LLM-OPENROUTER-1. Карточка прогона подписана как ФАКТ, а не как оценка,
// поэтому неверное число здесь дороже, чем в прогнозе: «≈ 37 ₽» рядом со
// статусом «Готово» читается как свершившийся расход.
//
// После переезда слаг модели приходит из секрета и может быть любым. Правило:
// цена неизвестна ⇒ строки про рубли НЕТ ВОВСЕ, а токены и время остаются —
// по ним расход считается вручную за минуту.
// ═══════════════════════════════════════════════════════

function run(patch: Partial<AiRunRow> = {}): AiRunRow {
  return {
    id: 'r1',
    org_id: 'o1',
    preset_key: 'meeting_protocol',
    entity_type: 'call',
    entity_id: 'c1',
    transcript_id: null,
    status: 'done',
    result: null,
    error: null,
    model: 'claude-sonnet-5',
    prompt_version: 1,
    input_tokens: 10_000,
    output_tokens: 1_000,
    duration_ms: 42_000,
    rating: null,
    feedback_note: null,
    created_by: 'u1',
    created_at: '2026-08-18T09:00:00Z',
    finished_at: '2026-08-18T09:00:42Z',
    ...patch,
  };
}

describe('RunCostMeta — рубли только при известном слаге', () => {
  it('известная модель: показаны время, токены и цена', () => {
    render(<RunCostMeta run={run()} />);
    const text = screen.getByText(/42 с/).textContent ?? '';
    expect(text).toContain('42 с');
    expect(text).toContain('11К токенов');
    expect(text).toContain('₽');
  });

  it('НЕИЗВЕСТНАЯ модель: рублей нет, время и токены остались', () => {
    // S-DEBT-1: deepseek и grok теперь в прайсе — «неизвестной» взята модель,
    // которой у нас нет ни в дефолтах, ни в секретах.
    render(<RunCostMeta run={run({ model: 'mistralai/mistral-large' })} />);
    const text = screen.getByText(/42 с/).textContent ?? '';
    expect(text).toContain('42 с');
    expect(text).toContain('11К токенов');
    expect(text).not.toContain('₽');
  });

  it('копеечный прогон: «меньше 0,1 ₽» вместо «≈ 0 ₽»', () => {
    // S-DEBT-1. DeepSeek: (2 169×$0.083 + 800×$0.165)/1M × 85 ≈ 0.03 ₽ → в
    // десятых рубля это 0. «≈ 0 ₽» рядом со статусом «Готово» читается как
    // «бесплатно» — это факт, которого не было.
    render(<RunCostMeta run={run({
      model: 'deepseek/deepseek-v4-flash',
      input_tokens: 2_169,
      output_tokens: 800,
    })} />);
    const text = screen.getByText(/42 с/).textContent ?? '';
    expect(text).toContain('меньше 0,1 ₽');
    expect(text).not.toContain('≈ 0 ₽');
  });

  it('model = null (старые строки до 085): рублей нет, компонент не падает', () => {
    render(<RunCostMeta run={run({ model: null })} />);
    expect(screen.getByText(/42 с/).textContent ?? '').not.toContain('₽');
  });

  it('цена берётся из строки прогона, а не из реестра пресетов', () => {
    // Тот же пресет, разные фактические модели ⇒ разные суммы. До спринта обе
    // строки показали бы одно число: реестр держит роль, а не слаг.
    render(<RunCostMeta run={run({ model: 'claude-sonnet-5' })} />);
    const sonnet = screen.getByText(/42 с/).textContent ?? '';
    cleanup();
    render(<RunCostMeta run={run({ model: 'claude-haiku-4-5' })} />);
    const haiku = screen.getByText(/42 с/).textContent ?? '';
    expect(sonnet).not.toEqual(haiku);
  });

  it('токенов нет (API не отдал usage): остаётся только время', () => {
    const text = render(<RunCostMeta run={run({ input_tokens: null, output_tokens: null })} />)
      .container.textContent ?? '';
    expect(text).toContain('42 с');
    expect(text).not.toContain('токенов');
    expect(text).not.toContain('₽');
  });

  it('прогон не завершён — метки нет вовсе', () => {
    const { container } = render(<RunCostMeta run={run({ status: 'running' })} />);
    expect(container.textContent).toBe('');
  });
});
