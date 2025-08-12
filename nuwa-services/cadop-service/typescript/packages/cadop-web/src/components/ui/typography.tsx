import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TypographyProps {
  children: ReactNode;
  className?: string;
}

export interface TitleProps extends TypographyProps {
  level?: 1 | 2 | 3 | 4 | 5;
}

export interface TextProps extends TypographyProps {
  type?: 'default' | 'secondary' | 'success' | 'warning' | 'danger';
  strong?: boolean;
  code?: boolean;
  copyable?: boolean;
}

export interface ParagraphProps extends TextProps {
  ellipsis?: boolean | { rows: number };
}

export const Title: React.FC<TitleProps> = ({ level = 1, children, className, ...props }) => {
  const sizeClasses = {
    1: 'text-4xl font-extrabold tracking-tight',
    2: 'text-3xl font-semibold tracking-tight',
    3: 'text-2xl font-semibold tracking-tight',
    4: 'text-xl font-semibold tracking-tight',
    5: 'text-lg font-medium',
  };

  switch (level) {
    case 1:
      return (
        <h1 className={cn(sizeClasses[1], 'scroll-m-20', className)} {...props}>
          {children}
        </h1>
      );
    case 2:
      return (
        <h2 className={cn(sizeClasses[2], 'scroll-m-20', className)} {...props}>
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 className={cn(sizeClasses[3], 'scroll-m-20', className)} {...props}>
          {children}
        </h3>
      );
    case 4:
      return (
        <h4 className={cn(sizeClasses[4], 'scroll-m-20', className)} {...props}>
          {children}
        </h4>
      );
    case 5:
      return (
        <h5 className={cn(sizeClasses[5], 'scroll-m-20', className)} {...props}>
          {children}
        </h5>
      );
    default:
      return (
        <h1 className={cn(sizeClasses[1], 'scroll-m-20', className)} {...props}>
          {children}
        </h1>
      );
  }
};

export const Text: React.FC<TextProps> = ({
  type = 'default',
  strong,
  code,
  copyable,
  children,
  className,
  ...props
}) => {
  const typeClasses = {
    default: 'text-foreground',
    secondary: 'text-muted-foreground',
    success: 'text-green-600 dark:text-green-500',
    warning: 'text-amber-600 dark:text-amber-500',
    danger: 'text-destructive',
  };

  const handleCopy = () => {
    if (typeof children === 'string') {
      navigator.clipboard.writeText(children);
    }
  };

  return (
    <span className={cn(typeClasses[type], strong && 'font-semibold', className)} {...props}>
      {code ? (
        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
          {children}
        </code>
      ) : (
        children
      )}
      {copyable && (
        <button
          onClick={handleCopy}
          className="ml-1.5 inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Copy"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <rect width="14" height="14" x="8" y="2" rx="2" ry="2" />
            <path d="M4 18V6a2 2 0 0 1 2-2h8" />
          </svg>
        </button>
      )}
    </span>
  );
};

export const Paragraph: React.FC<ParagraphProps> = ({
  ellipsis,
  children,
  className,
  ...props
}) => {
  const ellipsisClasses =
    typeof ellipsis === 'object'
      ? `line-clamp-${ellipsis.rows}`
      : ellipsis
        ? 'text-ellipsis overflow-hidden whitespace-nowrap'
        : '';

  return (
    <p className={cn('leading-7', ellipsisClasses, className)} {...props}>
      <Text {...props}>{children}</Text>
    </p>
  );
};

export const Typography = {
  Title,
  Text,
  Paragraph,
};
