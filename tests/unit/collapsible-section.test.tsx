import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { writeSectionExpanded } from '@/lib/utils/section-state';

// ═══════════════════════════════════════════════════════
// S-DEAL-LAYOUT-1 (гейт, фикс 1): ленивое монтирование содержимого.
//
// До первой развёртки `children` в DOM НЕТ — иначе доска задач сделки грузилась
// бы при каждом открытии карточки, даже свёрнутой: `ProjectBoardSection` зовёт
// хуки ради сводки и монтируется всегда. После первой развёртки действует
// прежнее правило — сворачивание прячет `hidden`, а не размонтирует, иначе
// доска перезапрашивала бы данные на каждый разворот.
// ═══════════════════════════════════════════════════════

const CONTENT = 'содержимое секции';

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

function renderSection(props: { forceExpanded?: boolean; defaultExpanded?: boolean } = {}) {
  return render(
    <CollapsibleSection projectId="p1" sectionId="board" title="Доска задач" {...props}>
      <div>{CONTENT}</div>
    </CollapsibleSection>,
  );
}

/** Обёртка содержимого — тот самый div, который несёт `hidden`. */
function contentWrapper(): HTMLElement | null {
  const node = screen.queryByText(CONTENT);
  return node ? node.parentElement : null;
}

describe('CollapsibleSection — ленивое монтирование', () => {
  test('до первого раскрытия children отсутствуют в DOM', () => {
    renderSection();
    expect(screen.queryByText(CONTENT)).toBeNull();
    // заголовок и сама секция при этом на месте — грузится только сводка
    expect(screen.getByRole('button', { name: /Доска задач/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('после раскрытия children появляются и видимы', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Доска задач/ }));
    expect(screen.getByText(CONTENT)).toBeVisible();
    expect(contentWrapper()).not.toHaveAttribute('hidden');
  });

  test('повторное сворачивание оставляет children в DOM под hidden', () => {
    renderSection();
    const button = screen.getByRole('button', { name: /Доска задач/ });
    fireEvent.click(button); // развернули
    fireEvent.click(button); // свернули обратно

    expect(screen.getByText(CONTENT)).toBeInTheDocument();
    expect(contentWrapper()).toHaveAttribute('hidden');
    expect(screen.getByText(CONTENT)).not.toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('третий клик снова показывает то же содержимое — оно не размонтировалось', () => {
    renderSection();
    const button = screen.getByRole('button', { name: /Доска задач/ });
    fireEvent.click(button);
    const first = screen.getByText(CONTENT);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByText(CONTENT)).toBe(first);
    expect(screen.getByText(CONTENT)).toBeVisible();
  });

  test('сохранённое «развёрнуто» ⇒ children с первого рендера', () => {
    writeSectionExpanded('p1', 'board', true);
    renderSection();
    expect(screen.getByText(CONTENT)).toBeVisible();
  });

  test('forceExpanded (деплинк) ⇒ children с первого рендера', () => {
    renderSection({ forceExpanded: true });
    expect(screen.getByText(CONTENT)).toBeVisible();
  });

  test('сохранённое «свёрнуто» при defaultExpanded ⇒ children ещё не в DOM', () => {
    writeSectionExpanded('p1', 'board', false);
    renderSection({ defaultExpanded: true });
    expect(screen.queryByText(CONTENT)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// S-DEAL-DEADLINES-1 (задача 0): слот `alwaysVisible` — обратная сторона
// ленивого монтирования. Таймлайн дедлайнов обязан отвечать «что горит» ДО
// раскрытия доски, а в `children` он не смонтирован и в `summary` не помещается
// (там он оказался бы кнопкой внутри кнопки-шапки).
// ═══════════════════════════════════════════════════════

const ALWAYS = 'таймлайн дедлайнов';

describe('CollapsibleSection — слот alwaysVisible', () => {
  function renderWithSlot() {
    return render(
      <CollapsibleSection
        projectId="p1"
        sectionId="board"
        title="Доска задач"
        alwaysVisible={<button type="button">{ALWAYS}</button>}
      >
        <div>{CONTENT}</div>
      </CollapsibleSection>,
    );
  }

  test('виден при свёрнутой секции, когда children ещё нет в DOM', () => {
    renderWithSlot();
    expect(screen.getByText(ALWAYS)).toBeVisible();
    expect(screen.queryByText(CONTENT)).toBeNull();
  });

  test('остаётся видимым и после раскрытия, и после обратного сворачивания', () => {
    renderWithSlot();
    const button = screen.getByRole('button', { name: /Доска задач/ });
    fireEvent.click(button);
    expect(screen.getByText(ALWAYS)).toBeVisible();
    fireEvent.click(button);
    expect(screen.getByText(ALWAYS)).toBeVisible();
    // ...в отличие от содержимого, которое ушло под hidden.
    expect(screen.getByText(CONTENT)).not.toBeVisible();
  });

  test('лежит ВНЕ кнопки-шапки — своя кнопка внутри слота остаётся отдельной', () => {
    renderWithSlot();
    const header = screen.getByRole('button', { name: /Доска задач/ });
    const inner = screen.getByRole('button', { name: ALWAYS });
    expect(header.contains(inner)).toBe(false);
  });

  test('без пропа лишнего контейнера не появляется', () => {
    render(
      <CollapsibleSection projectId="p1" sectionId="board" title="Доска задач">
        <div>{CONTENT}</div>
      </CollapsibleSection>,
    );
    expect(screen.queryByText(ALWAYS)).toBeNull();
  });
});
