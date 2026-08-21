'use client';

import { useMutation } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  countExportedRows,
  isOrgExportPayload,
  orgExportFileName,
  type OrgExportPayload,
} from '@/lib/domain/org-export';

/**
 * S-EXPORT-1 — выгрузка данных организации в JSON-файл.
 *
 * Скачивание файла — побочный эффект, и ему место в мутации, а не в компоненте:
 * `URL.createObjectURL` без парного `revokeObjectURL` держит blob в памяти до
 * перезагрузки вкладки, а компонент про это забудет.
 *
 * Локальные типы RPC сняты на гейте 21.08 после apply 126 и регенерации:
 * `export_org_data` есть в `supabase.gen.ts`, вызов типизирован генерацией.
 */
interface ExportRpcError {
  message: string;
  code?: string;
}

export interface OrgExportResult {
  fileName: string;
  rowCount: number;
  tableCount: number;
}

/**
 * `42501` прилетает из `raise exception … using errcode` — на клиенте это код,
 * а не текст. Показывать пользователю «42501» бессмысленно, поэтому переводим;
 * остальные ошибки идут своим текстом, чтобы не потерять диагностику.
 */
function explainExportError(error: ExportRpcError): Error {
  if (error.code === '42501') {
    return new Error('Нет доступа к данным этой организации');
  }
  return new Error(error.message || 'Не удалось выгрузить данные');
}

/** Сохранение blob как файла. Отдельно — чтобы `revokeObjectURL` был в `finally`. */
function downloadJson(payload: OrgExportPayload, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useOrgExport() {
  return useMutation({
    mutationFn: async (): Promise<OrgExportResult> => {
      const supabase = createClient();

      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw explainExportError(orgErr);
      if (typeof orgId !== 'string' || !orgId) throw new Error('Нет активной организации');

      const { data, error } = await supabase.rpc('export_org_data', { p_org_id: orgId });
      if (error) throw explainExportError(error);

      // Форму ответа проверяем ДО записи файла: сохранить под именем выгрузки то,
      // что выгрузкой не является, хуже, чем показать ошибку.
      if (!isOrgExportPayload(data)) {
        throw new Error('Сервер вернул неожиданный ответ — выгрузка не сохранена');
      }

      const fileName = orgExportFileName();
      downloadJson(data, fileName);

      return {
        fileName,
        rowCount: countExportedRows(data),
        tableCount: Object.keys(data.data).length,
      };
    },
  });
}
