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

const AVATAR_COLORS = [
  'var(--accent)',
  'var(--green)',
  'var(--blue)',
  'var(--purple)',
  'var(--red)',
  'var(--yellow)',
] as const;

/**
 * Стабильный цвет аватара по имени. Одно имя → всегда один цвет, между
 * перезагрузками и устройствами (обычный строковый хеш, без рандома).
 */
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
