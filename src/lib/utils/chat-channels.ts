import type { ConversationKind } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-CHAT-HUB-1c: чистая логика списка каналов — заголовок строки и раскладка панели.
//
// Вынесено из хука и из ChannelList намеренно: обе функции — это правила продукта
// («что показывать как название», «что прячется за кнопкой»), и в 1b они уже один раз
// разъехались с текстом спринта. Здесь их видно целиком и они покрыты тестами.
// ═══════════════════════════════════════════════════════

/**
 * Заголовок общего канала организации. Одна строка обслуживает и список каналов, и
 * заголовок треда — расхождение названия между хабом и лентой читалось бы как два
 * разных канала.
 */
export const GENERAL_CHANNEL_TITLE = 'Общий чат';

/** Группа без `title` — состояние, которого CHECK 096 не допускает; заглушка на всякий. */
export const GROUP_FALLBACK_TITLE = 'Группа';

/** Проект не подтянулся embed'ом (удалён или не виден по RLS) — канал в списке остаётся. */
export const PROJECT_FALLBACK_TITLE = 'Проект';

/**
 * Название строки канала по его типу.
 *
 * `title` читается ТОЛЬКО у группы: у general он константа в коде, у project — имя
 * проекта, и в БД колонка у обоих пуста (инвариант 094). Fallback на неё для системных
 * каналов закрепил бы семантику, которой нет.
 */
export function channelTitle(
  kind: ConversationKind,
  title: string | null,
  projectName: string | null,
): string {
  if (kind === 'general') return GENERAL_CHANNEL_TITLE;
  if (kind === 'group' || kind === 'dm') return title?.trim() || GROUP_FALLBACK_TITLE;
  return projectName ?? PROJECT_FALLBACK_TITLE;
}

/** Минимум, который нужен раскладке: тип канала и был ли в нём хоть один разговор. */
type ChannelLike = {
  conversation: { kind: ConversationKind };
  lastMessageAt: string | null;
};

export interface ChannelPartition<T> {
  /** Общий канал org — всегда первым и отдельно. */
  general: T | null;
  /** Основной список: ВСЕ группы + проектные каналы, где писали. Порядок входной. */
  live: T[];
  /**
   * Пустые каналы ПРОЕКТОВ — единственное, что прячется за «Показать все проекты (N)».
   * Их заводит сидер пачками, и список из 17 пустых строк это шум, а не навигация.
   */
  emptyProjects: T[];
}

/**
 * Раскладка панели каналов.
 *
 * Пустая ГРУППА в скрываемую часть не попадает никогда: кнопка существует из-за
 * сидера, а группу человек только что создал руками — прятать её до первого
 * сообщения значит прятать результат только что сделанного действия.
 *
 * Входной порядок сохраняется: сортировку (свежие сверху, пустые по created_at)
 * задаёт useConversations, и пересортировывать её здесь было бы вторым источником
 * правды про порядок.
 */
export function partitionChannels<T extends ChannelLike>(items: T[]): ChannelPartition<T> {
  let general: T | null = null;
  const live: T[] = [];
  const emptyProjects: T[] = [];

  for (const item of items) {
    const kind = item.conversation.kind;
    if (kind === 'general') {
      // Второго general на org быть не может (partial unique 094) — берём первый.
      general ??= item;
    } else if (kind === 'project' && item.lastMessageAt === null) {
      emptyProjects.push(item);
    } else {
      live.push(item);
    }
  }

  return { general, live, emptyProjects };
}
