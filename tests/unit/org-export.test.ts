// S-EXPORT-1: состав выгрузки организации — контракт, который живёт в ДВУХ местах.
//
// `EXPORT_TABLES` в TS и массив `v_tables` в миграции 126 обязаны совпадать
// построчно. Дубль осознанный (SQL — исполняемый контракт, TS — документированный
// с причинами исключений), но расхождение обязано валить CI, а не всплывать
// в проде файлом, где таблицы молча нет.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EXPORT_TABLES,
  EXCLUDED_TABLES,
  EXPORT_FORMAT,
  countExportedRows,
  isOrgExportPayload,
  orgExportFileName,
  type OrgExportPayload,
} from '@/lib/domain/org-export';

const MIGRATION = resolve(__dirname, '../../supabase/migrations/126_org_export.sql');

/** Список таблиц из литерала `v_tables text[] := array[…]` тела функции. */
function sqlTables(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const block = sql.match(/v_tables text\[\] := array\[([\s\S]*?)\n {2}\];/);
  expect(block, 'массив v_tables не найден в миграции').not.toBeNull();
  return [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('состав экспорта', () => {
  it('EXPORT_TABLES и EXCLUDED_TABLES не пересекаются', () => {
    const excluded = Object.keys(EXCLUDED_TABLES);
    const both = EXPORT_TABLES.filter((t) => excluded.includes(t));
    expect(both).toEqual([]);
  });

  it('в EXPORT_TABLES нет дублей — иначе таблица уехала бы в файл дважды', () => {
    expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
  });

  it('у каждой исключённой таблицы есть непустая причина', () => {
    for (const [table, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason.length, `${table} без причины`).toBeGreaterThan(10);
    }
  });
});

describe('SQL-массив миграции 126 против EXPORT_TABLES', () => {
  it('совпадает построчно, включая порядок', () => {
    expect(sqlTables()).toEqual([...EXPORT_TABLES]);
  });

  it('ни одна исключённая таблица не попала в SQL-массив', () => {
    const inSql = new Set(sqlTables());
    const leaked = Object.keys(EXCLUDED_TABLES).filter((t) => inSql.has(t));
    expect(leaked).toEqual([]);
  });

  it('версия формата в SQL совпадает с EXPORT_FORMAT', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain(`'${EXPORT_FORMAT}'`);
  });

  it('функция объявлена SECURITY INVOKER — на этом держится изоляция org', () => {
    const sql = readFileSync(MIGRATION, 'utf8').toLowerCase();
    expect(sql).toContain('security invoker');
    expect(sql).not.toMatch(/security\s+definer/);
  });

  it('членство сверяется по memberships.profile_id (колонки user_id в таблице нет)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('m.profile_id');
    expect(sql).not.toMatch(/m\.user_id/);
  });
});

describe('orgExportFileName — локальная дата, не UTC', () => {
  it('поздний вечер MSK даёт СЕГОДНЯШНЕЕ число, а не завтрашнее', () => {
    // 23:30 MSK = 20:30 UTC того же дня. Тест не полагается на TZ машины:
    // Date собирается из локальных компонент, а `toISOString()` для UTC+ поясов
    // в этот момент отдал бы другое число.
    const late = new Date(2026, 7, 22, 23, 30, 0);
    expect(orgExportFileName(late)).toBe('dashboard-crm-export-2026-08-22.json');
  });

  it('месяц и день дополняются нулём', () => {
    expect(orgExportFileName(new Date(2026, 0, 5, 12, 0, 0))).toBe(
      'dashboard-crm-export-2026-01-05.json',
    );
  });
});

describe('isOrgExportPayload / countExportedRows', () => {
  const ok: OrgExportPayload = {
    meta: {
      org_id: '00000000-0000-0000-0000-000000000001',
      exported_at: '2026-08-22T20:30:00Z',
      exported_by: '00000000-0000-0000-0000-000000000002',
      format: EXPORT_FORMAT,
      tables: [...EXPORT_TABLES],
    },
    members: [{ profile_id: '00000000-0000-0000-0000-000000000002', role: 'owner' }],
    data: { companies: [{ id: 'a' }, { id: 'b' }], tasks: [{ id: 'c' }], leads: [] },
  };

  it('принимает валидную выгрузку', () => {
    expect(isOrgExportPayload(ok)).toBe(true);
  });

  it('считает строки по всем таблицам, пустые не мешают', () => {
    expect(countExportedRows(ok)).toBe(3);
  });

  it.each([
    ['null', null],
    ['массив', []],
    ['без meta', { members: [], data: {} }],
    ['meta без org_id', { meta: { format: 'x' }, members: [], data: {} }],
    ['members не массив', { meta: { org_id: 'a', format: 'x' }, members: {}, data: {} }],
    [
      'значение data не массив',
      { meta: { org_id: 'a', format: 'x' }, members: [], data: { tasks: 1 } },
    ],
  ])('отвергает: %s', (_label, value) => {
    expect(isOrgExportPayload(value)).toBe(false);
  });
});
