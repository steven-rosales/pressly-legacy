import type {
  ManageResourcesCommand,
  ManageResourcesResult,
  ProductionBootstrapManifest,
} from '@pressly/production-system/operations/resources/manage-resources/types';

export type ManageResourcesFixtureKind =
  | 'converged'
  | 'empty'
  | 'inactive'
  | 'location_only';

export type ManageResourcesFixture = Readonly<{
  kind: ManageResourcesFixtureKind;
  forceWorkEventAppendFailure?: boolean;
  malformedReceipt?: boolean;
}>;

export type ManageResourcesExecutionMode = 'concurrent_row_lock' | 'sequential';

export type ManageResourcesScenario = Readonly<{
  name: string;
  executionMode: ManageResourcesExecutionMode;
  fixture: ManageResourcesFixture;
  commands: readonly ManageResourcesCommand[];
  normalizeOutcomeOrder?: boolean;
}>;

export type CanonicalManageResourcesFailure = Readonly<{
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalManageResourcesOutcome =
  | Readonly<{ kind: 'success'; value: ManageResourcesResult }>
  | Readonly<{ kind: 'failure'; failure: CanonicalManageResourcesFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalManageResourcesFailure }>;

export type ManageResourcesLocationRow = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive: boolean;
  liveRevision: number;
  updatedAt: string;
}>;

export type ManageResourcesStationRow = Readonly<{
  id: string;
  locationId: string;
  kind: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}>;

export type ManageResourcesMachineRow = Readonly<{
  id: string;
  locationId: string;
  stationId: string;
  stationKind: string;
  label: string;
  manufacturerCapacityLbs: number | null;
  effectiveCapacityLbs: number | null;
  capacitySafetyMarginLbs: number | null;
  isActive: boolean;
  updatedAt: string;
}>;

export type ManageResourcesConfigRow = Readonly<{
  id: string;
  locationId: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  algorithmVersion: string;
  version: number;
  stageFitAssertion: unknown;
  assertedBy: string;
  publishedAt: string;
}>;

export type ManageResourcesAuditEvent = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: unknown;
}>;

export type ManageResourcesState = Readonly<{
  location: ManageResourcesLocationRow | null;
  stations: readonly ManageResourcesStationRow[];
  machines: readonly ManageResourcesMachineRow[];
  configs: readonly ManageResourcesConfigRow[];
}>;

export type ManageResourcesObservation = Readonly<{
  outcome: readonly CanonicalManageResourcesOutcome[];
  stateDelta: Readonly<{
    before: ManageResourcesState;
    after: ManageResourcesState;
  }>;
  workEvents: readonly ManageResourcesAuditEvent[];
  idempotencyReceipt: unknown | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly unknown[];
  issuedIds: number;
}>;

export const manageResourcesFixtureIds = Object.freeze({
  actor: '66000000-0000-4000-8000-000000000001',
  business: '66000000-0000-4000-8000-000000000002',
  storedStations: Object.freeze([
    '66000000-0000-4000-8000-000000000003',
    '66000000-0000-4000-8000-000000000004',
  ]),
  storedMachines: Object.freeze([
    '66000000-0000-4000-8000-000000000005',
    '66000000-0000-4000-8000-000000000006',
  ]),
  storedConfig: '66000000-0000-4000-8000-000000000007',
  evidenceEvent: '66000000-0000-4000-8000-000000000008',
  collision: '66000000-0000-4000-8000-000000000009',
  generated: Object.freeze([
    '66000000-0000-4000-8000-000000000021',
    '66000000-0000-4000-8000-000000000022',
    '66000000-0000-4000-8000-000000000023',
    '66000000-0000-4000-8000-000000000024',
    '66000000-0000-4000-8000-000000000025',
    '66000000-0000-4000-8000-000000000026',
    '66000000-0000-4000-8000-000000000027',
    '66000000-0000-4000-8000-000000000028',
    '66000000-0000-4000-8000-000000000029',
    '66000000-0000-4000-8000-000000000030',
    '66000000-0000-4000-8000-000000000031',
    '66000000-0000-4000-8000-000000000032',
  ]),
});

export const manageResourcesLocationId =
  'location-manage-resources-conformance';
export const manageResourcesOtherLocationId = 'location-manage-resources-other';
export const manageResourcesInitialTime = new Date('2026-08-22T12:00:00.000Z');
export const manageResourcesNow = new Date('2026-08-22T15:00:00.000Z');

export const makeManageResourcesManifest = (
  input: Readonly<{
    locationId?: string;
    locationBusinessId?: string;
    locationName?: string;
    locationTimezone?: string;
    locationActive?: boolean;
    washingLocationId?: string;
    washingLabel?: string;
    washingSortOrder?: number;
    washingActive?: boolean;
    includeDryingStation?: boolean;
    washerLocationId?: string;
    washerActive?: boolean;
    washerManufacturerCapacityLbs?: number;
    washerEffectiveCapacityLbs?: number;
    washerSafetyMarginLbs?: number;
    includeDryer?: boolean;
    pulseMinutes?: number;
    algorithmVersion?: 'fixed-pulse-ffd-v1' | 'fixed-pulse-ffd-v2';
  }> = {},
): ProductionBootstrapManifest => {
  const scopedLocationId = input.locationId ?? manageResourcesLocationId;
  return {
    schemaVersion: 1,
    location: {
      id: scopedLocationId,
      businessId:
        input.locationBusinessId ?? manageResourcesFixtureIds.business,
      name: input.locationName ?? 'Manage Resources Conformance Facility',
      timezone: input.locationTimezone ?? 'America/New_York',
      isActive: input.locationActive ?? true,
    },
    stations: [
      {
        locationId: input.washingLocationId ?? scopedLocationId,
        kind: 'washing',
        label: input.washingLabel ?? 'Wash',
        sortOrder: input.washingSortOrder ?? 1,
        isActive: input.washingActive ?? true,
      },
      ...(input.includeDryingStation === false
        ? []
        : [
            {
              locationId: scopedLocationId,
              kind: 'drying' as const,
              label: 'Dry',
              sortOrder: 2,
              isActive: true,
            },
          ]),
    ],
    machines: [
      {
        locationId: input.washerLocationId ?? scopedLocationId,
        stationKind: 'washing',
        label: 'W-01',
        manufacturerCapacityLbs: input.washerManufacturerCapacityLbs ?? 60,
        effectiveCapacityLbs: input.washerEffectiveCapacityLbs ?? 54,
        capacitySafetyMarginLbs: input.washerSafetyMarginLbs ?? 6,
        isActive: input.washerActive ?? true,
      },
      ...(input.includeDryer === false
        ? []
        : [
            {
              locationId: scopedLocationId,
              stationKind: 'drying' as const,
              label: 'D-01',
              manufacturerCapacityLbs: 30,
              effectiveCapacityLbs: 30,
              capacitySafetyMarginLbs: 0,
              isActive: true,
            },
          ]),
    ],
    schedulerConfig: {
      locationId: scopedLocationId,
      pulseMinutes: input.pulseMinutes ?? 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: input.algorithmVersion ?? 'fixed-pulse-ffd-v1',
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
    },
  };
};

const command = (
  idempotencyKey: string,
  input: Readonly<{
    dryRun?: boolean;
    manifest?: ProductionBootstrapManifest;
  }> = {},
): ManageResourcesCommand => ({
  manifest: input.manifest ?? makeManageResourcesManifest(),
  dryRun: input.dryRun ?? false,
  idempotencyKey,
  actorId: manageResourcesFixtureIds.actor,
});

const base = makeManageResourcesManifest();
const reordered: ProductionBootstrapManifest = {
  ...base,
  stations: [...base.stations].reverse(),
  machines: [...base.machines].reverse(),
};
const changed = makeManageResourcesManifest({
  locationName: 'Updated Facility',
  locationTimezone: 'America/Chicago',
  washingLabel: 'Wash Updated',
  washingSortOrder: 9,
  washerManufacturerCapacityLbs: 65,
  washerEffectiveCapacityLbs: 58,
  washerSafetyMarginLbs: 7,
  pulseMinutes: 42,
  algorithmVersion: 'fixed-pulse-ffd-v2',
});
const divergent = makeManageResourcesManifest({ pulseMinutes: 42 });
const rejectionManifest = makeManageResourcesManifest({
  locationActive: false,
  washingLocationId: manageResourcesOtherLocationId,
  includeDryingStation: false,
  washerActive: false,
  includeDryer: false,
});
const missingMachineStation: ProductionBootstrapManifest = {
  ...base,
  stations: base.stations.filter((station) => station.kind !== 'washing'),
};

export const manageResourcesScenarios: readonly ManageResourcesScenario[] =
  Object.freeze([
    {
      name: 'preview reports exact creation without writes',
      executionMode: 'sequential',
      fixture: { kind: 'empty' },
      commands: [command('manage-resources-preview', { dryRun: true })],
    },
    {
      name: 'weak array-order hash identity preserves result operation order',
      executionMode: 'sequential',
      fixture: { kind: 'empty' },
      commands: [
        command('manage-resources-order-a', { dryRun: true, manifest: base }),
        command('manage-resources-order-b', {
          dryRun: true,
          manifest: reordered,
        }),
      ],
    },
    {
      name: 'apply commits exact resources IDs event and receipt',
      executionMode: 'sequential',
      fixture: { kind: 'empty' },
      commands: [command('manage-resources-apply')],
    },
    {
      name: 'machine without manifest station is rejected before transaction',
      executionMode: 'sequential',
      fixture: { kind: 'empty' },
      commands: [
        command('manage-resources-missing-station', {
          manifest: missingMachineStation,
        }),
      ],
    },
    {
      name: 'destructive and natural-key rejections retain exact order',
      executionMode: 'sequential',
      fixture: { kind: 'converged' },
      commands: [
        command('manage-resources-rejections', {
          manifest: rejectionManifest,
        }),
      ],
    },
    {
      name: 'updates and reactivation affect every mutable resource family',
      executionMode: 'sequential',
      fixture: { kind: 'inactive' },
      commands: [command('manage-resources-update', { manifest: changed })],
    },
    {
      name: 'fresh-key all-noop apply still writes and emits',
      executionMode: 'sequential',
      fixture: { kind: 'converged' },
      commands: [command('manage-resources-noop')],
    },
    {
      name: 'replay divergence and dry-run key bypass preserve one receipt',
      executionMode: 'sequential',
      fixture: { kind: 'empty' },
      commands: [
        command('manage-resources-replay'),
        command('manage-resources-replay'),
        command('manage-resources-replay', { manifest: divergent }),
        command('manage-resources-replay', {
          dryRun: true,
          manifest: divergent,
        }),
      ],
    },
    {
      name: 'malformed receipt fails closed as an idempotency conflict',
      executionMode: 'sequential',
      fixture: { kind: 'converged', malformedReceipt: true },
      commands: [command('manage-resources-malformed-receipt')],
    },
    {
      name: 'same-key race collapses to one commit and one replay',
      executionMode: 'concurrent_row_lock',
      fixture: { kind: 'converged' },
      commands: [
        command('manage-resources-race'),
        command('manage-resources-race'),
      ],
      normalizeOutcomeOrder: true,
    },
    {
      name: 'location business ID false convergence remains observable',
      executionMode: 'sequential',
      fixture: { kind: 'converged' },
      commands: [
        command('manage-resources-business-id', {
          manifest: makeManageResourcesManifest({
            locationBusinessId: '66000000-0000-4000-8000-000000000099',
          }),
        }),
      ],
    },
    {
      name: 'late event collision rolls all SQL back after issuing IDs',
      executionMode: 'sequential',
      fixture: { kind: 'location_only', forceWorkEventAppendFailure: true },
      commands: [command('manage-resources-rollback')],
    },
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
  fallback: string,
): string => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : fallback;
};

const canonicalFailure = (value: unknown): CanonicalManageResourcesFailure => {
  const fields = record(value);
  return {
    kind: stringField(fields, 'kind', 'unknown'),
    code: stringField(fields, 'code', 'unknown_error'),
    message:
      value instanceof Error
        ? value.message
        : stringField(fields, 'message', 'Unknown error.'),
    safeMessage:
      typeof fields?.['safeMessage'] === 'string'
        ? fields['safeMessage']
        : null,
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  };
};

export const captureManageResourcesOutcome = async (
  execute: (command: ManageResourcesCommand) => Promise<unknown>,
  command: ManageResourcesCommand,
): Promise<CanonicalManageResourcesOutcome> => {
  try {
    const raw = await execute(command);
    const wrapper = record(raw);
    if (wrapper?.['tag'] === 'err')
      return { kind: 'failure', failure: canonicalFailure(wrapper['error']) };
    if (wrapper?.['kind'] === 'failure')
      return {
        kind: 'failure',
        failure: canonicalFailure(wrapper['failure']),
      };
    const value =
      wrapper?.['tag'] === 'ok' || wrapper?.['kind'] === 'success'
        ? wrapper['value']
        : raw;
    const result = record(value);
    return result !== null &&
      (result['status'] === 'converged' || result['status'] === 'rejected') &&
      typeof result['replayed'] === 'boolean'
      ? { kind: 'success', value: value as ManageResourcesResult }
      : {
          kind: 'unexpected',
          error: {
            kind: 'invalid_result',
            code: 'invalid_manage_resources_result',
            message: 'The manage-resources result is invalid.',
            safeMessage: null,
            status: null,
          },
        };
  } catch (error) {
    return { kind: 'unexpected', error: canonicalFailure(error) };
  }
};

const sortOutcomes = (
  outcomes: readonly CanonicalManageResourcesOutcome[],
): readonly CanonicalManageResourcesOutcome[] =>
  [...outcomes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

export const runManageResourcesScenario = async (input: {
  execute: (command: ManageResourcesCommand) => Promise<unknown>;
  executeConcurrent?: (
    commands: readonly ManageResourcesCommand[],
  ) => Promise<readonly CanonicalManageResourcesOutcome[]>;
  scenario: ManageResourcesScenario;
}): Promise<readonly CanonicalManageResourcesOutcome[]> => {
  const outcomes =
    input.scenario.executionMode === 'sequential'
      ? await input.scenario.commands.reduce<
          Promise<CanonicalManageResourcesOutcome[]>
        >(
          async (pending, next) => [
            ...(await pending),
            await captureManageResourcesOutcome(input.execute, next),
          ],
          Promise.resolve([]),
        )
      : ((await input.executeConcurrent?.(input.scenario.commands)) ?? []);
  return input.scenario.normalizeOutcomeOrder === true
    ? sortOutcomes(outcomes)
    : outcomes;
};
