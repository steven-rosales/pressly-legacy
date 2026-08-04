import type { WorkspaceApplicationDestination } from '@/components/ui';

type ApplicationDestinationCopy = Readonly<
  Record<
    'processor' | 'control',
    Pick<WorkspaceApplicationDestination, 'label' | 'description'>
  >
>;

export function localizeApplicationDestination(
  application: WorkspaceApplicationDestination,
  copy: ApplicationDestinationCopy,
): WorkspaceApplicationDestination {
  if (application.id !== 'processor' && application.id !== 'control')
    return application;

  return { ...application, ...copy[application.id] };
}
