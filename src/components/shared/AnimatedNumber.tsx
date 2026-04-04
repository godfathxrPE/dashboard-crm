'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function AnimatedNumber({
  value,
  duration = 600,
  formatFn = (n) => Math.round(n).toLocaleString('ru-RU'),
  className,
  style,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState('0');
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(formatFn(value));
      return;
    }

    if (hasAnimated.current) {
      setDisplay(formatFn(value));
      return;
    }

    hasAnimated.current = true;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = easeOutExpo(progress) * value;
      setDisplay(formatFn(current));
      if (progress < 1) requestAnimationFrame(tick);
      else setDisplay(formatFn(value));
    }

    requestAnimationFrame(tick);
  }, [value, duration, formatFn]);

  return <span className={className} style={style}>{display}</span>;
}
