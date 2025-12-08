import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const tagVariants = cva(
  'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-gray-50 text-gray-600 ring-gray-500/10',
        primary: 'bg-blue-50 text-blue-700 ring-blue-700/10',
        secondary: 'bg-purple-50 text-purple-700 ring-purple-700/10',
        success: 'bg-green-50 text-green-700 ring-green-700/10',
        warning: 'bg-yellow-50 text-yellow-700 ring-yellow-700/10',
        danger: 'bg-red-50 text-red-700 ring-red-700/10',
        info: 'bg-sky-50 text-sky-700 ring-sky-700/10',
      },
      color: {
        default: '',
        blue: 'bg-blue-50 text-blue-700 ring-blue-700/10',
        green: 'bg-green-50 text-green-700 ring-green-700/10',
        red: 'bg-red-50 text-red-700 ring-red-700/10',
        yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-700/10',
        purple: 'bg-purple-50 text-purple-700 ring-purple-700/10',
        orange: 'bg-orange-50 text-orange-700 ring-orange-700/10',
        cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-700/10',
        pink: 'bg-pink-50 text-pink-700 ring-pink-700/10',
        gray: 'bg-gray-50 text-gray-600 ring-gray-500/10',
        error: 'bg-red-50 text-red-700 ring-red-700/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {
  children: React.ReactNode;
  icon?: React.ReactNode;
  closable?: boolean;
  onClose?: () => void;
}

export function Tag({
  className,
  variant,
  color,
  children,
  icon,
  closable,
  onClose,
  ...props
}: TagProps) {
  return (
    <span
      className={cn(tagVariants({ variant, color }), 'flex items-center gap-1', className)}
      {...props}
    >
      {icon && <span className="h-3 w-3">{icon}</span>}
      {children}
      {closable && (
        <button
          type="button"
          className="ml-1 -mr-1 h-3.5 w-3.5 rounded-full hover:bg-gray-400/20 flex items-center justify-center"
          onClick={e => {
            e.stopPropagation();
            onClose?.();
          }}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="sr-only">Remove</span>
        </button>
      )}
    </span>
  );
}
