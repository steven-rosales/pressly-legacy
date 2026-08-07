import type { ControlApplication } from '../../../foundations/language/control-access/control-access.model.ts';

export const controlApplicationManifest = (input: {
  controlOrigin: string;
  processorOrigin: string;
  includeProcessor: boolean;
}): readonly ControlApplication[] => [
  {
    id: 'control',
    label: 'Pressly Control',
    description: 'Manage people, customers, orders, and account security.',
    href: input.controlOrigin,
  },
  ...(input.includeProcessor
    ? [
        {
          id: 'processor' as const,
          label: 'Pressly Processor',
          description: 'Run intake, scheduling, and laundry-floor production.',
          href: input.processorOrigin,
        },
      ]
    : []),
];
