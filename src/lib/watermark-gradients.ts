export const WATERMARK_GRADIENTS = {
  aurora:     ['#00dc82', '#10c98a', '#36d1dc', '#6a5acd', '#9b59b6', '#8e44ad', '#7d3c98'],
  oilSlick:   ['#ff6b9d', '#c44cff', '#45caff', '#6ee7b7', '#ffca28', '#ffa726', '#ff7043', '#e84393'],
  frost:      ['#74b9ff', '#889bf0', '#928cfe', '#8b6ce7', '#7b5bde', '#6c5ce7', '#5b4cdb', '#4a3dc9'],
  tidal:      ['#0652DD', '#1dd1a1', '#00d2d3'],
  sunset:     ['#ff9a56', '#ff6b81', '#c44cff', '#8c6cff', '#548cff', '#389cff'],
  iridescent: ['#2ecc71', '#3498db', '#9b59b6', '#e84393', '#fd79a8'],
} as const;

/** Widget → gradient mapping */
export const WIDGET_GRADIENT: Record<string, readonly string[]> = {
  funnel:    WATERMARK_GRADIENTS.aurora,
  activity:  WATERMARK_GRADIENTS.oilSlick,
  deadlines: WATERMARK_GRADIENTS.frost,
  calls:     WATERMARK_GRADIENTS.tidal,
  projects:  WATERMARK_GRADIENTS.aurora,
  pipeline:  WATERMARK_GRADIENTS.iridescent,
  tasks:     WATERMARK_GRADIENTS.sunset,
  deals:     ['#ff6b9d', '#c44cff', '#45caff', '#6ee7b7'],
};
