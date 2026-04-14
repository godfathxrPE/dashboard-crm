/**
 * Returns CSS classes for staggered appear animation.
 * @param index — 0-based index of the element
 * @param maxStagger — cap the delay steps (default 8)
 */
export function staggerClass(index: number, maxStagger = 8): string {
  const step = Math.min(index + 1, maxStagger);
  return `animate-appear stagger-${step}`;
}
