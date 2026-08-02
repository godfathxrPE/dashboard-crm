import { describe, it, expect } from 'vitest';
import {
  APP_ORIGIN,
  entityRefsOf,
  parseEntityLinks,
  type BodyPart,
  type EntityPart,
} from '@/lib/utils/entity-links';

const UUID = '3f1c0f4e-1a2b-4c3d-8e9f-000000000001';
const ORIGINS = [APP_ORIGIN, 'http://localhost:3000'];

/** Текст, собранный обратно — должен совпадать с исходником байт в байт. */
function joined(parts: BodyPart[]): string {
  return parts.map((p) => (p.kind === 'text' ? p.text : p.href)).join('');
}

describe('parseEntityLinks — что распознаём', () => {
  it('абсолютная ссылка с origin прода', () => {
    const parts = parseEntityLinks(`Смотри ${APP_ORIGIN}/deals/${UUID} тут`, ORIGINS);
    expect(parts).toEqual([
      { kind: 'text', text: 'Смотри ' },
      { kind: 'entity', entityType: 'deal', id: UUID, href: `/deals/${UUID}` },
      { kind: 'text', text: ' тут' },
    ]);
  });

  it('относительный путь — всегда, без списка origin', () => {
    const parts = parseEntityLinks(`/projects/${UUID}`, []);
    expect(parts).toEqual([
      { kind: 'entity', entityType: 'project', id: UUID, href: `/projects/${UUID}` },
    ]);
  });

  it('все четыре раздела', () => {
    const body = `/deals/${UUID} /projects/${UUID} /companies/${UUID} /contacts/${UUID}`;
    expect(entityRefsOf(parseEntityLinks(body, ORIGINS)).map((p) => p.entityType)).toEqual([
      'deal',
      'project',
      'company',
      'contact',
    ]);
  });

  it('сообщение целиком из одной ссылки — только чип, без пустых текстов', () => {
    const parts = parseEntityLinks(`${APP_ORIGIN}/companies/${UUID}`, ORIGINS);
    expect(parts).toHaveLength(1);
    expect(parts[0].kind).toBe('entity');
  });

  it('несколько ссылок в одном сообщении', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    const parts = parseEntityLinks(`а /deals/${UUID} и /contacts/${other} всё`, ORIGINS);
    expect(entityRefsOf(parts).map((p) => p.id)).toEqual([UUID, other]);
  });

  it('uuid в верхнем регистре нормализуется в нижний', () => {
    const parts = parseEntityLinks(`/deals/${UUID.toUpperCase()}`, ORIGINS);
    expect((parts[0] as EntityPart).id).toBe(UUID);
    expect((parts[0] as EntityPart).href).toBe(`/deals/${UUID}`);
  });

  it('точка после ссылки остаётся знаком препинания', () => {
    const parts = parseEntityLinks(`Открой /deals/${UUID}.`, ORIGINS);
    expect(entityRefsOf(parts)).toHaveLength(1);
    expect(parts[parts.length - 1]).toEqual({ kind: 'text', text: '.' });
  });
});

describe('parseEntityLinks — что оставляем текстом', () => {
  const plain = (body: string) => {
    const parts = parseEntityLinks(body, ORIGINS);
    expect(entityRefsOf(parts)).toHaveLength(0);
    expect(joined(parts)).toBe(body);
  };

  it('битый uuid', () => plain('/deals/123-456'));
  it('uuid не той длины', () => plain('/deals/3f1c0f4e-1a2b-4c3d-8e9f-0000000000'));
  it('чужой домен', () => plain(`https://evil.example.com/deals/${UUID}`));
  it('чужой домен с нашим путём в хвосте', () =>
    plain(`https://evil.example.com/foo/deals/${UUID}`));
  it('неизвестный раздел', () => plain(`/tasks/${UUID}`));
  it('внешняя ссылка вообще', () => plain('https://ya.ru/some/page'));
  it('текст без ссылок', () => plain('Просто сообщение про сделку'));
  it('пустое тело даёт пустой разбор', () => {
    expect(parseEntityLinks('', ORIGINS)).toEqual([]);
  });
  it('хвост после uuid (вкладка/якорь) — ведёт не в карточку', () => {
    plain(`/deals/${UUID}?tab=chat`);
    plain(`/deals/${UUID}#notes`);
    plain(`/deals/${UUID}/tasks`);
  });
  it('uuid, приклеенный к слову', () => plain(`/deals/${UUID}abc`));
});

describe('parseEntityLinks — инварианты', () => {
  // Для относительных ссылок href совпадает с исходной подстрокой — на них инвариант
  // «ничего не потеряно» проверяется буквально. У абсолютной ссылки origin по замыслу
  // не переживает разбор: в чипе от неё остаётся только внутренний путь.
  it('склеенный обратно текст равен исходному (ничего не потеряно)', () => {
    const body = `см. /deals/${UUID}, а также /companies/${UUID} — всё`;
    expect(joined(parseEntityLinks(body, ORIGINS))).toBe(body);
  });

  it('абсолютная ссылка теряет origin, но не окружающий текст', () => {
    const body = `до ${APP_ORIGIN}/deals/${UUID} после`;
    const parts = parseEntityLinks(body, ORIGINS);
    expect(parts.filter((p) => p.kind === 'text').map((p) => p.text)).toEqual([
      'до ',
      ' после',
    ]);
  });

  it('соседние текстовые куски склеены (нет цепочки пустых абзацев)', () => {
    const parts = parseEntityLinks(`a https://evil.example.com/deals/${UUID} b`, ORIGINS);
    expect(parts.filter((p) => p.kind === 'text')).toHaveLength(1);
  });

  it('повторный разбор даёт тот же результат (lastIndex не течёт)', () => {
    const body = `/deals/${UUID}`;
    expect(parseEntityLinks(body, ORIGINS)).toEqual(parseEntityLinks(body, ORIGINS));
  });

  it('origin сравнивается без учёта регистра и хвостового слэша', () => {
    const parts = parseEntityLinks(`${APP_ORIGIN.toUpperCase()}/deals/${UUID}`, [
      `${APP_ORIGIN}/`,
    ]);
    expect(entityRefsOf(parts)).toHaveLength(1);
  });

  it('перевод строки перед ссылкой сохраняется', () => {
    const parts = parseEntityLinks(`Первая строка\n/deals/${UUID}`, ORIGINS);
    expect(parts[0]).toEqual({ kind: 'text', text: 'Первая строка\n' });
    expect(parts[1].kind).toBe('entity');
  });
});
