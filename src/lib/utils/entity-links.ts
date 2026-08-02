// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1e: ссылки на сущности CRM внутри тела сообщения.
//
// Человек копирует адрес карточки из адресной строки и вставляет в чат — вместо
// 70-символьного uuid-полотна показываем чип с названием сущности.
//
// Границы намеренно узкие: распознаём ТОЛЬКО четыре собственных раздела. Ни markdown,
// ни автолинкификации внешних URL здесь нет — превращать чужой адрес в кликабельную
// ссылку это отдельное решение с отдельной моделью угроз (фишинг в командном чате),
// и принимать его мимоходом в косметическом спринте нельзя.
//
// XSS-контур не меняется: функция возвращает ДАННЫЕ, рендер остаётся на React
// (никакого dangerouslySetInnerHTML), а href собирается из белого списка сегментов и
// провалидированного uuid — из исходной строки пользователя в него не попадает ничего.
// ═══════════════════════════════════════════════════════

export const ENTITY_TYPES = ['deal', 'project', 'company', 'contact'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Раздел приложения ↔ тип сущности. Единственный источник и парсинга, и href. */
const SEGMENT_TO_TYPE: Record<string, EntityType> = {
  deals: 'deal',
  projects: 'project',
  companies: 'company',
  contacts: 'contact',
};
const TYPE_TO_SEGMENT: Record<EntityType, string> = {
  deal: 'deals',
  project: 'projects',
  company: 'companies',
  contact: 'contacts',
};

/**
 * Origin прода. Ссылку копируют из боевого адреса, а читают её в том числе с localhost
 * (разработка) — узнавать надо оба. Захардкожен, а не через env: `NEXT_PUBLIC_*` для
 * адреса приложения в проекте нет, а заводить переменную окружения ради одной строки
 * значит завести ещё одно место, где прод может разъехаться с реальностью.
 */
export const APP_ORIGIN = 'https://dashboard-crm-ten.vercel.app';

export interface TextPart {
  kind: 'text';
  text: string;
}

export interface EntityPart {
  kind: 'entity';
  entityType: EntityType;
  /** uuid в нижнем регистре — ключ и для запроса названий, и для href. */
  id: string;
  /** Внутренний путь, собранный из белого списка. НЕ исходная строка. */
  href: string;
}

export type BodyPart = TextPart | EntityPart;

/**
 * Кандидат в ссылку:
 *  1 — граница слева (начало строки или пробел/открывающая скобка/кавычка). Нужна,
 *      чтобы `https://evil.com/foo/deals/<uuid>` не распался на «чужой хост» + «свой
 *      относительный путь»: без границы регэксп зацепился бы за хвост чужого адреса;
 *  2 — origin, может быть пустым (относительный путь);
 *  3 — раздел;
 *  4 — uuid.
 *
 * Хвостовой lookahead запрещает продолжение сегмента: `?`, `#`, `/` и словесные символы
 * после uuid значат, что ссылка ведёт не в саму карточку (вкладка, подресурс) — такой
 * адрес честнее оставить текстом, чем молча увести пользователя не туда. Точка и
 * запятая после ссылки при этом остаются знаками препинания, а не частью адреса.
 */
const ENTITY_LINK_RE = new RegExp(
  String.raw`(^|[\s(\[<«"'])` +
    String.raw`((?:https?://[^\s/]+)?)` +
    String.raw`/(deals|projects|companies|contacts)/` +
    String.raw`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})` +
    String.raw`(?![\w?#/-])`,
  'gi',
);

/** `https://Host/` и `https://host` — один и тот же origin. */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Разбить тело сообщения на текст и ссылки-сущности.
 *
 * `origins` — список разрешённых origin'ов для АБСОЛЮТНЫХ ссылок; относительный путь
 * (`/deals/<uuid>`) распознаётся всегда. Параметром, а не `window.location.origin`
 * внутри: функция обязана оставаться чистой, иначе её нельзя ни протестировать, ни
 * выполнить на сервере.
 *
 * Ссылка с чужого хоста возвращается обычным текстом — не отбрасывается: потерять
 * кусок сообщения хуже, чем не украсить его.
 */
export function parseEntityLinks(body: string, origins: string[] = []): BodyPart[] {
  if (!body) return [];

  const allowed = new Set(origins.map(normalizeOrigin).filter(Boolean));
  const parts: BodyPart[] = [];
  let cursor = 0;

  // Регэксп с флагом `g` держит lastIndex между вызовами — создаём свежий на каждый
  // разбор, иначе второе сообщение начало бы читаться с середины.
  const re = new RegExp(ENTITY_LINK_RE.source, ENTITY_LINK_RE.flags);

  const pushText = (text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    // Склейка соседних текстов: граница слева и отвергнутая ссылка приходят отдельными
    // кусками, а в разметке это один абзац.
    if (last && last.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
  };

  for (const match of body.matchAll(re)) {
    const [whole, boundary, origin, segment, rawId] = match;
    const start = match.index ?? 0;

    pushText(body.slice(cursor, start));
    cursor = start + whole.length;

    // Граница — часть текста, а не ссылки: пробел перед чипом должен остаться пробелом.
    pushText(boundary);

    const entityType = SEGMENT_TO_TYPE[segment.toLowerCase()];
    const originOk = origin === '' || allowed.has(normalizeOrigin(origin));
    if (!entityType || !originOk) {
      pushText(whole.slice(boundary.length));
      continue;
    }

    const id = rawId.toLowerCase();
    parts.push({
      kind: 'entity',
      entityType,
      id,
      href: `/${TYPE_TO_SEGMENT[entityType]}/${id}`,
    });
  }

  pushText(body.slice(cursor));
  return parts;
}

/** Есть ли в разборе хоть один чип — чтобы не таскать пустой резолв названий. */
export function entityRefsOf(parts: BodyPart[]): EntityPart[] {
  return parts.filter((p): p is EntityPart => p.kind === 'entity');
}

/** Ключ названия сущности: deal и project живут в одной таблице, тип различает их. */
export function entityKey(entityType: EntityType, id: string): string {
  return `${entityType}:${id}`;
}
