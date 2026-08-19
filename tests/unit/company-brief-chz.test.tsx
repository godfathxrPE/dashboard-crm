import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { CompanyBriefRenderer } from '@/components/ai/renderers/CompanyBriefRenderer';
import type { CompanyBriefResult } from '@/types/database';

afterEach(cleanup);

// ═══════════════════════════════════════════════════════
// S-DEBT-1, Задача 1 — маркировка в брифе.
//
// Дефект был интерфейсный, и он двойной:
//   • пустой `chz_signals` рисовался как ОТСУТСТВИЕ блока, и продавец читал это
//     как «тему не проверяли», хотя её проверили и не нашли следов;
//   • детерминированный факт из справочника («категория подлежит маркировке»)
//     до текста, который читают перед звонком, не доезжал вовсе.
//
// Инвариант, ради которого всё и делалось: ВЫЧИСЛЕННОЕ и НАЙДЕННОЕ не должны
// выглядеть одинаково. У вычисленного — подпись «справочник CRM» и ОКВЭД,
// у найденного — ссылка на источник.
// ═══════════════════════════════════════════════════════

const DAIRY_OKVED = '10.51.9';

function brief(patch: Partial<CompanyBriefResult> = {}): CompanyBriefResult {
  return {
    summary: 'Производитель молочной продукции.',
    activity: 'Переработка молока',
    scale: null,
    website: null,
    chz_signals: [],
    recent_news: [],
    talk_hooks: [],
    sources: [],
    ...patch,
  };
}

describe('CompanyBriefRenderer — секция «Маркировка»', () => {
  it('пустой chz_signals: явная строка вместо тишины', () => {
    render(<CompanyBriefRenderer result={brief()} />);
    expect(screen.getByText('Маркировка')).toBeTruthy();
    expect(
      screen.getByText('Следов работы с ГИС МТ в открытых источниках не найдено'),
    ).toBeTruthy();
  });

  it('матчащийся ОКВЭД: строка справочника есть и помечена как ВЫЧИСЛЕННАЯ', () => {
    render(<CompanyBriefRenderer result={brief()} okved={DAIRY_OKVED} />);
    const row = screen.getByText(/Молочная продукция/).closest('li');
    expect(row).not.toBeNull();
    const text = row!.textContent ?? '';
    expect(text).toContain('обязательна с 2021');
    expect(text).toContain(`по ОКВЭД ${DAIRY_OKVED}, справочник CRM`);
    // У вычисленного нет и не может быть источника: ссылки в строке нет.
    expect(within(row!).queryByRole('link')).toBeNull();
  });

  it('ОКВЭД без матча: группу не выдумываем', () => {
    render(<CompanyBriefRenderer result={brief()} okved="62.01" />);
    expect(screen.queryByText(/справочник CRM/)).toBeNull();
    // Секция всё равно есть — ради строки про пустой поиск.
    expect(
      screen.getByText('Следов работы с ГИС МТ в открытых источниках не найдено'),
    ).toBeTruthy();
  });

  it('ОКВЭД не передан (модалка из ленты): вычисленной строки нет, найденное на месте', () => {
    const result = brief({
      chz_signals: [{ claim: 'Вакансия «оператор ГИС МТ»', source_url: 'https://hh.ru/vac/1' }],
    });
    render(<CompanyBriefRenderer result={result} />);
    expect(screen.queryByText(/справочник CRM/)).toBeNull();
    expect(screen.getByText(/Вакансия/)).toBeTruthy();
  });

  it('вычисленное и найденное рядом различимы: подпись против ссылки', () => {
    const result = brief({
      chz_signals: [{ claim: 'Вакансия «оператор ГИС МТ»', source_url: 'https://hh.ru/vac/1' }],
    });
    render(<CompanyBriefRenderer result={result} okved={DAIRY_OKVED} />);

    const computed = screen.getByText(/Молочная продукция/).closest('li')!;
    const found = screen.getByText(/Вакансия/).closest('li')!;
    expect(computed).not.toBe(found);
    expect(computed.textContent).toContain('справочник CRM');
    expect(within(computed).queryByRole('link')).toBeNull();

    expect(found.textContent).not.toContain('справочник CRM');
    const link = within(found).getByRole('link');
    expect(link.getAttribute('href')).toBe('https://hh.ru/vac/1');

    // Найденного не осталось — а строка про пустой поиск при этом не рисуется.
    expect(screen.queryByText(/не найдено/)).toBeNull();
  });

  it('старый прогон без поля chz_signals: молчим, а не утверждаем «не найдено»', () => {
    const legacy = { ...brief(), chz_signals: undefined } as unknown as CompanyBriefResult;
    render(<CompanyBriefRenderer result={legacy} />);
    expect(screen.queryByText('Маркировка')).toBeNull();
    expect(screen.queryByText(/не найдено/)).toBeNull();
  });

  it('старый прогон без поля, но с ОКВЭД: справочник показываем, про поиск молчим', () => {
    const legacy = { ...brief(), chz_signals: undefined } as unknown as CompanyBriefResult;
    render(<CompanyBriefRenderer result={legacy} okved={DAIRY_OKVED} />);
    expect(screen.getByText(/справочник CRM/)).toBeTruthy();
    expect(screen.queryByText(/не найдено/)).toBeNull();
  });
});
