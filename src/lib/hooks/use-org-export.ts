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
 * ⚠️ Тип RPC ЛОКАЛЬНЫЙ, потому что 126 ещё НЕ ПРИМЕНЕНА: в `supabase.gen.ts`
 * функции `export_org_data` нет, и вызов не прошёл бы проверку. Править
 * сгенерированные типы руками запрещено (правило 2) — после apply + регена
 * локальный интерфейс и каст снимаются, больше ничего не меняется.
 *
 * ⚠️ Кастуется КЛИЕНТ, а не метод. `const rpc = supabase.rpc` отрывает метод от
 * объекта: внутри supabase-js он читает `this.rest`, оторванный вызов бросает
 * TypeError ещё ДО сети (FIX S-TL-1-RPC-THIS).
 */
interface ExportRpcError {
  message: string;
  code?: string;
}

interface ExportRpcClient {
  rpc(
    fn: 'export_org_data',
    args: { p_org_id: string },
  ): PromiseLike<{ data: unknown; error: ExportRpcError | null }>;
}

interface OrgIdRpcClient {
  rpc(fn: 'current_org_id'): PromiseLike<{ data: unknown; error: ExportRpcError | null }>;
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

      const { data: orgId, error: orgErr } = await (
        supabase as unknown as OrgIdRpcClient
      ).rpc('current_org_id');
      if (orgErr) throw explainExportError(orgErr);
      if (typeof orgId !== 'string' || !orgId) throw new Error('Нет активной организации');

      const { data, error } = await (supabase as unknown as ExportRpcClient).rpc(
        'export_org_data',
        { p_org_id: orgId },
      );
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
