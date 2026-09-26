// ═══════════════════════════════════════════════════════
// Кружок-аватар с инициалами: цвет и буквы.
//
// Вынесено из ContactDetailHub в S-R2-CO360-1: те же инициалы понадобились строкам
// контактов на карточке компании, а копия хеш-функции означала бы, что один человек
// на двух экранах покрашен по-разному — аватар перестал бы быть опознавательным
// знаком. Цвета — только токены темы (ноль hex), поэтому палитра едет вместе с темой.
//
// ⚠️ Это НЕ `chat-avatars.ts`: там градиенты каналов чата на djb2. Здесь — плоский
// цвет по имени человека. Сводить в одно не стоит: разные сущности, разная палитра.
// ═══════════════════════════════════════════════════════

/** Оттенки аватара — имена цветовых токенов темы, порядок фиксирован (хеш → индекс). */
const AVATAR_TONES = ['accent', 'green', 'blue', 'purple', 'red', 'yellow'] as const;

export type AvatarTone = (typeof AVATAR_TONES)[number];

function avatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_TONES.length;
}

/**
 * Стабильный цвет аватара по имени. Одно имя → всегда один цвет, между
 * перезагрузками и устройствами (обычный строковый хеш, без рандома).
 * Сплошная заливка под белые инициалы.
 */
export function getAvatarColor(name: string): string {
  return `var(--${AVATAR_TONES[avatarIndex(name)]})`;
}

/**
 * Тот же оттенок, что `getAvatarColor`, но ИМЕНЕМ токена — для мягкого аватара
 * (тинт `--X-l` + текст цвета X, пара бейджа, которую меряет audit-contrast).
 * S-DEAL-STAKE-VIEW-1: один человек в «Стейкхолдерах» и на карточке компании
 * покрашен одним оттенком, различается только плотность заливки.
 */
export function getAvatarTone(name: string): AvatarTone {
  return AVATAR_TONES[avatarIndex(name)];
}

/** Инициалы: первая буква имени + первая фамилии. Фамилии нет → одна буква. */
export function getInitials(firstName: string, lastName?: string | null): string {
  return `${firstName.charAt(0)}${(lastName ?? '').charAt(0)}`.toUpperCase();
}

/**
 * Инициалы из цельной строки («Олег Мазурок» → «ОМ»), для профилей команды,
 * где имя приходит одним полем `full_name`.
 */
export function getInitialsFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return getInitials(parts[0], parts[1] ?? null);
}
