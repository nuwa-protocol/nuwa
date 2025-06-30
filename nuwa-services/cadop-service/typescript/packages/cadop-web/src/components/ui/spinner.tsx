import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'small' | 'default' | 'large';
  className?: string;
}

export function Spinner({ size = 'default', className }: SpinnerProps) {
  const sizeClass = {
    small: 'h-4 w-4',
    default: 'h-6 w-6',
    large: 'h-10 w-10',
  };

  return (
    <Loader2 
      className={cn(
        'animate-spin text-primary',
        sizeClass[size],
        className
      )}
    />
  );
}

export function SpinnerContainer({ 
  children, 
  loading, 
  size = 'default',
  className 
}: { 
  children?: React.ReactNode;
  loading: boolean;
  size?: 'small' | 'default' | 'large';
  className?: string;
}) {
  if (!loading) return <>{children}</>;
  
  return (
    <div className={cn('flex justify-center items-center py-4', className)}>
      <Spinner size={size} />
    </div>
  );
} 