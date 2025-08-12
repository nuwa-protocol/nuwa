import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineItemProps {
  dot?: ReactNode;
  children: ReactNode;
  className?: string;
}

export interface TimelineProps {
  items?: TimelineItemProps[];
  children?: ReactNode;
  className?: string;
}

export const TimelineItem = React.forwardRef<HTMLDivElement, TimelineItemProps>(
  ({ dot, children, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('relative pl-8 pb-8 last:pb-0', className)} {...props}>
        <div className="absolute left-0 top-1.5 flex items-center justify-center">
          {dot || <div className="h-3 w-3 rounded-full bg-primary" />}
        </div>
        <div className="absolute left-1.5 top-6 bottom-0 w-[1px] bg-border last:hidden"></div>
        <div>{children}</div>
      </div>
    );
  }
);

TimelineItem.displayName = 'TimelineItem';

export const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(
  ({ items, children, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('', className)} {...props}>
        {items
          ? items.map((item, index) => (
              <TimelineItem key={index} dot={item.dot} className={item.className}>
                {item.children}
              </TimelineItem>
            ))
          : children}
      </div>
    );
  }
);

Timeline.displayName = 'Timeline';
