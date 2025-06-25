import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './Dialog';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface ModalProps {
  title?: React.ReactNode;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
  className?: string;
}

export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  width = 'lg', // lg = max-w-lg (32rem), can be overridden
  className,
}: ModalProps) {
  // Convert width to class or style
  const widthClass = typeof width === 'string' ? 
    (width === 'sm' ? 'max-w-sm' : 
     width === 'md' ? 'max-w-md' : 
     width === 'lg' ? 'max-w-lg' : 
     width === 'xl' ? 'max-w-xl' : 
     width === '2xl' ? 'max-w-2xl' : 
     width === '3xl' ? 'max-w-3xl' : 
     width === '4xl' ? 'max-w-4xl' : 
     width === '5xl' ? 'max-w-5xl' : 
     width === '6xl' ? 'max-w-6xl' : 
     width === '7xl' ? 'max-w-7xl' : 'max-w-lg') : '';

  const widthStyle = typeof width === 'number' ? { maxWidth: `${width}px` } : {};

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className={cn(widthClass, className)}
        style={widthStyle}
      >
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        
        <div className="py-2">{children}</div>
        
        {footer && (
          <DialogFooter>{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
} 