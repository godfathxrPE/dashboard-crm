import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

type CardVariant = 'flat' | 'elevated';
type CardPadding = 'default' | 'none';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantStyles: Record<CardVariant, string> = {
  flat: 'bg-surface border border-border rounded-lg',
  elevated:
    'bg-surface border border-border rounded-lg shadow-card hover:shadow-card-hover transition-shadow duration-fast ease-out-custom',
};

const paddingStyles: Record<CardPadding, string> = {
  default: 'p-4',
  none: '',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'flat', padding = 'default', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(variantStyles[variant], paddingStyles[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn('text-text-main font-semibold text-sm', className)}
        {...props}
      >
        {children}
      </h3>
    );
  },
);

CardTitle.displayName = 'CardTitle';

export const CardBody = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn('text-text-dim text-[0.8125rem]', className)}
        {...props}
      >
        {children}
      </p>
    );
  },
);

CardBody.displayName = 'CardBody';
