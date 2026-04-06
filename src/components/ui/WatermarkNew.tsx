'use client';
import { useWatermark } from '@/hooks/useWatermark';

interface WatermarkProps {
  text: string;
  size?: 'page' | 'section';
  delay?: number;
  className?: string;
}

export function Watermark({ text, size = 'page', delay = 0, className = '' }: WatermarkProps) {
  const ref = useWatermark(delay);

  return (
    <div
      ref={ref}
      className={`${size === 'page' ? 'watermark-page' : 'watermark-section'} ${className}`}
    >
      {text}
    </div>
  );
}
