import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

type BadgeColor = 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'accent';
type BadgeSize = 'md' | 'sm';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  size?: BadgeSize;
}

const colorStyles: Record<BadgeColor, string> = {
  green: 'bg-green-l text-green',
  red: 'bg-red-l text-red',
  blue: 'bg-blue-l text-blue',
  yellow: 'bg-yellow-l text-yellow',
  purple: 'bg-purple-l text-purple',
  accent: 'bg-accent-l text-accent',
};

const sizeStyles: Record<BadgeSize, string> = {
  md: 'px-2 py-0.5 text-meta',
  sm: 'px-1.5 py-0.5 text-xs',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ color = 'blue', size = 'md', className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full font-medium',
          colorStyles[color],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';
