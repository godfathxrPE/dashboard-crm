import type { PhoneEntry } from '@/types/database';
import { PHONE_TYPE_LABEL } from '@/lib/validators/phone';

interface PhoneListProps {
  /** Массив phones (041). Может отсутствовать до применения миграции. */
  phones?: PhoneEntry[] | null;
  /** Legacy одиночный phone — fallback, если массив пуст. */
  fallback?: string | null;
}

/**
 * Список телефонов в detail-карточке. Primary сверху с меткой «основной»,
 * остальные — с типом. Клик — tel:-ссылка. Пусто → рендерит null (вызывающий
 * прячет блок). Fallback на legacy `phone`, пока 041 не применена.
 */
export function PhoneList({ phones, fallback }: PhoneListProps) {
  const list: PhoneEntry[] = phones?.length
    ? phones
    : fallback
      ? [{ type: 'mobile', value: fallback, is_primary: true }]
      : [];

  if (list.length === 0) return null;

  // Primary вперёд, порядок остальных сохраняем.
  const sorted = [...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const usePrimaryLabel = phones?.length ? true : false; // у legacy-fallback нет смысла в метках

  return (
    <div className="space-y-1">
      {sorted.map((p, i) => (
        <div key={`${p.value}-${i}`} className="flex items-center gap-2">
          <a
            href={`tel:${p.value.replace(/[^\d+]/g, '')}`}
            className="text-sm text-text-main hover:text-accent hover:underline"
          >
            {p.value}
          </a>
          {usePrimaryLabel && (
            p.is_primary ? (
              <span data-tag className="rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent">
                основной
              </span>
            ) : (
              <span className="text-xs text-text-mute">{PHONE_TYPE_LABEL[p.type]}</span>
            )
          )}
        </div>
      ))}
    </div>
  );
}
