/**
 * Linear interpolation between two hex colors.
 * @param a - start color (#rrggbb)
 * @param b - end color (#rrggbb)
 * @param t - progress 0..1
 */
export function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

/**
 * Interpolate a color from a multi-stop gradient at position t (0..1).
 */
export function sampleGradient(colors: readonly string[], t: number): string {
  if (colors.length === 1) return colors[0];
  const clampedT = Math.max(0, Math.min(1, t));
  const segment = clampedT * (colors.length - 1);
  const i = Math.floor(segment);
  const localT = segment - i;
  const c1 = colors[Math.min(i, colors.length - 1)];
  const c2 = colors[Math.min(i + 1, colors.length - 1)];
  return lerpColor(c1, c2, localT);
}
