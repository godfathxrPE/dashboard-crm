import {
  forwardRef,
  type HTMLAttributes,
  type ThHTMLAttributes,
  type TdHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils/cn';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <table
        ref={ref}
        className={cn('w-full text-body', className)}
        {...props}
      >
        {children}
      </table>
    );
  },
);

Table.displayName = 'Table';

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <thead
        ref={ref}
        className={cn('bg-surface sticky top-0 z-[1]', className)}
        {...props}
      >
        {children}
      </thead>
    );
  },
);

TableHeader.displayName = 'TableHeader';

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <th
        ref={ref}
        className={cn(
          'text-left uppercase tracking-wider text-xs font-semibold text-text-mute px-3 py-2',
          className,
        )}
        {...props}
      >
        {children}
      </th>
    );
  },
);

TableHead.displayName = 'TableHead';

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        className={cn('divide-y divide-border', className)}
        {...props}
      >
        {children}
      </tbody>
    );
  },
);

TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        className={cn(
          'transition-all duration-fast ease-out-custom',
          'border-l-2 border-l-transparent hover:bg-accent-l hover:border-l-accent',
          '[&:nth-child(even)]:bg-surface2',
          className,
        )}
        {...props}
      >
        {children}
      </tr>
    );
  },
);

TableRow.displayName = 'TableRow';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={cn('px-3 py-2.5 text-text-main', className)}
        {...props}
      >
        {children}
      </td>
    );
  },
);

TableCell.displayName = 'TableCell';
