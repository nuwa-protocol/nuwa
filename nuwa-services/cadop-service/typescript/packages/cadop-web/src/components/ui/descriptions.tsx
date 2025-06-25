import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DescriptionsItemProps {
  label: ReactNode;
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
  contentClassName?: string;
  span?: number;
}

export interface DescriptionsProps {
  title?: ReactNode;
  bordered?: boolean;
  column?: number;
  size?: 'default' | 'small' | 'large';
  layout?: 'horizontal' | 'vertical';
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// This is a configuration-only component that doesn't render anything
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const DescriptionsItem: React.FC<DescriptionsItemProps> = () => null;

export const Descriptions: React.FC<DescriptionsProps> = ({
  title,
  bordered = false,
  column = 3,
  size = 'default',
  layout = 'horizontal',
  children,
  className,
  style,
  ...props
}) => {
  // Extract items from children
  const items: DescriptionsItemProps[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === DescriptionsItem) {
      items.push(child.props as DescriptionsItemProps);
    }
  });

  // Size classes
  const sizeClasses = {
    small: 'text-sm',
    default: 'text-base',
    large: 'text-lg',
  };

  // Grid columns based on the column prop
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[column] || 'grid-cols-3';

  return (
    <div className={cn('w-full', className)} style={style} {...props}>
      {title && (
        <div className="font-medium text-lg mb-4">{title}</div>
      )}
      <div 
        className={cn(
          bordered ? 'border border-border rounded-md overflow-hidden' : '',
          sizeClasses[size]
        )}
      >
        {layout === 'horizontal' ? (
          <div className={cn('grid', gridColsClass, bordered ? 'divide-x divide-y divide-border' : '')}>
            {items.map((item, index) => (
              <div 
                key={index} 
                className={cn(
                  'flex flex-col',
                  item.className,
                  bordered ? 'p-3' : 'py-2'
                )}
                style={{ gridColumn: item.span ? `span ${item.span}` : undefined }}
              >
                <div className={cn('text-muted-foreground font-medium mb-1', item.labelClassName)}>
                  {item.label}
                </div>
                <div className={cn('text-foreground', item.contentClassName)}>
                  {item.children}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn(bordered ? 'divide-y divide-border' : '')}>
            {items.map((item, index) => (
              <div 
                key={index} 
                className={cn(
                  'grid grid-cols-4',
                  item.className,
                  bordered ? 'p-3' : 'py-2'
                )}
              >
                <div className={cn('text-muted-foreground font-medium', item.labelClassName)}>
                  {item.label}
                </div>
                <div className={cn('col-span-3 text-foreground', item.contentClassName)}>
                  {item.children}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Set display name for DevTools
DescriptionsItem.displayName = 'DescriptionsItem';
Descriptions.displayName = 'Descriptions'; 