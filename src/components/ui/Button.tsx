import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-90',
  secondary: 'bg-surface text-text-main border border-input hover:bg-surface2',
  ghost: 'bg-transparent text-accent hover:bg-accent-l',
};

const sizeStyles: Record<ButtonSize, string> = {
  md: 'h-9 px-3.5 py-1.5 text-body',
  sm: 'h-7 px-2.5 py-1 text-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5',
          'rounded font-medium',
          'transition-all duration-fast ease-out-custom',
          'disabled:opacity-50 disabled:pointer-events-none',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
