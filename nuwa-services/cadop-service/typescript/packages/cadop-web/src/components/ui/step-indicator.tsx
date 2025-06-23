import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  completedSteps: number[];
  className?: string;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  steps,
  currentStep,
  completedSteps,
  className,
}) => {
  return (
    <div className={cn('flex items-center w-full', className)}>
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(index);
        const isCurrent = currentStep === index;
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={index}>
            <div className="flex items-center">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all',
                  isCompleted && 'bg-primary border-primary text-primary-foreground',
                  isCurrent && 'border-primary text-primary',
                  !isCompleted && !isCurrent && 'border-gray-300 text-gray-500'
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-sm">{index + 1}</span>
                )}
              </div>
              <div
                className={cn(
                  'hidden sm:block ml-3 text-sm font-medium',
                  isCompleted && 'text-primary',
                  isCurrent && 'text-primary',
                  !isCompleted && !isCurrent && 'text-gray-500'
                )}
              >
                {step}
              </div>
            </div>
            {!isLast && (
              <div
                className={cn('flex-1 h-0.5 mx-4', isCompleted ? 'bg-primary' : 'bg-gray-300')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
