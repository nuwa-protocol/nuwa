import React, { useState } from 'react';
import { Button } from './button';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function CopyButton({ 
  value, 
  variant = 'outline', 
  size = 'sm', 
  className,
  children 
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed: ', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleCopy}
      disabled={copied}
    >
      {copied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          {children || 'Copied!'}
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          {children || 'Copy'}
        </>
      )}
    </Button>
  );
}