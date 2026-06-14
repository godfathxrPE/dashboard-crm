import { localDateKey } from '@/lib/utils/date-helpers';
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  columns: { key: string; label: string }[],
) {
  const header = columns.map((c) => c.label).join(',');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        const str = val == null ? '' : String(val);
        return str.includes(',') || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${localDateKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
