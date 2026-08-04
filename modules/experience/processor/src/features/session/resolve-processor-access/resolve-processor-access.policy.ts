import type {
  ProcessorAccess,
  ProcessorApplication,
  ProcessorApplicationOrigins,
  ProcessorCapability,
  ProcessorLocationAuthority,
  ProcessorSession,
} from '../../../foundations/language/processor-access/processor-access.model.ts';
import type { ResolveProductionCapabilities } from '../../../foundations/ports/production-capabilities/production-capabilities.port.ts';

const applicationsFor = (input: {
  origins: ProcessorApplicationOrigins;
  includeControl: boolean;
}): readonly ProcessorApplication[] => [
  {
    id: 'processor',
    label: 'Pressly Processor',
    description: 'Run intake, scheduling, and laundry-floor production.',
    href: input.origins.processor,
  },
  ...(input.includeControl
    ? [
        {
          id: 'control' as const,
          label: 'Pressly Control',
          description:
            'Manage people, customers, orders, and account security.',
          href: input.origins.control,
        },
      ]
    : []),
];

const controlBusinessIdsFor = (
  session: ProcessorSession,
  locations: readonly ProcessorLocationAuthority[],
): readonly string[] => [
  ...new Set(
    session.principalAttributes.assignments.flatMap((assignment) => {
      if (assignment.role !== 'owner' && assignment.role !== 'manager')
        return [];
      if (assignment.scope.kind === 'business') return [assignment.scope.id];
      if (assignment.scope.kind !== 'location') return [];
      const location = locations.find(
        (candidate) => candidate.id === assignment.scope.id,
      );
      return location === undefined ? [] : [location.businessId];
    }),
  ),
];

export const resolveProcessorAccess = (input: {
  session: ProcessorSession;
  locations: readonly ProcessorLocationAuthority[];
  origins: ProcessorApplicationOrigins;
  now: Date;
  resolveCapabilities: ResolveProductionCapabilities;
}): ProcessorAccess | null => {
  const locations = input.locations.flatMap((location) => {
    const capabilities = input.resolveCapabilities({
      session: input.session,
      location,
      now: input.now,
    });
    if (!capabilities.includes('production:read')) return [];

    return [
      {
        id: location.id,
        name: location.name,
        timezone: location.timezone,
        capabilities: [
          'processor:view' as const,
          ...capabilities,
        ] satisfies readonly ProcessorCapability[],
      },
    ];
  });
  if (locations.length === 0) return null;

  const controlBusinessIds = controlBusinessIdsFor(
    input.session,
    input.locations,
  );
  return {
    locations,
    applications: applicationsFor({
      origins: input.origins,
      includeControl: controlBusinessIds.length === 1,
    }),
  };
};
