import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

type InputSize = 'md' | 'sm';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize;
  error?: boolean;
}

const sizeStyles: Record<InputSize, string> = {
  md: 'h-9 px-3 py-2 text-[0.8125rem]',
  sm: 'h-[30px] px-2 py-1.5 text-xs',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', error = false, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-surface border rounded-md text-text-main placeholder:text-text-mute',
          'transition-all duration-fast ease-out-custom',
          error
            ? 'border-red ring-2 ring-red-l'
            : 'border-border focus:border-accent focus:ring-2 focus:ring-accent-l focus:outline-none',
          'disabled:bg-surface2 disabled:opacity-60 disabled:cursor-not-allowed',
          sizeStyles[inputSize],
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
