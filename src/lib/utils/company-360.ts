// ═══════════════════════════════════════════════════════
// S-R2-CO360 — Company 360: чистая композиция уже загруженных данных карточки
// компании. Ноль запросов: делит массив `useProjects()` на продажи и внедрения,
// считает итоговую строку фактов и склоняет числительные.
// Здесь только домен — разметка в `components/companies/CompanyDetail.tsx`.
// ═══════════════════════════════════════════════════════

/** Терминальная сделка — закрыта (won/lost). `on_hold` — пауза, не финал. */
export function isTerminalDeal(status: string | null | undefined): boolean {
  return status === 'won' || status === 'lost';
}

interface ProjectLike {
  type?: string | null;
  status?: string | null;
}

export interface CompanyProjectSplit<T> {
  /** Продажи — `type='client'` (раздел /deals). */
  deals: T[];
  /**
   * Внедрения — всё, что не `client` (раздел /projects).
   * `internal` включён намеренно: `projectHref` и IA уже трактуют delivery+internal
   * как одну секцию, а фильтр строго по 'delivery' молча терял бы строку с карточки.
   */
  deliveries: T[];
}

/** Разделить проекты компании на продажи и внедрения. Порядок внутри сохраняется. */
export function splitCompanyProjects<T extends ProjectLike>(projects: T[]): CompanyProjectSplit<T> {
  const deals: T[] = [];
  const deliveries: T[] = [];
  for (const p of projects) {
    if (p.type === 'client' || p.type == null) deals.push(p);
    else deliveries.push(p);
  }
  return { deals, deliveries };
}

export interface Company360Counts {
  deals: number;
  /** Сколько из `deals` не закрыты (не won/lost). */
  dealsOpen: number;
  deliveries: number;
  contacts: number;
}

export function countCompany360<T extends ProjectLike>(
  split: CompanyProjectSplit<T>,
  contactsCount: number,
): Company360Counts {
  return {
    deals: split.deals.length,
    dealsOpen: split.deals.filter((d) => !isTerminalDeal(d.status)).length,
    deliveries: split.deliveries.length,
    contacts: contactsCount,
  };
}

/**
 * Русское склонение по числу: [1, 2–4, 5+].
 * `ruPlural(1, ['сделка','сделки','сделок']) === 'сделка'`
 */
export function ruPlural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/**
 * Итоговая строка фактов компании: `2 сделки (1 открыта) · 1 внедрение · 8 контактов`.
 *
 * Терминальные сделки в счётчик входят, но открытые названы отдельно — иначе
 * «1 сделка» умалчивает, что она выиграна год назад. Скобка не рендерится, когда
 * открытых нет вовсе или открыты все (ничего не уточняет).
 */
export function formatCompany360Summary(c: Company360Counts): string {
  const dealsPart = `${c.deals} ${ruPlural(c.deals, ['сделка', 'сделки', 'сделок'])}`;
  const openPart =
    c.dealsOpen > 0 && c.dealsOpen < c.deals
      ? ` (${c.dealsOpen} ${ruPlural(c.dealsOpen, ['открыта', 'открыты', 'открыто'])})`
      : '';
  const deliveriesPart = `${c.deliveries} ${ruPlural(c.deliveries, ['внедрение', 'внедрения', 'внедрений'])}`;
  const contactsPart = `${c.contacts} ${ruPlural(c.contacts, ['контакт', 'контакта', 'контактов'])}`;
  return `${dealsPart}${openPart} · ${deliveriesPart} · ${contactsPart}`;
}
