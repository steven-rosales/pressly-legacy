import type { ReactNode } from 'react';

import { cn } from '@/styles/utils';

export interface HiwTimelineStep {
  title: string;
  description: string;
  media?: ReactNode;
}

interface HiwTimelineProps {
  steps: HiwTimelineStep[];
  className?: string;
}

function HiwMediaPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'aspect-square w-full rounded-xl border border-dashed border-border',
        className,
      )}
    />
  );
}

export function HiwTimeline({ steps, className }: HiwTimelineProps) {
  return (
    <ol className={cn('w-full', className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <li
            key={`${index}-${step.title}`}
            className={cn('relative', !isLast && 'pb-10 sm:pb-12')}
          >
            {!isLast ? (
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 border-l border-dashed border-border lg:left-10"
              />
            ) : null}

            <div className="absolute -top-5 left-1/2 z-20 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground lg:left-10">
              <span className="sr-only">Step </span>
              <span aria-hidden="true">{index + 1}</span>
            </div>

            <div className="relative z-10 rounded-2xl border border-border bg-background px-6 pb-6 pt-10 sm:px-8 sm:pb-8 sm:pt-12">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-6 sm:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
                <div className="flex items-center justify-center">
                  {step.media ?? (
                    <HiwMediaPlaceholder className="max-w-[200px]" />
                  )}
                </div>

                <h3 className="text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl lg:text-2xl">
                  {step.title}
                </h3>

                <p className="col-span-2 text-sm leading-relaxed text-muted-foreground lg:col-span-1 lg:text-base">
                  {step.description}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
