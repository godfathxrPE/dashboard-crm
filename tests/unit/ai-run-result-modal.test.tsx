import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AiRunResultModal } from '@/components/ai/AiRunResultModal';
import type { AiRunRow, CompanyBriefResult } from '@/types/database';

afterEach(cleanup);

// ═══════════════════════════════════════════════════════
// S-BRIEF-IN-DEAL-1.2 (приёмка): модалка прогона.
//
// • Портал в body: внутри стекла (`backdrop-filter`) `fixed`-оверлей растягивался
//   по стеклу, а правила стекла перекрашивали текст — белым по белому.
// • Клавиатура: фокус на «Закрыть», Esc закрывает, фокус возвращается на опенер.
// • `getByRole('dialog')` заодно ловит возврат `aria-hidden` на оверлей.
// ═══════════════════════════════════════════════════════

function brief(): CompanyBriefResult {
  return {
    summary: 'Производитель молочной продукции.',
    activity: 'Переработка молока',
    scale: null,
    website: null,
    chz_signals: [],
    recent_news: [],
    talk_hooks: [],
    sources: [],
  };
}

const RUN: AiRunRow = {
  id: 'run-1',
  org_id: 'o',
  preset_key: 'company_brief',
  entity_type: 'company',
  entity_id: 'c1',
  transcript_id: null,
  status: 'done',
  result: brief(),
  error: null,
  model: null,
  prompt_version: null,
  input_tokens: null,
  output_tokens: null,
  duration_ms: null,
  rating: null,
  feedback_note: null,
  auto_reason: null,
  created_by: 'u',
  created_at: '2026-10-03T12:00:00Z',
  finished_at: null,
};

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-sheet">
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      <AiRunResultModal run={open ? RUN : null} onClose={() => setOpen(false)} />
    </div>
  );
}

describe('AiRunResultModal', () => {
  it('внутри стекла рендерится порталом в body', () => {
    const { container } = render(
      <div className="glass-sheet">
        <AiRunResultModal run={RUN} onClose={() => {}} />
      </div>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('при открытии фокус на «Закрыть»', () => {
    render(<AiRunResultModal run={RUN} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть' }));
  });

  it('Esc вызывает onClose один раз', () => {
    const onClose = vi.fn();
    render(<AiRunResultModal run={RUN} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('после Esc фокус возвращается на кнопку, которой открыли', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
