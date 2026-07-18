// ═══════════════════════════════════════════════════════
// S-VIDEO-EMBED-1: парсинг видео-URL → провайдер + embed-src.
// БЕЗОПАСНОСТЬ: embedUrl собирается ТОЛЬКО из распарсенных id (regex-захват),
// сырой url в iframe НЕ попадает. Рендер зовёт parseVideoUrl(stored.url) —
// stored provider из БД используется исключительно для badge/иконки.
// ═══════════════════════════════════════════════════════

export type VideoProvider = 'youtube' | 'vk' | 'rutube' | 'other';

export interface ParsedVideo {
  provider: VideoProvider;
  /** null для provider='other' — рендерим карточкой-ссылкой, не iframe. */
  embedUrl: string | null;
}

// watch?v= / embed/ / shorts/ (youtube.com, www., m.) + youtu.be/<id>; id — 11 символов [\w-]
const YOUTUBE_RE =
  /(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
// vk.com / vkvideo.ru / vk.ru: video<oid>_<id> (oid может быть отрицательным — сообщества)
const VK_RE = /vk(?:video)?\.(?:com|ru)\/video(-?\d+)_(\d+)/;
// rutube.ru/video/<hex> или уже готовый embed-путь
const RUTUBE_RE = /rutube\.ru\/(?:video|play\/embed)\/([0-9a-f]+)/;

/** Определить провайдера и построить embed-src из id (не из сырого url). */
export function parseVideoUrl(raw: string): ParsedVideo {
  const yt = raw.match(YOUTUBE_RE);
  if (yt) {
    return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
  }

  const vk = raw.match(VK_RE);
  if (vk) {
    return { provider: 'vk', embedUrl: `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}&hd=2` };
  }

  const rt = raw.match(RUTUBE_RE);
  if (rt) {
    return { provider: 'rutube', embedUrl: `https://rutube.ru/play/embed/${rt[1]}` };
  }

  return { provider: 'other', embedUrl: null };
}

export const PROVIDER_LABELS: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  vk: 'VK Видео',
  rutube: 'Rutube',
  other: 'Ссылка',
};
