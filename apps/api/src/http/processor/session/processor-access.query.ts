import { productionCapabilitiesForLocation } from '@pressly/access-control';
import { and, asc, business, eq, type Database } from '@pressly/db';
import type {
  PresslyApplication,
  ProcessorCapability,
} from '@pressly/contracts';
import type {
  LoadedProcessorSession,
  ProcessorAccess,
  ResolveProcessorAccess,
} from './processor-session.port.ts';

export type ProcessorLocationAuthority = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
}>;

const applicationManifest = (input: {
  processorOrigin: string;
  controlOrigin: string;
  includeControl: boolean;
}): readonly PresslyApplication[] => [
  {
    id: 'processor',
    label: 'Pressly Processor',
    description: 'Run intake, scheduling, and laundry-floor production.',
    href: input.processorOrigin,
  },
  ...(input.includeControl
    ? [
        {
          id: 'control' as const,
          label: 'Pressly Control',
          description:
            'Manage people, customers, orders, and account security.',
          href: input.controlOrigin,
        },
      ]
    : []),
];

const controlBusinessIdsFor = (
  session: LoadedProcessorSession,
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

export const resolveProcessorAccessFromLocations = (input: {
  session: LoadedProcessorSession;
  locations: readonly ProcessorLocationAuthority[];
  processorOrigin: string;
  controlOrigin: string;
  now: Date;
}): ProcessorAccess | null => {
  const accessibleLocations = input.locations.flatMap((location) => {
    const capabilities = productionCapabilitiesForLocation({
      principal: input.session.principal,
      principalAttributes: input.session.principalAttributes,
      locationId: location.id,
      businessId: location.businessId,
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
  if (accessibleLocations.length === 0) return null;

  // The switch is shown only when the current effective session would enter
  // one unambiguous Control business. Control independently re-evaluates the
  // same grants when its own host-scoped session is established.
  const controlBusinessIds = controlBusinessIdsFor(
    input.session,
    input.locations,
  );

  return {
    locations: accessibleLocations,
    applications: applicationManifest({
      processorOrigin: input.processorOrigin,
      controlOrigin: input.controlOrigin,
      includeControl: controlBusinessIds.length === 1,
    }),
  };
};

export const makeProcessorAccessResolver = (input: {
  db: Database;
  processorOrigin: string;
  controlOrigin: string;
  clock?: Readonly<{ now: () => Date }>;
}): ResolveProcessorAccess => {
  const clock = input.clock ?? { now: () => new Date() };

  return async (session) => {
    const now = clock.now();
    const locations = await input.db
      .select({
        id: business.productionLocations.id,
        businessId: business.productionLocations.businessId,
        name: business.productionLocations.name,
        timezone: business.productionLocations.timezone,
      })
      .from(business.productionLocations)
      .innerJoin(
        business.businessAccounts,
        eq(
          business.businessAccounts.id,
          business.productionLocations.businessId,
        ),
      )
      .where(
        and(
          eq(business.productionLocations.isActive, true),
          eq(business.businessAccounts.status, 'active'),
        ),
      )
      .orderBy(
        asc(business.productionLocations.businessId),
        asc(business.productionLocations.name),
      );

    return resolveProcessorAccessFromLocations({
      session,
      locations,
      processorOrigin: input.processorOrigin,
      controlOrigin: input.controlOrigin,
      now,
    });
  };
};
