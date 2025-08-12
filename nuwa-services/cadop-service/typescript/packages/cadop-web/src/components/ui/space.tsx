import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SpaceProps {
  children: ReactNode;
  className?: string;
  direction?: 'horizontal' | 'vertical';
  size?: 'small' | 'middle' | 'large' | number;
  align?: 'start' | 'end' | 'center' | 'baseline';
  wrap?: boolean;
  style?: React.CSSProperties;
}

export const Space: React.FC<SpaceProps> = ({
  children,
  className,
  direction = 'horizontal',
  size = 'small',
  align,
  wrap = false,
  style,
  ...props
}) => {
  // Convert size to pixel value
  const getSize = () => {
    if (typeof size === 'number') {
      return size;
    }
    switch (size) {
      case 'small':
        return 8;
      case 'middle':
        return 16;
      case 'large':
        return 24;
      default:
        return 8;
    }
  };

  const sizeValue = getSize();

  const childrenArray = React.Children.toArray(children).filter(
    child => child !== null && child !== undefined
  );

  // Apply styles based on direction
  const spaceStyle: React.CSSProperties = {
    ...style,
    gap: `${sizeValue}px`,
  };

  return (
    <div
      className={cn(
        'flex',
        direction === 'vertical' ? 'flex-col' : 'flex-row',
        wrap && 'flex-wrap',
        align === 'start' && 'items-start',
        align === 'end' && 'items-end',
        align === 'center' && 'items-center',
        align === 'baseline' && 'items-baseline',
        className
      )}
      style={spaceStyle}
      {...props}
    >
      {childrenArray}
    </div>
  );
};

export default Space;
