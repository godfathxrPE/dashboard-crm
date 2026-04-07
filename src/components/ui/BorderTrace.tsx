'use client';

import { useRef, useState, useEffect } from 'react';

/**
 * SVG overlay that draws an animated stroke along the parent's perimeter.
 * Uses stroke-dashoffset transition for a precise "line tracing" effect.
 */
export function BorderTrace({
  active,
  duration = 800,
  color = 'var(--accent)',
  strokeWidth = 2,
  onComplete,
}: {
  active: boolean;
  duration?: number;
  color?: string;
  strokeWidth?: number;
  onComplete?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0, r: 0 });

  // Measure parent
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;

    const update = () => {
      const rect = parent.getBoundingClientRect();
      const style = getComputedStyle(parent);
      const r = parseFloat(style.borderRadius) || 10;
      setDims({ w: rect.width, h: rect.height, r });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // Animate stroke on active
  useEffect(() => {
    const el = pathRef.current;
    if (!el || !active || dims.w === 0) return;

    const length = el.getTotalLength();
    el.style.transition = 'none';
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length}`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
        el.style.strokeDashoffset = '0';
      });
    });
  }, [active, dims, duration]);

  // Notify completion
  useEffect(() => {
    if (!active || !onComplete) return;
    const timer = setTimeout(onComplete, duration + 50);
    return () => clearTimeout(timer);
  }, [active, duration, onComplete]);

  if (!active || dims.w === 0) {
    return <div ref={containerRef} style={{ display: 'none' }} />;
  }

  const { w, h, r } = dims;
  const inset = strokeWidth / 2;
  const ir = Math.max(r - inset, 0);
  const x1 = inset;
  const y1 = inset;
  const x2 = w - inset;
  const y2 = h - inset;
  const midY = h / 2;

  const path = [
    `M ${x1},${midY}`,
    `L ${x1},${y1 + ir}`,
    `Q ${x1},${y1} ${x1 + ir},${y1}`,
    `L ${x2 - ir},${y1}`,
    `Q ${x2},${y1} ${x2},${y1 + ir}`,
    `L ${x2},${y2 - ir}`,
    `Q ${x2},${y2} ${x2 - ir},${y2}`,
    `L ${x1 + ir},${y2}`,
    `Q ${x1},${y2} ${x1},${y2 - ir}`,
    `L ${x1},${midY}`,
  ].join(' ');

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
      <svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }} fill="none">
        <path
          ref={pathRef}
          d={path}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
