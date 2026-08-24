import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decode,
  bindCell,
  declareCommandCell,
  declareProcessCell,
  declareQueryCell,
  declareReactionCell,
  declareSubscriptionCell,
  defineBoundaryContract,
  defineCellContract,
  defineHttpBoundaryProfile,
  defineMessageContract,
  defineProcessCell,
  defineSubscriptionContract,
  defineHttpCatalog,
  eventStream,
  http,
  job,
  type CellOutcome,
  type HttpResponse,
  type HttpSurfaceManifest,
} from '@pressly/cells';
import { architectureMap } from '../../generated/architecture-map.ts';
import {
  processorClient,
  processorListProductionHistoryActivityV1,
  processorListProductionOrderControlV1,
  processorLoadProductionBoardV1,
  processorLoadProductionHistoryRunV1,
  processorLoadProductionWorkspaceV1,
  processorLoadRemainingDayForecastV1,
  processorPreviewProductionOrderBacklogV1,
  productionAcceptScheduleV1,
  productionAdvanceStageV1,
  productionAssignStageMachinesV1,
  productionChangeAdmissionV1,
  productionChangeOrderResolutionV1,
  productionCommitOrderBacklogV1,
  productionCommitOrderRouteV1,
  productionConfirmOrderOvertimeV1,
  productionCreateScheduleV1,
  productionCreateShiftV1,
  productionFreezeBatchMembershipV1,
  productionListHistoryPlansV1,
  productionListHistoryRunsV1,
  productionListLocationsV1,
  productionListOrdersV1,
  productionLoadScheduleV1,
  productionPlaceOrderAutomaticallyV1,
  productionPlaceOrderExactlyV1,
  productionPreviewOrderRouteV1,
  productionPublishSchedulerConfigV1,
  productionReconcileBatchProgressV1,
  productionRecordOrderIntakeV1,
  productionReplaceShiftSelectionV1,
  productionSetOrderPriorityV1,
  productionStartScheduleV1,
  productionSubscribeChangesV1,
  productionUnfreezeBatchMembershipV1,
  productionUpdateShiftV1,
} from '../../generated/clients/processor.ts';
import { makeEventStreamCatalogFromOwners } from '../../generated/event-stream-catalog.ts';
import { makeJobCatalogFromOwners } from '../../generated/job-catalog.ts';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import {
  compareGeneratedArtifacts,
  bindHttpBoundaryProfile,
  compileTopology,
  defineExperience,
  defineSystem,
  defineTopology,
  explainOperation,
  formatArchitectureExplanation,
  resolveStaticArtifacts,
  selectCell,
  type CompiledTopology,
  type TopologyDefinition,
} from '../../topology/src/public.ts';
import {
  checkGeneratedArtifacts,
  presslyRepositoryRoot,
  resolvePresslyArtifacts,
  writeGeneratedArtifacts,
} from '../../topology/tooling/filesystem-artifacts.ts';
import { resolveRepositoryOperationEvidence } from '../../topology/tooling/repository-operation-evidence.ts';

type ExampleCommand = Readonly<{ itemId: string }>;
type ExampleResult = Readonly<{ reserved: boolean }>;
type ExampleFailure = Readonly<{ code: 'not_available' }>;

const commandBoundary = defineBoundaryContract<ExampleCommand>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'itemId' in serialized &&
    typeof serialized.itemId === 'string'
      ? decode.valid({ itemId: serialized.itemId })
      : decode.invalid([{ path: [], message: 'Expected itemId.' }]),
  encode: (value) => value,
});

const resultBoundary = defineBoundaryContract<ExampleResult>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'reserved' in serialized &&
    typeof serialized.reserved === 'boolean'
      ? decode.valid({ reserved: serialized.reserved })
      : decode.invalid([{ path: [], message: 'Expected reserved.' }]),
  encode: (value) => value,
});

const failureBoundary = defineBoundaryContract<ExampleFailure>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'code' in serialized &&
    serialized.code === 'not_available'
      ? decode.valid({ code: 'not_available' })
      : decode.invalid([{ path: [], message: 'Expected failure code.' }]),
  encode: (value) => value,
});

const exampleContract = defineCellContract({
  input: commandBoundary,
  output: resultBoundary,
  failure: failureBoundary,
});

const exampleSubscriptionContract = defineSubscriptionContract({
  input: commandBoundary,
  output: resultBoundary,
  event: resultBoundary,
  failure: failureBoundary,
});

const present = (
  outcome: CellOutcome<ExampleResult, ExampleFailure>,
): HttpResponse =>
  outcome.kind === 'success'
    ? Object.freeze({ status: 200, body: outcome.value })
    : Object.freeze({ status: 409, body: outcome.failure });

const itemReserved = defineMessageContract<Readonly<{ itemId: string }>>({
  type: 'inventory.item-reserved',
  version: 1,
  payload: defineBoundaryContract({
    version: 1,
    decode: (serialized) =>
      typeof serialized === 'object' &&
      serialized !== null &&
      'itemId' in serialized &&
      typeof serialized.itemId === 'string'
        ? decode.valid({ itemId: serialized.itemId })
        : decode.invalid([{ path: [], message: 'Expected itemId.' }]),
    encode: (value) => value,
  }),
});

const makeCommandManifest = ({
  id,
  path,
  emits = [],
  contextRequirements = [],
}: Readonly<{
  id: string;
  path: string;
  emits?: readonly (typeof itemReserved)[];
  contextRequirements?: readonly string[];
}>) =>
  declareCommandCell({
    id,
    contract: exampleContract,
    authorization: {
      capability: 'inventory.reserve',
      timing: 'before-input',
    },
    consistency: {
      transaction: 'required',
      concurrency: 'optimistic',
      concurrencyKey: (command) => command.itemId,
      expectedVersion: () => 1,
    },
    idempotency: {
      required: true,
      key: (command) => command.itemId,
    },
    surfaces: [
      http.post<ExampleResult, ExampleFailure>({
        path,
        bodyLimit: 'small-command',
        contextRequirements,
        invalidRequest: {
          authorizationScope: {
            code: 'invalid_params_type',
            message: 'Validation params failed.',
            safeMessage: 'Invalid request input.',
            status: 400,
            location: 'params',
          },
          input: {
            code: 'invalid_body_type',
            message: 'Validation body failed.',
            safeMessage: 'Invalid request input.',
            status: 400,
            location: 'body',
          },
        },
        decodeAuthorizationScope: (head) => {
          const locationId = head.params['locationId'];
          return locationId === undefined
            ? decode.invalid([
                { path: ['params', 'locationId'], message: 'Required.' },
              ])
            : decode.valid(locationId);
        },
        toSerializedInput: (request) => request.body,
        present,
      }),
    ],
    emits,
    observability: { operation: id.replace(/\.v[0-9]+$/, '') },
  });

const reserveItemManifest = makeCommandManifest({
  id: 'inventory.reserve-item.v1',
  path: '/locations/:locationId/items/:itemId/reserve',
  emits: [itemReserved],
});

const reserveItem = bindCell(reserveItemManifest, async () =>
  Object.freeze({ kind: 'success', value: { reserved: true } }),
);

const loadItemManifest = declareQueryCell({
  id: 'inventory.load-item.v1',
  contract: exampleContract,
  surfaces: [
    http.get<ExampleResult, ExampleFailure>({
      path: '/locations/:locationId/items/:itemId',
      toSerializedInput: (request) => request.params,
      present,
    }),
  ],
  observability: { operation: 'inventory.load-item' },
});

const loadItem = bindCell(loadItemManifest, async () =>
  Object.freeze({ kind: 'success', value: { reserved: false } }),
);

const watchItemManifest = declareSubscriptionCell({
  id: 'inventory.watch-item.v1',
  contract: exampleSubscriptionContract,
  authorization: {
    capability: 'inventory.read',
    timing: 'before-input',
  },
  surfaces: [
    eventStream.get<ExampleResult, ExampleResult, ExampleFailure>({
      path: '/locations/:locationId/items/:itemId/events',
      retryMs: 2_500,
      eventTypes: ['ready', 'changed'],
      invalidRequest: {
        authorizationScope: {
          code: 'invalid_params_type',
          message: 'Validation params failed.',
          location: 'params',
        },
        input: {
          code: 'invalid_params_type',
          message: 'Validation params failed.',
          location: 'params',
        },
      },
      decodeAuthorizationScope: (head) => {
        const locationId = head.params['locationId'];
        return locationId === undefined
          ? decode.invalid([
              { path: ['params', 'locationId'], message: 'Required.' },
            ])
          : decode.valid(locationId);
      },
      toSerializedInput: (request) => request.params,
      presentReady: (ready) => ({ event: 'ready', data: ready }),
      presentEvent: (event) => ({ event: 'changed', data: event }),
      presentFailure: (failure) => ({ status: 404, body: failure }),
    }),
  ],
  observability: { operation: 'inventory.watch-item' },
});

const selectWatchItem = (manifest: typeof watchItemManifest) =>
  selectCell({
    manifest,
    source: {
      moduleSpecifier: '@pressly/system-inventory',
      manifestExportName: 'watchItemManifest',
      assemblyExportName: 'makeInventorySystem',
      assemblyKey: 'watchItem',
    },
  });

const subscriptionTopology = (manifest = watchItemManifest) =>
  defineTopology({
    id: 'subscriptions',
    systems: [
      defineSystem({
        id: 'inventory',
        cells: [selectWatchItem(manifest)],
      }),
    ],
    experiences: [
      defineExperience({
        id: 'operator',
        cells: [],
        uses: [manifest.id],
      }),
    ],
  });

const projectReservationManifest = declareReactionCell({
  id: 'reporting.project-reservation.v1',
  contract: exampleContract,
  consumes: [itemReserved],
  retry: {
    maxAttempts: 8,
    strategy: 'bounded-exponential-jitter',
    deadLetter: 'retain',
  },
  surfaces: [
    job.message({
      id: 'reporting.project-reservation-job.v1',
      queue: 'reporting',
      toSerializedInput: (payload) => payload,
      presentFailure: () => ({
        code: 'reporting_projection_failed',
        message: 'The reporting projection failed.',
        retryable: false,
      }),
    }),
  ],
  observability: { operation: 'reporting.project-reservation' },
});

const projectReservation = bindCell(projectReservationManifest, async () =>
  Object.freeze({ kind: 'success', value: { reserved: true } }),
);

const reactionTopology = (manifest: typeof projectReservationManifest) =>
  defineTopology({
    id: 'reaction-audit',
    systems: [
      defineSystem({
        id: 'reporting',
        cells: [
          selectCell({
            manifest,
            source: {
              moduleSpecifier: '@pressly/system-reporting',
              manifestExportName: 'projectReservationManifest',
              assemblyExportName: 'makeReportingSystem',
              assemblyKey: 'projectReservation',
            },
          }),
        ],
      }),
    ],
    experiences: [],
  });

const inventorySystem = defineSystem({
  id: 'inventory',
  cells: [
    selectCell({
      manifest: reserveItemManifest,
      source: {
        moduleSpecifier: '@pressly/system-inventory',
        manifestExportName: 'reserveItemManifest',
        assemblyExportName: 'makeInventorySystem',
        assemblyKey: 'reserveItem',
      },
    }),
    selectCell({
      manifest: loadItemManifest,
      source: {
        moduleSpecifier: '@pressly/system-inventory',
        manifestExportName: 'loadItemManifest',
        assemblyExportName: 'makeInventorySystem',
        assemblyKey: 'loadItem',
      },
    }),
  ],
});

const reportingSystem = defineSystem({
  id: 'reporting',
  cells: [
    selectCell({
      manifest: projectReservationManifest,
      source: {
        moduleSpecifier: '@pressly/system-reporting',
        manifestExportName: 'projectReservationManifest',
        assemblyExportName: 'makeReportingSystem',
        assemblyKey: 'projectReservation',
      },
    }),
  ],
});

const operatorExperience = defineExperience({
  id: 'operator',
  cells: [],
  uses: ['inventory.load-item.v1', 'inventory.reserve-item.v1'],
});

const operatorDashboardManifest = declareQueryCell({
  id: 'operator.load-dashboard.v1',
  contract: exampleContract,
  surfaces: [
    http.get<ExampleResult, ExampleFailure>({
      path: '/operator/dashboard',
      toSerializedInput: (request) => request.query,
      present,
    }),
  ],
  observability: { operation: 'operator.load-dashboard' },
});

const operatorPreferencesManifest = declareQueryCell({
  id: 'operator.load-preferences.v1',
  contract: exampleContract,
  surfaces: [],
  observability: { operation: 'operator.load-preferences' },
});

const experienceOwnedClientTopology = (
  dashboardManifest = operatorDashboardManifest,
  reverseExperienceCells = false,
): TopologyDefinition => {
  const dashboard = selectCell({
    manifest: dashboardManifest,
    source: {
      moduleSpecifier: '@pressly/experience-operator/server',
      manifestExportName: 'operatorDashboardManifest',
      assemblyExportName: 'makeOperatorExperience',
      assemblyKey: 'loadDashboard',
    },
  });
  const preferences = selectCell({
    manifest: operatorPreferencesManifest,
    source: {
      moduleSpecifier: '@pressly/experience-operator/server',
      manifestExportName: 'operatorPreferencesManifest',
      assemblyExportName: 'makeOperatorExperience',
      assemblyKey: 'loadPreferences',
    },
  });

  return defineTopology({
    id: 'experience-client',
    systems: [
      defineSystem({
        id: 'inventory',
        cells: [
          selectCell({
            manifest: loadItemManifest,
            source: {
              moduleSpecifier: '@pressly/system-inventory',
              manifestExportName: 'loadItemManifest',
              assemblyExportName: 'makeInventorySystem',
              assemblyKey: 'loadItem',
            },
          }),
        ],
      }),
    ],
    experiences: [
      defineExperience({
        id: 'operator',
        cells: reverseExperienceCells
          ? [preferences, dashboard]
          : [dashboard, preferences],
        uses: [loadItemManifest.id],
      }),
    ],
  });
};

const validTopology = (reverseSystems = false): TopologyDefinition =>
  defineTopology({
    id: 'example',
    systems: reverseSystems
      ? [reportingSystem, inventorySystem]
      : [inventorySystem, reportingSystem],
    experiences: [operatorExperience],
  });

const boundaryPublicManifest = declareQueryCell({
  id: 'candidate.public.v1',
  contract: exampleContract,
  surfaces: [
    http.get({
      path: '/candidate/public',
      toSerializedInput: (request) => request.query,
      present,
    }),
  ],
  observability: { operation: 'candidate.public' },
});

const boundaryBearerManifest = declareCommandCell({
  id: 'candidate.bearer-session.v1',
  authentication: 'required',
  contract: exampleContract,
  surfaces: [
    http.post({
      path: '/candidate/bearer-session',
      bodyLimit: 'candidate-command',
      toSerializedInput: (request) => request.body,
      present,
    }),
  ],
  observability: { operation: 'candidate.bearer-session' },
});

const boundaryProcessorManifest = makeCommandManifest({
  id: 'candidate.processor-cookie.v1',
  path: '/candidate/processor-cookie/:locationId',
  contextRequirements: ['request-actor'],
});

const boundaryControlManifest = makeCommandManifest({
  id: 'candidate.control-cookie-csrf.v1',
  path: '/candidate/control-cookie-csrf/:locationId',
  contextRequirements: ['request-actor', 'request-location'],
});

const publicNoAuthProfile = defineHttpBoundaryProfile({
  id: 'public-no-auth',
  authentication: null,
  requestBody: null,
  exactOrigin: null,
  csrf: null,
  requestRateLimit: 'ip-bucket-public',
  identityRateLimit: null,
  inputValidationPhase: 'before-authentication',
  noStore: false,
  contextProviders: [],
  authorization: null,
});

const bearerSessionProfile = defineHttpBoundaryProfile({
  id: 'bearer-session',
  authentication: { provider: 'bearer-session', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    unsupportedContentType: {
      code: 'unsupported_media_type',
      safeMessage: 'This endpoint requires JSON.',
    },
    parser: 'json-document',
    phase: 'before-authentication',
  },
  exactOrigin: null,
  csrf: null,
  requestRateLimit: 'ip-bucket-bearer',
  identityRateLimit: null,
  inputValidationPhase: 'before-authentication',
  noStore: false,
  contextProviders: [],
  authorization: null,
});

const processorCookieProfile = defineHttpBoundaryProfile({
  id: 'processor-cookie',
  authentication: { provider: 'session-cookie-a', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    contentType: 'parse-if-matching',
    parser: 'json-document',
    phase: 'before-authentication',
  },
  exactOrigin: 'exact-origin-a',
  csrf: null,
  requestRateLimit: 'ip-bucket-a',
  identityRateLimit: 'identity-bucket-a',
  inputValidationPhase: 'after-authentication',
  noStore: true,
  contextProviders: ['request-actor-a'],
  authorization: 'capability-a',
});

const controlCookieCsrfProfile = defineHttpBoundaryProfile({
  id: 'control-cookie-csrf',
  authentication: { provider: 'session-cookie-b', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    parser: 'json-document',
    phase: 'after-authorization',
  },
  exactOrigin: 'exact-origin-b',
  csrf: 'csrf-token-b',
  requestRateLimit: 'ip-bucket-b',
  identityRateLimit: 'identity-bucket-b',
  inputValidationPhase: 'after-authorization',
  noStore: true,
  contextProviders: ['request-actor-b', 'request-location-b'],
  authorization: 'capability-b',
  expectedFailureObservation: 'cookie-auth-failure',
});

const boundaryProfiles = Object.freeze([
  publicNoAuthProfile,
  bearerSessionProfile,
  processorCookieProfile,
  controlCookieCsrfProfile,
]);

const boundaryBindings = Object.freeze([
  bindHttpBoundaryProfile({
    operationId: boundaryPublicManifest.id,
    profileId: publicNoAuthProfile.id,
  }),
  bindHttpBoundaryProfile({
    operationId: boundaryBearerManifest.id,
    profileId: bearerSessionProfile.id,
  }),
  bindHttpBoundaryProfile({
    operationId: boundaryProcessorManifest.id,
    profileId: processorCookieProfile.id,
  }),
  bindHttpBoundaryProfile({
    operationId: boundaryControlManifest.id,
    profileId: controlCookieCsrfProfile.id,
  }),
]);

const boundarySelections = Object.freeze([
  selectCell({
    manifest: boundaryPublicManifest,
    source: {
      moduleSpecifier: '@fixtures/candidate-boundaries',
      manifestExportName: 'boundaryPublicManifest',
      assemblyExportName: 'makeCandidateBoundaries',
      assemblyKey: 'publicBoundary',
    },
  }),
  selectCell({
    manifest: boundaryBearerManifest,
    source: {
      moduleSpecifier: '@fixtures/candidate-boundaries',
      manifestExportName: 'boundaryBearerManifest',
      assemblyExportName: 'makeCandidateBoundaries',
      assemblyKey: 'bearerBoundary',
    },
  }),
  selectCell({
    manifest: boundaryProcessorManifest,
    source: {
      moduleSpecifier: '@fixtures/candidate-boundaries',
      manifestExportName: 'boundaryProcessorManifest',
      assemblyExportName: 'makeCandidateBoundaries',
      assemblyKey: 'processorBoundary',
    },
  }),
  selectCell({
    manifest: boundaryControlManifest,
    source: {
      moduleSpecifier: '@fixtures/candidate-boundaries',
      manifestExportName: 'boundaryControlManifest',
      assemblyExportName: 'makeCandidateBoundaries',
      assemblyKey: 'controlBoundary',
    },
  }),
]);

const boundaryProfileTopology = (
  options: Readonly<{
    profiles?: TopologyDefinition['httpBoundaryProfiles'];
    bindings?: TopologyDefinition['httpBoundaryBindings'];
    reverse?: boolean;
  }> = {},
): TopologyDefinition => {
  const profiles = options.profiles ?? boundaryProfiles;
  const bindings = options.bindings ?? boundaryBindings;
  return defineTopology({
    id: 'candidate-boundaries',
    systems: [
      defineSystem({
        id: 'candidate-boundaries',
        cells: options.reverse
          ? [...boundarySelections].reverse()
          : boundarySelections,
      }),
    ],
    experiences: [],
    httpBoundaryProfiles: options.reverse ? [...profiles].reverse() : profiles,
    httpBoundaryBindings: options.reverse ? [...bindings].reverse() : bindings,
  });
};

const expectCompiled = (definition: TopologyDefinition): CompiledTopology => {
  const result = compileTopology(definition);
  expect(result.kind).toBe('compiled');
  if (result.kind === 'invalid') {
    expect(result.violations).toEqual([]);
    return Object.freeze({
      id: 'invalid',
      cells: [],
      cliCommands: [],
      eventStreams: [],
      httpRoutes: [],
      jobs: [],
      events: [],
      experiences: [],
      cliProgram: null,
      httpBoundaryProfiles: [],
    });
  }
  return result.topology;
};

const expectResolvedStaticArtifacts = (
  ...parameters: Parameters<typeof resolveStaticArtifacts>
) => {
  const resolution = resolveStaticArtifacts(...parameters);
  expect(resolution.kind).toBe('ready');
  return resolution.kind === 'ready' ? resolution.artifacts : [];
};

const violationCodes = (definition: TopologyDefinition): readonly string[] => {
  const result = compileTopology(definition);
  return result.kind === 'invalid'
    ? result.violations.map((entry) => entry.code)
    : [];
};

const countBy = <Value>(
  values: readonly Value[],
  keyOf: (value: Value) => string,
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.freeze(counts);
};

const expectResolvedArtifacts = async () => {
  const resolution = await resolvePresslyArtifacts();
  expect(resolution.kind).toBe('ready');
  return resolution.kind === 'ready' ? resolution.artifacts : [];
};

describe('cell declarations', () => {
  it('defines immutable command, query, reaction, and process cells', () => {
    const process = defineProcessCell({
      id: 'reporting.rebuild-projection.v1',
      contract: exampleContract,
      surfaces: [
        job.manual({
          id: 'reporting.rebuild-projection-job.v1',
          toSerializedInput: (payload) => payload,
          presentFailure: () => ({
            code: 'reporting_projection_failed',
            message: 'The reporting projection failed.',
            retryable: false,
          }),
        }),
      ],
      observability: { operation: 'reporting.rebuild-projection' },
      execute: async () =>
        Object.freeze({ kind: 'success', value: { reserved: true } }),
    });

    expect([
      reserveItem.kind,
      loadItem.kind,
      projectReservation.kind,
      process.kind,
    ]).toEqual(['command', 'query', 'reaction', 'process']);
    for (const cell of [reserveItem, loadItem, projectReservation, process]) {
      expect(Object.isFrozen(cell)).toBe(true);
      expect(Object.isFrozen(cell.surfaces)).toBe(true);
      expect(Object.isFrozen(cell.observability)).toBe(true);
    }
  });

  it('separates authentication from authorization and freezes HTTP context requirements', () => {
    const validationEvents: string[] = [];
    const authenticatedRead = declareQueryCell({
      id: 'inventory.authenticated-read.v1',
      authentication: 'required',
      contract: exampleContract,
      surfaces: [
        http.get({
          path: '/authenticated',
          contextRequirements: ['authenticated-actor'],
          validateRequest: () => {
            validationEvents.push('validate');
            return undefined;
          },
          toSerializedInput: (request) => request.query,
          present,
        }),
      ],
      observability: { operation: 'inventory.authenticated-read' },
    });
    const surface = authenticatedRead.surfaces[0];
    expect(surface?.kind).toBe('http');
    if (surface?.kind !== 'http') return;

    expect(reserveItem.authentication).toBe('required');
    expect(loadItem.authentication).toBe('none');
    expect(authenticatedRead).toMatchObject({
      authentication: 'required',
      authorization: null,
    });
    expect(surface?.contextRequirements).toEqual(['authenticated-actor']);
    expect(Object.isFrozen(surface?.contextRequirements)).toBe(true);
    expect(
      surface?.validateRequest?.({
        params: {},
        query: {},
        headers: {},
        body: undefined,
      }),
    ).toBeUndefined();
    expect(validationEvents).toEqual(['validate']);
  });

  it('exposes a staged, executable HTTP entry without host-side narrowing', async () => {
    const catalog = defineHttpCatalog([reserveItem] as const);
    const entry = catalog.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    expect(entry.authorization?.timing).toBe('before-input');
    expect(entry.surface.invalidRequest).toEqual({
      authorizationScope: {
        code: 'invalid_params_type',
        message: 'Validation params failed.',
        safeMessage: 'Invalid request input.',
        status: 400,
        location: 'params',
      },
      input: {
        code: 'invalid_body_type',
        message: 'Validation body failed.',
        safeMessage: 'Invalid request input.',
        status: 400,
        location: 'body',
      },
    });
    expect(Object.isFrozen(entry.surface.invalidRequest)).toBe(true);
    expect(
      Object.isFrozen(entry.surface.invalidRequest.authorizationScope),
    ).toBe(true);
    if (entry.authorization?.timing !== 'before-input') return;
    expect(
      entry.authorization.decodeScope({
        params: { locationId: 'location-1' },
        query: {},
        headers: {},
      }),
    ).toEqual({ kind: 'valid', value: 'location-1' });

    const decoded = entry.decodeRequest({
      params: { locationId: 'location-1' },
      query: {},
      headers: {},
      body: { itemId: 'item-1' },
      context: { actorId: 'actor-1' },
    });
    expect(decoded.kind).toBe('valid');
    if (decoded.kind === 'invalid') return;

    const outcome = await entry.execute(decoded.value);
    expect(entry.present(outcome)).toEqual({
      status: 200,
      body: { reserved: true },
    });
  });
});

describe('topology compilation', () => {
  it('compiles deterministic operation, route, job, event, and client ownership', () => {
    const topology = expectCompiled(validTopology());

    expect(topology.cells.map((entry) => entry.manifest.id)).toEqual([
      'inventory.load-item.v1',
      'inventory.reserve-item.v1',
      'reporting.project-reservation.v1',
    ]);
    expect(topology.httpRoutes).toHaveLength(2);
    expect(topology.eventStreams).toEqual([]);
    expect(topology.jobs.map((entry) => entry.surface.id)).toEqual([
      'reporting.project-reservation-job.v1',
    ]);
    expect(topology.events.map((event) => event.contract.id)).toEqual([
      'inventory.item-reserved.v1',
    ]);
    expect(topology.experiences[0]?.operationIds).toEqual([
      'inventory.load-item.v1',
      'inventory.reserve-item.v1',
    ]);
    expect(topology.experiences[0]?.clientOperationIds).toEqual([
      'inventory.load-item.v1',
      'inventory.reserve-item.v1',
    ]);
  });

  it('derives browser operations from explicit uses and owned client surfaces without self-use', () => {
    const topology = expectCompiled(experienceOwnedClientTopology());
    const experience = topology.experiences[0];
    expect(experience).toEqual({
      id: 'operator',
      operationIds: ['inventory.load-item.v1'],
      clientOperationIds: [
        'inventory.load-item.v1',
        'operator.load-dashboard.v1',
      ],
      features: [],
    });

    const artifacts = expectResolvedStaticArtifacts(topology);
    const clientSource = artifacts.find(
      (artifact) => artifact.path === 'generated/clients/operator.ts',
    )?.content;
    expect(clientSource).toContain('export const inventoryLoadItemV1');
    expect(clientSource).toContain('export const operatorLoadDashboardV1');
    expect(clientSource).not.toContain('operatorLoadPreferencesV1');
    expect(clientSource).not.toContain('@pressly/system-inventory');
    expect(clientSource).not.toContain('@pressly/experience-operator/server');
    expect(clientSource).not.toContain('makeInventorySystem');
    expect(clientSource).not.toContain('makeOperatorExperience');
    expect(clientSource?.indexOf('inventoryLoadItemV1')).toBeLessThan(
      clientSource?.indexOf('operatorLoadDashboardV1') ?? -1,
    );

    expect(explainOperation(topology, loadItemManifest.id)).toMatchObject({
      kind: 'found',
      explanation: { experienceConsumers: ['operator'] },
    });
    expect(
      explainOperation(topology, operatorDashboardManifest.id),
    ).toMatchObject({
      kind: 'found',
      explanation: { experienceConsumers: [] },
    });

    expect(
      expectResolvedStaticArtifacts(
        expectCompiled(experienceOwnedClientTopology(undefined, true)),
      ),
    ).toEqual(artifacts);
  });

  it('deduplicates explicit self-use while retaining explicit consumer meaning', () => {
    const base = experienceOwnedClientTopology();
    const experience = base.experiences[0];
    expect(experience).toBeDefined();
    if (experience === undefined) return;
    const topology = expectCompiled(
      defineTopology({
        id: base.id,
        systems: base.systems,
        experiences: [
          defineExperience({
            id: experience.id,
            cells: experience.cells,
            uses: [...experience.uses, operatorDashboardManifest.id],
          }),
        ],
      }),
    );

    expect(topology.experiences[0]).toEqual({
      id: 'operator',
      operationIds: ['inventory.load-item.v1', 'operator.load-dashboard.v1'],
      clientOperationIds: [
        'inventory.load-item.v1',
        'operator.load-dashboard.v1',
      ],
      features: [],
    });
    expect(
      explainOperation(topology, operatorDashboardManifest.id),
    ).toMatchObject({
      kind: 'found',
      explanation: { experienceConsumers: ['operator'] },
    });
  });

  it('retains duplicate and unknown explicit-use validation', () => {
    const definition = defineTopology({
      id: 'invalid-experience-uses',
      systems: [inventorySystem],
      experiences: [
        defineExperience({
          id: 'operator',
          cells: [],
          uses: [
            loadItemManifest.id,
            loadItemManifest.id,
            'inventory.missing-item.v1',
          ],
        }),
      ],
    });

    expect(violationCodes(definition)).toEqual(
      expect.arrayContaining([
        'duplicate_experience_use',
        'unknown_experience_operation',
      ]),
    );
  });

  it('rejects an internal message consumer when no producer is selected', () => {
    expect(
      violationCodes(reactionTopology(projectReservationManifest)),
    ).toContain('undeclared_internal_event');
  });

  it('accepts the deployed underscore-form external wire event identity', () => {
    const fulfillmentDemandChanged = defineMessageContract({
      type: 'fulfillment_demand_changed',
      version: 2,
      scope: 'external',
      payload: commandBoundary,
    });
    const manifest = Object.freeze({
      ...projectReservationManifest,
      consumes: Object.freeze([fulfillmentDemandChanged]),
    });

    const topology = expectCompiled(reactionTopology(manifest));

    expect(topology.cells[0]?.manifest.consumes).toEqual([
      expect.objectContaining({
        id: 'fulfillment_demand_changed.v2',
        type: 'fulfillment_demand_changed',
        version: 2,
        scope: 'external',
      }),
    ]);
  });

  it('retains the dotted and hyphenated grammar for internal message types', () => {
    const internalUnderscore = defineMessageContract({
      type: 'fulfillment_demand_changed',
      version: 1,
      payload: commandBoundary,
    });
    const manifest = Object.freeze({
      ...projectReservationManifest,
      consumes: Object.freeze([internalUnderscore]),
    });

    expect(violationCodes(reactionTopology(manifest))).toContain(
      'invalid_event_identity',
    );
  });

  it.each([
    '_fulfillment',
    'Fulfillment_demand',
    'fulfillment demand',
    'fulfillment/demand',
    'fulfillment__demand',
    'fulfillment.',
  ])('rejects unsafe external wire event type %s', (type) => {
    const unsafeExternal = defineMessageContract({
      type,
      version: 1,
      scope: 'external',
      payload: commandBoundary,
    });
    const manifest = Object.freeze({
      ...projectReservationManifest,
      consumes: Object.freeze([unsafeExternal]),
    });

    expect(violationCodes(reactionTopology(manifest))).toContain(
      'invalid_event_identity',
    );
  });

  it('does not relax cell or job identity grammar for external consumers', () => {
    const external = defineMessageContract({
      type: 'fulfillment_demand_changed',
      version: 1,
      scope: 'external',
      payload: commandBoundary,
    });
    const surface = projectReservationManifest.surfaces[0];
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const malformed = Object.freeze({
      ...projectReservationManifest,
      id: 'reporting.project_reservation.v1',
      consumes: Object.freeze([external]),
      surfaces: Object.freeze([
        Object.freeze({
          ...surface,
          id: 'reporting.project_reservation-job.v1',
        }),
      ]),
    }) as typeof projectReservationManifest;

    expect(violationCodes(reactionTopology(malformed))).toEqual(
      expect.arrayContaining(['invalid_cell_id', 'invalid_job']),
    );
  });

  it('compiles subscriptions into a separate event-stream route collection', () => {
    const topology = expectCompiled(subscriptionTopology());

    expect(topology.httpRoutes).toEqual([]);
    expect(topology.jobs).toEqual([]);
    expect(topology.eventStreams).toHaveLength(1);
    expect(topology.eventStreams[0]).toMatchObject({
      operationId: 'inventory.watch-item.v1',
      ownerId: 'inventory',
      surface: {
        kind: 'event-stream',
        method: 'GET',
        path: '/locations/:locationId/items/:itemId/events',
        retryMs: 2_500,
        eventTypes: ['ready', 'changed'],
      },
    });
    const manifest = topology.cells[0]?.manifest;
    expect(manifest?.kind).toBe('subscription');
    expect(
      manifest !== undefined && 'event' in manifest.contract
        ? manifest.contract.event.version
        : undefined,
    ).toBe(1);
  });

  it('rejects collisions between finite HTTP and event-stream routes', () => {
    const collidingQuery = declareQueryCell({
      id: 'inventory.load-item-events.v1',
      contract: exampleContract,
      surfaces: [
        http.get<ExampleResult, ExampleFailure>({
          path: '/locations/:scope/items/:item/events',
          toSerializedInput: (request) => request.params,
          present,
        }),
      ],
      observability: { operation: 'inventory.load-item-events' },
    });
    const definition = defineTopology({
      id: 'route-collision',
      systems: [
        defineSystem({
          id: 'inventory',
          cells: [
            selectWatchItem(watchItemManifest),
            selectCell({
              manifest: collidingQuery,
              source: {
                moduleSpecifier: '@pressly/system-inventory',
                manifestExportName: 'loadItemEventsManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'loadItemEvents',
              },
            }),
          ],
        }),
      ],
      experiences: [],
    });

    expect(violationCodes(definition)).toContain('duplicate_route');
  });

  it('rejects malformed stream descriptors and invalid subscription semantics', () => {
    const declaredSurface = watchItemManifest.surfaces[0];
    expect(declaredSurface).toBeDefined();
    if (declaredSurface === undefined) return;

    const malformedSurface = Object.freeze({
      ...declaredSurface,
      method: 'POST',
      retryMs: 0,
      eventTypes: Object.freeze(['changed', 'changed', 'unsafe event']),
      invalidRequest: Object.freeze({
        authorizationScope: Object.freeze({
          code: '',
          message: '',
          location: 'headers',
        }),
        input: null,
      }),
    }) as unknown as typeof declaredSurface;
    const malformed = Object.freeze({
      ...watchItemManifest,
      contract: Object.freeze({
        ...watchItemManifest.contract,
        event: Object.freeze({
          ...watchItemManifest.contract.event,
          version: 0,
        }),
      }),
      surfaces: Object.freeze([malformedSurface]),
    }) as typeof watchItemManifest;
    expect(violationCodes(subscriptionTopology(malformed))).toEqual(
      expect.arrayContaining([
        'duplicate_event_stream_type',
        'invalid_cell_contract',
        'invalid_event_stream',
        'invalid_request_descriptor',
      ]),
    );

    const invalidSemantics = Object.freeze({
      ...watchItemManifest,
      consistency: Object.freeze({
        transaction: 'required',
        concurrency: 'optimistic',
      }),
      idempotency: Object.freeze({ required: true }),
      surfaces: Object.freeze([]),
      emits: Object.freeze([itemReserved]),
      retry: Object.freeze({
        maxAttempts: 2,
        strategy: 'bounded-exponential-jitter',
        deadLetter: 'retain',
      }),
    }) as unknown as typeof watchItemManifest;
    expect(violationCodes(subscriptionTopology(invalidSemantics))).toContain(
      'invalid_cell_semantics',
    );
  });

  it('rejects duplicate operation identities and parameter-equivalent routes', () => {
    const other = makeCommandManifest({
      id: 'inventory.reserve-other.v1',
      path: '/locations/:scope/items/:id/reserve',
    });
    const duplicate = makeCommandManifest({
      id: reserveItem.id,
      path: '/other',
    });
    const definition = defineTopology({
      id: 'duplicates',
      systems: [
        defineSystem({
          id: 'inventory',
          cells: [
            selectCell({
              manifest: reserveItemManifest,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'reserveItemManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'reserveItem',
              },
            }),
            selectCell({
              manifest: other,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'otherManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'other',
              },
            }),
            selectCell({
              manifest: duplicate,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'duplicateManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'duplicate',
              },
            }),
          ],
        }),
      ],
      experiences: [],
    });

    expect(violationCodes(definition)).toEqual(
      expect.arrayContaining(['duplicate_operation_id', 'duplicate_route']),
    );
  });

  it('rejects malformed HTTP invalid-request descriptors', () => {
    const declared = makeCommandManifest({
      id: 'inventory.invalid-request.v1',
      path: '/invalid-request/:locationId',
    });
    const malformedInvalidRequest = {
      authorizationScope: {
        code: '',
        message: '',
        safeMessage: '',
        status: 500,
        location: 'headers',
      },
      input: null,
    } as unknown as HttpSurfaceManifest['invalidRequest'];
    const malformed = Object.freeze({
      ...declared,
      surfaces: Object.freeze(
        declared.surfaces.map((surface) =>
          surface.kind === 'http'
            ? Object.freeze({
                ...surface,
                invalidRequest: malformedInvalidRequest,
              })
            : surface,
        ),
      ),
    });
    const definition = defineTopology({
      id: 'invalid-request',
      systems: [
        defineSystem({
          id: 'inventory',
          cells: [
            selectCell({
              manifest: malformed,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'invalidRequestManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'invalidRequest',
              },
            }),
          ],
        }),
      ],
      experiences: [],
    });

    expect(violationCodes(definition)).toContain('invalid_request_descriptor');
  });

  it('rejects unsafe or repeated context tokens and authorization without authentication', () => {
    const declared = makeCommandManifest({
      id: 'inventory.invalid-context.v1',
      path: '/invalid-context/:locationId',
    });
    const surface = declared.surfaces[0];
    expect(surface?.kind).toBe('http');
    if (surface?.kind !== 'http') return;
    const malformed = Object.freeze({
      ...declared,
      authentication: 'none' as const,
      surfaces: Object.freeze([
        Object.freeze({
          ...surface,
          contextRequirements: Object.freeze([
            'authenticated-actor',
            'authenticated-actor',
            'Unsafe token',
            '',
          ]),
        }),
      ]),
    });
    const definition = defineTopology({
      id: 'invalid-context',
      systems: [
        defineSystem({
          id: 'inventory',
          cells: [
            selectCell({
              manifest: malformed,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'invalidContextManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'invalidContext',
              },
            }),
          ],
        }),
      ],
      experiences: [],
    });

    expect(violationCodes(definition)).toEqual(
      expect.arrayContaining([
        'duplicate_context_requirement',
        'invalid_cell_semantics',
        'invalid_context_requirement',
      ]),
    );
  });

  it('rejects ambiguous structural selectors for generated browser routes', () => {
    const declared = makeCommandManifest({
      id: 'inventory.reserve-ambiguous.v1',
      path: '/locations/:locationId/items/:itemId/reserve',
    });
    const firstSurface = declared.surfaces[0];
    expect(firstSurface?.kind).toBe('http');
    if (firstSurface?.kind !== 'http') return;
    const ambiguous = Object.freeze({
      ...declared,
      surfaces: Object.freeze([
        firstSurface,
        Object.freeze({
          ...firstSurface,
          path: '/warehouses/:warehouseId/stock/:itemId/reserve',
        }),
      ]),
    });
    const definition = defineTopology({
      id: 'ambiguous-client',
      systems: [
        defineSystem({
          id: 'inventory',
          cells: [
            selectCell({
              manifest: ambiguous,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'ambiguousManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'ambiguous',
              },
            }),
          ],
        }),
      ],
      experiences: [
        defineExperience({
          id: 'operator',
          cells: [],
          uses: [ambiguous.id],
        }),
      ],
    });

    expect(violationCodes(definition)).toContain(
      'ambiguous_client_http_surface',
    );
  });

  it('validates structural selectors for Experience-owned browser routes', () => {
    const ambiguousOwnedDashboard = declareQueryCell({
      id: operatorDashboardManifest.id,
      contract: exampleContract,
      surfaces: [
        http.get<ExampleResult, ExampleFailure>({
          path: '/operator/dashboards/:dashboardId',
          toSerializedInput: (request) => request.params,
          present,
        }),
        http.get<ExampleResult, ExampleFailure>({
          path: '/operator/reports/:reportId',
          toSerializedInput: (request) => request.params,
          present,
        }),
      ],
      observability: operatorDashboardManifest.observability,
    });

    expect(
      violationCodes(experienceOwnedClientTopology(ambiguousOwnedDashboard)),
    ).toContain('ambiguous_client_http_surface');
  });

  it('rejects multiple event streams for one generated client operation', () => {
    const firstSurface = watchItemManifest.surfaces[0];
    expect(firstSurface).toBeDefined();
    if (firstSurface === undefined) return;
    const ambiguous = Object.freeze({
      ...watchItemManifest,
      surfaces: Object.freeze([
        firstSurface,
        Object.freeze({
          ...firstSurface,
          path: '/locations/:locationId/items/:itemId/audit-events',
        }),
      ]),
    }) as typeof watchItemManifest;

    expect(violationCodes(subscriptionTopology(ambiguous))).toContain(
      'ambiguous_client_event_stream_surface',
    );
  });

  it('rejects distinct contracts with the same event identity', () => {
    const conflictingEvent = defineMessageContract({
      type: itemReserved.type,
      version: itemReserved.version,
      payload: itemReserved.payload,
    });
    const first = makeCommandManifest({
      id: 'inventory.first-command.v1',
      path: '/first',
      emits: [itemReserved],
    });
    const second = makeCommandManifest({
      id: 'inventory.second-command.v1',
      path: '/second',
      emits: [conflictingEvent],
    });
    const definition = defineTopology({
      id: 'events',
      systems: [
        defineSystem({
          id: 'inventory',
          cells: [
            selectCell({
              manifest: first,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'firstManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'first',
              },
            }),
            selectCell({
              manifest: second,
              source: {
                moduleSpecifier: '@fixtures/inventory',
                manifestExportName: 'secondManifest',
                assemblyExportName: 'makeInventorySystem',
                assemblyKey: 'second',
              },
            }),
          ],
        }),
      ],
      experiences: [],
    });

    expect(violationCodes(definition)).toContain('duplicate_event_identity');
  });

  it('rejects duplicate job identities', () => {
    const makeProcess = (
      id: string,
      manifestExportName: string,
      assemblyKey: string,
    ) =>
      selectCell({
        manifest: declareProcessCell({
          id,
          contract: exampleContract,
          surfaces: [
            job.poll({
              id: 'reporting.poll-job.v1',
              toSerializedInput: (payload) => payload,
              presentFailure: () => ({
                code: 'reporting_poll_failed',
                message: 'The reporting poll failed.',
                retryable: false,
              }),
            }),
          ],
          observability: { operation: id },
        }),
        source: {
          moduleSpecifier: '@fixtures/reporting',
          manifestExportName,
          assemblyExportName: 'makeReportingSystem',
          assemblyKey,
        },
      });
    const definition = defineTopology({
      id: 'jobs',
      systems: [
        defineSystem({
          id: 'reporting',
          cells: [
            makeProcess(
              'reporting.first-process.v1',
              'firstProcessManifest',
              'firstProcess',
            ),
            makeProcess(
              'reporting.second-process.v1',
              'secondProcessManifest',
              'secondProcess',
            ),
          ],
        }),
      ],
      experiences: [],
    });

    expect(violationCodes(definition)).toContain('duplicate_job_id');
  });
});

describe('selected HTTP boundary-profile topology', () => {
  it('compiles four immutable business-neutral profiles onto exact operations', () => {
    const topology = expectCompiled(boundaryProfileTopology());

    expect(topology.httpBoundaryProfiles.map((profile) => profile.id)).toEqual([
      'bearer-session',
      'control-cookie-csrf',
      'processor-cookie',
      'public-no-auth',
    ]);
    expect(
      topology.httpRoutes.map((route) => ({
        operationId: route.operationId,
        profileId: route.boundaryProfile?.id,
      })),
    ).toEqual([
      {
        operationId: 'candidate.public.v1',
        profileId: 'public-no-auth',
      },
      {
        operationId: 'candidate.bearer-session.v1',
        profileId: 'bearer-session',
      },
      {
        operationId: 'candidate.control-cookie-csrf.v1',
        profileId: 'control-cookie-csrf',
      },
      {
        operationId: 'candidate.processor-cookie.v1',
        profileId: 'processor-cookie',
      },
    ]);
    for (const candidate of topology.httpBoundaryProfiles) {
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.contextProviders)).toBe(true);
      if (candidate.authentication !== null)
        expect(Object.isFrozen(candidate.authentication)).toBe(true);
      if (candidate.requestBody !== null) {
        expect(Object.isFrozen(candidate.requestBody)).toBe(true);
        expect(
          Object.isFrozen(candidate.requestBody.acceptedContentTypes),
        ).toBe(true);
        if (candidate.requestBody.unsupportedContentType !== undefined)
          expect(
            Object.isFrozen(candidate.requestBody.unsupportedContentType),
          ).toBe(true);
      }
    }
    expect(
      topology.httpBoundaryProfiles.find(
        (candidate) => candidate.id === 'bearer-session',
      )?.requestBody,
    ).toMatchObject({
      contentType: 'required',
      unsupportedContentType: {
        code: 'unsupported_media_type',
        safeMessage: 'This endpoint requires JSON.',
      },
    });
    expect(
      topology.httpBoundaryProfiles.find(
        (candidate) => candidate.id === 'public-no-auth',
      )?.expectedFailureObservation,
    ).toBeNull();
  });

  it('generates deterministic catalog and inventory metadata independent of declaration order', () => {
    const first = expectResolvedStaticArtifacts(
      expectCompiled(boundaryProfileTopology()),
    );
    const second = expectResolvedStaticArtifacts(
      expectCompiled(boundaryProfileTopology({ reverse: true })),
    );

    expect(second).toEqual(first);
    const httpSource = first.find(
      (artifact) => artifact.path === 'generated/http-catalog.ts',
    )?.content;
    const architectureSource = first.find(
      (artifact) => artifact.path === 'generated/architecture-map.ts',
    )?.content;
    expect(httpSource).toContain('"candidate.control-cookie-csrf.v1": {');
    expect(httpSource).toContain('"id": "control-cookie-csrf"');
    expect(httpSource).toContain('"phase": "after-authorization"');
    expect(httpSource).toContain('"acceptedContentTypes": [');
    expect(httpSource).toContain('"code": "unsupported_media_type"');
    expect(httpSource).toContain(
      '"safeMessage": "This endpoint requires JSON."',
    );
    expect(httpSource).toContain('"contentType": "parse-if-matching"');
    expect(httpSource).toContain('"exactOrigin": "exact-origin-b"');
    expect(httpSource).toContain('"csrf": "csrf-token-b"');
    expect(httpSource).toContain('"identityRateLimit": "identity-bucket-b"');
    expect(httpSource).toContain('"requestRateLimit": "ip-bucket-b"');
    expect(httpSource).toContain(
      '"inputValidationPhase": "after-authorization"',
    );
    expect(httpSource).toContain('"noStore": true');
    expect(httpSource).toContain('"contextProviders": [');
    expect(httpSource).toContain('"authorization": "capability-b"');
    expect(httpSource).toContain(
      '"expectedFailureObservation": "cookie-auth-failure"',
    );
    expect(architectureSource).toContain('"boundaryProfile": "public-no-auth"');
    expect(architectureSource).toContain(
      '"boundaryProfile": "control-cookie-csrf"',
    );

    const diagnostics = [httpSource, architectureSource].flatMap((source) =>
      source === undefined
        ? []
        : (ts.transpileModule(source, {
            reportDiagnostics: true,
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          }).diagnostics ?? []),
    );
    expect(diagnostics).toEqual([]);
  });

  it('rejects duplicate declarations and ambiguous operation bindings', () => {
    expect(
      violationCodes(
        boundaryProfileTopology({
          profiles: [...boundaryProfiles, publicNoAuthProfile],
        }),
      ),
    ).toContain('duplicate_http_boundary_profile');
    expect(
      violationCodes(
        boundaryProfileTopology({
          bindings: [
            ...boundaryBindings,
            bindHttpBoundaryProfile({
              operationId: boundaryProcessorManifest.id,
              profileId: controlCookieCsrfProfile.id,
            }),
          ],
        }),
      ),
    ).toContain('ambiguous_http_boundary_profile');
  });

  it('rejects unknown operations, unknown profiles, and malformed profile policy', () => {
    const unknownCodes = violationCodes(
      boundaryProfileTopology({
        bindings: [
          ...boundaryBindings,
          bindHttpBoundaryProfile({
            operationId: 'candidate.unknown.v1',
            profileId: publicNoAuthProfile.id,
          }),
          bindHttpBoundaryProfile({
            operationId: boundaryPublicManifest.id,
            profileId: 'unknown-profile',
          }),
        ],
      }),
    );
    expect(unknownCodes).toContain('unknown_http_boundary_operation');
    expect(unknownCodes).toContain('unknown_http_boundary_profile');

    const invalidProcessorProfile = defineHttpBoundaryProfile({
      ...processorCookieProfile,
      requestBody: {
        ...processorCookieProfile.requestBody!,
        acceptedContentTypes: ['Application/JSON', 'Application/JSON'],
        contentType: 'invalid-policy' as never,
        unsupportedContentType: { code: '', safeMessage: '' },
      },
      exactOrigin: null,
      csrf: 'csrf-without-origin',
      requestRateLimit: 'Unsafe request bucket',
      inputValidationPhase: 'invalid-phase' as never,
      expectedFailureObservation: 'Unsafe observer' as never,
    });
    expect(
      violationCodes(
        boundaryProfileTopology({
          profiles: boundaryProfiles.map((candidate) =>
            candidate.id === invalidProcessorProfile.id
              ? invalidProcessorProfile
              : candidate,
          ),
        }),
      ),
    ).toContain('invalid_http_boundary_profile');

    const conditionalPresentation = defineHttpBoundaryProfile({
      ...processorCookieProfile,
      requestBody: {
        ...processorCookieProfile.requestBody!,
        unsupportedContentType: {
          code: 'unsupported_media_type',
          safeMessage: 'JSON is required.',
        },
      },
    });
    expect(
      violationCodes(
        boundaryProfileTopology({
          profiles: boundaryProfiles.map((candidate) =>
            candidate.id === conditionalPresentation.id
              ? conditionalPresentation
              : candidate,
          ),
        }),
      ),
    ).toContain('invalid_http_boundary_profile');
  });

  it('rejects authentication, parser, authorization, and context incompatibility', () => {
    const replaceBinding = (
      operationId: string,
      profileId: string,
    ): TopologyDefinition['httpBoundaryBindings'] =>
      boundaryBindings.map((binding) =>
        binding.operationId === operationId
          ? bindHttpBoundaryProfile({ operationId, profileId })
          : binding,
      );

    expect(
      violationCodes(
        boundaryProfileTopology({
          bindings: replaceBinding(
            boundaryBearerManifest.id,
            publicNoAuthProfile.id,
          ),
        }),
      ),
    ).toContain('incompatible_http_boundary_profile');

    const parserAfterValidation = defineHttpBoundaryProfile({
      ...bearerSessionProfile,
      requestBody: {
        ...bearerSessionProfile.requestBody!,
        phase: 'after-authentication',
      },
    });
    expect(
      violationCodes(
        boundaryProfileTopology({
          profiles: boundaryProfiles.map((candidate) =>
            candidate.id === parserAfterValidation.id
              ? parserAfterValidation
              : candidate,
          ),
        }),
      ),
    ).toContain('incompatible_http_boundary_profile');

    const controlOnBearer = compileTopology(
      boundaryProfileTopology({
        bindings: replaceBinding(
          boundaryBearerManifest.id,
          controlCookieCsrfProfile.id,
        ),
      }),
    );
    expect(controlOnBearer.kind).toBe('invalid');
    if (controlOnBearer.kind === 'invalid') {
      const messages = controlOnBearer.violations.map((entry) => entry.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('both declare authorization'),
          expect.stringContaining('After-authorization parsing requires'),
          expect.stringContaining(
            'After-authorization input validation requires',
          ),
        ]),
      );
    }

    const missingContextProfile = defineHttpBoundaryProfile({
      ...processorCookieProfile,
      contextProviders: [],
    });
    expect(
      violationCodes(
        boundaryProfileTopology({
          profiles: boundaryProfiles.map((candidate) =>
            candidate.id === missingContextProfile.id
              ? missingContextProfile
              : candidate,
          ),
        }),
      ),
    ).toContain('incompatible_http_boundary_profile');
  });

  it('selects the complete Pressly HTTP deployment with total profiles', () => {
    const topology = expectCompiled(presslyTopology);

    expect(topology.cells).toHaveLength(193);
    expect(topology.httpRoutes).toHaveLength(112);
    expect(
      new Set(topology.httpRoutes.map((route) => route.operationId)),
    ).toHaveLength(111);
    expect(topology.httpBoundaryProfiles).toHaveLength(81);
    expect(
      topology.httpRoutes.every((route) => route.boundaryProfile !== null),
    ).toBe(true);
    const requiredJsonRoutes = topology.httpRoutes.filter(
      (route) => route.boundaryProfile?.requestBody?.contentType === 'required',
    );
    expect(requiredJsonRoutes).toHaveLength(20);
    expect(
      requiredJsonRoutes.every(
        (route) =>
          route.boundaryProfile?.requestBody?.unsupportedContentType?.code ===
            'unsupported_media_type' &&
          route.boundaryProfile.requestBody.unsupportedContentType
            .safeMessage === 'This endpoint requires a JSON request body.',
      ),
    ).toBe(true);
    expect(requiredJsonRoutes.map((route) => route.operationId)).toEqual(
      expect.arrayContaining([
        'pricing.plan-pricing-change.v1',
        'pricing.publish-pricing-change.v1',
      ]),
    );
    expect(countBy(topology.httpRoutes, (route) => route.ownerId)).toEqual({
      control: 46,
      customer: 11,
      ingress: 3,
      orders: 10,
      pricing: 3,
      processor: 11,
      production: 28,
    });
    expect(topology.jobs.map((entry) => entry.operationId)).toEqual([
      'ingress.process-inbound-event.v1',
      'production.apply-fulfillment-demand.v1',
    ]);
  });
});

describe('static artifacts and architecture explain', () => {
  it('renders authentication and bounded HTTP context requirements into static architecture', () => {
    const contextual = declareQueryCell({
      id: 'inventory.list-visible-items.v1',
      authentication: 'required',
      contract: exampleContract,
      surfaces: [
        http.get({
          path: '/visible-items',
          contextRequirements: ['allowed-inventory-location-ids'],
          toSerializedInput: (request) => request.query,
          present,
        }),
      ],
      observability: { operation: 'inventory.list-visible-items' },
    });
    const topology = expectCompiled(
      defineTopology({
        id: 'contextual',
        systems: [
          defineSystem({
            id: 'inventory',
            cells: [
              selectCell({
                manifest: contextual,
                source: {
                  moduleSpecifier: '@fixtures/inventory',
                  manifestExportName: 'listVisibleItemsManifest',
                  assemblyExportName: 'makeInventorySystem',
                  assemblyKey: 'listVisibleItems',
                },
              }),
            ],
          }),
        ],
        experiences: [],
      }),
    );
    const architectureSource = expectResolvedStaticArtifacts(topology).find(
      (artifact) => artifact.path === 'generated/architecture-map.ts',
    )?.content;
    const explained = explainOperation(
      topology,
      'inventory.list-visible-items.v1',
    );

    expect(architectureSource).toContain('"authentication": "required"');
    expect(architectureSource).toContain('"contextRequirements": [');
    expect(architectureSource).toContain('"allowed-inventory-location-ids"');
    expect(explained).toMatchObject({
      kind: 'found',
      explanation: {
        authentication: 'required',
        contextRequirements: ['allowed-inventory-location-ids'],
      },
    });
  });

  it('generates owner-backed event-stream catalogs and browser-safe subscription metadata', () => {
    const topology = expectCompiled(subscriptionTopology());
    const artifacts = expectResolvedStaticArtifacts(topology);
    const eventStreamSource = artifacts.find(
      (artifact) => artifact.path === 'generated/event-stream-catalog.ts',
    )?.content;
    const clientSource = artifacts.find(
      (artifact) => artifact.path === 'generated/clients/operator.ts',
    )?.content;
    const architectureSource = artifacts.find(
      (artifact) => artifact.path === 'generated/architecture-map.ts',
    )?.content;

    expect(eventStreamSource).toContain('defineEventStreamCatalog');
    expect(eventStreamSource).toContain('export type EventStreamCatalogOwners');
    expect(eventStreamSource).toContain(
      'export const makeEventStreamCatalogFromOwners',
    );
    expect(eventStreamSource).toContain(
      'owners["system:inventory"].cells["watchItem"]',
    );
    expect(eventStreamSource).toContain(
      'return makeEventStreamCatalogFromOwners({',
    );
    expect(clientSource).toContain('export const inventoryWatchItemV1');
    expect(clientSource).toContain('eventVersion: 1');
    expect(clientSource).toContain(
      'path: "/locations/:locationId/items/:itemId/events"',
    );
    expect(clientSource).toContain('retryMs: 2500');
    expect(clientSource).toContain('eventTypes: ["ready","changed"]');
    expect(clientSource).not.toContain('@pressly/system-inventory');
    expect(clientSource).not.toContain('@pressly/cells');
    expect(architectureSource).toContain('"kind": "subscription"');
    expect(architectureSource).toContain('"eventStreams"');
  });

  it('includes an Experience-owned event stream without explicit self-use', () => {
    const topology = expectCompiled(
      defineTopology({
        id: 'owned-subscription',
        systems: [],
        experiences: [
          defineExperience({
            id: 'operator',
            cells: [
              selectCell({
                manifest: watchItemManifest,
                source: {
                  moduleSpecifier: '@pressly/experience-operator/server',
                  manifestExportName: 'watchItemManifest',
                  assemblyExportName: 'makeOperatorExperience',
                  assemblyKey: 'watchItem',
                },
              }),
            ],
            uses: [],
          }),
        ],
      }),
    );
    expect(topology.experiences[0]).toEqual({
      id: 'operator',
      operationIds: [],
      clientOperationIds: ['inventory.watch-item.v1'],
      features: [],
    });
    const clientSource = expectResolvedStaticArtifacts(topology).find(
      (artifact) => artifact.path === 'generated/clients/operator.ts',
    )?.content;
    expect(clientSource).toContain('export const inventoryWatchItemV1');
    expect(clientSource).not.toContain('@pressly/experience-operator/server');
    expect(explainOperation(topology, watchItemManifest.id)).toMatchObject({
      kind: 'found',
      explanation: { experienceConsumers: [] },
    });
  });

  it('keeps Experience-owned job-only cells out of browser metadata', () => {
    const rebuildDashboardManifest = declareProcessCell({
      id: 'operator.rebuild-dashboard.v1',
      contract: exampleContract,
      surfaces: [
        job.manual({
          id: 'operator.rebuild-dashboard-job.v1',
          toSerializedInput: (payload) => payload,
          presentFailure: () => ({
            code: 'operator_rebuild_failed',
            message: 'The operator rebuild failed.',
            retryable: false,
          }),
        }),
      ],
      observability: { operation: 'operator.rebuild-dashboard' },
    });
    const topology = expectCompiled(
      defineTopology({
        id: 'owned-job',
        systems: [],
        experiences: [
          defineExperience({
            id: 'operator',
            cells: [
              selectCell({
                manifest: rebuildDashboardManifest,
                source: {
                  moduleSpecifier: '@pressly/experience-operator/server',
                  manifestExportName: 'rebuildDashboardManifest',
                  assemblyExportName: 'makeOperatorExperience',
                  assemblyKey: 'rebuildDashboard',
                },
              }),
            ],
            uses: [],
          }),
        ],
      }),
    );
    expect(topology.experiences[0]?.clientOperationIds).toEqual([]);
    const clientSource = expectResolvedStaticArtifacts(topology).find(
      (artifact) => artifact.path === 'generated/clients/operator.ts',
    )?.content;
    expect(clientSource).not.toContain('operatorRebuildDashboardV1');
  });

  it('renders the same artifacts regardless of topology declaration order', () => {
    const first = expectResolvedStaticArtifacts(
      expectCompiled(validTopology()),
    );
    const second = expectResolvedStaticArtifacts(
      expectCompiled(validTopology(true)),
    );

    expect(second).toEqual(first);
    const httpSource = first.find(
      (artifact) => artifact.path === 'generated/http-catalog.ts',
    )?.content;
    const clientSource = first.find(
      (artifact) => artifact.path === 'generated/clients/operator.ts',
    )?.content;
    expect(httpSource).toContain(
      'import { makeInventorySystem as assemble0 } from "@pressly/system-inventory";',
    );
    expect(httpSource).toContain('export type HttpCatalogOwners');
    expect(httpSource).toContain('export const makeHttpCatalogFromOwners');
    expect(httpSource).toContain(
      'owners["system:inventory"].cells["reserveItem"]',
    );
    expect(clientSource).toContain('export const inventoryLoadItemV1');
    expect(clientSource).toContain('export const inventoryReserveItemV1');
    expect(clientSource).toContain('"reserve": { method: "POST"');
    expect(clientSource).not.toContain('@pressly/system-inventory');
    expect(clientSource).not.toContain('@pressly/cells');
    expect(clientSource).not.toMatch(/(?:node:crypto|@pressly\/db)/u);
    const parseDiagnostics = first.flatMap(
      (artifact) =>
        ts.transpileModule(artifact.content, {
          fileName: artifact.path,
          reportDiagnostics: true,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).diagnostics ?? [],
    );
    expect(parseDiagnostics).toEqual([]);
  });

  it('keeps the registered deployment artifacts fresh and typed', async () => {
    const topology = expectCompiled(presslyTopology);
    expect(countBy(topology.cells, (entry) => entry.ownerId)).toEqual({
      access: 31,
      control: 58,
      customer: 11,
      customers: 5,
      ingress: 15,
      orders: 19,
      pricing: 3,
      processor: 12,
      production: 39,
    });
    const expected = await expectResolvedArtifacts();
    const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
    const current = Object.fromEntries(
      expected.map((artifact) => [
        artifact.path,
        readFileSync(`${repositoryRoot}/${artifact.path}`, 'utf8'),
      ]),
    );

    expect(compareGeneratedArtifacts(expected, current)).toEqual([]);
    const subscription = presslyTopology.systems
      .find((system) => system.id === 'production')
      ?.cells.find(
        (selection) =>
          selection.manifest.id === 'production.subscribe-changes.v1',
      )?.manifest;
    expect(subscription).toBeDefined();
    const streamCatalog = makeEventStreamCatalogFromOwners({
      'system:production': {
        cells: {
          subscribeChanges: subscription,
        },
      } as never,
    });
    expect(streamCatalog.entries).toHaveLength(1);
    expect(streamCatalog.entries[0]?.surface).toMatchObject({
      method: 'GET',
      path: '/production/locations/:locationId/events',
      retryMs: 3000,
      eventTypes: ['ready', 'change', 'resync'],
    });
    const ingress = presslyTopology.systems.find(
      (system) => system.id === 'ingress',
    );
    const processInboundEvent = ingress?.cells.find(
      (selection) =>
        selection.manifest.id === 'ingress.process-inbound-event.v1',
    )?.manifest;
    expect(processInboundEvent).toBeDefined();
    const applyFulfillmentDemand = presslyTopology.systems
      .find((system) => system.id === 'production')
      ?.cells.find(
        (selection) =>
          selection.manifest.id === 'production.apply-fulfillment-demand.v1',
      )?.manifest;
    expect(applyFulfillmentDemand).toBeDefined();
    const jobCatalog = makeJobCatalogFromOwners({
      'system:ingress': {
        cells: { processInboundEvent },
      } as never,
      'system:production': {
        cells: { applyFulfillmentDemand },
      } as never,
    });
    expect(jobCatalog.entries).toHaveLength(2);
    expect(jobCatalog.entries[0]).toMatchObject({
      operationId: 'ingress.process-inbound-event.v1',
      surface: {
        id: 'ingress.process-inbound-event-job.v1',
        trigger: 'message',
        queue: 'webhook_ingestion',
      },
      cell: {
        retry: {
          maxAttempts: 8,
          strategy: 'bounded-exponential-jitter',
          deadLetter: 'retain',
        },
      },
    });
    expect(jobCatalog.entries[1]).toMatchObject({
      operationId: 'production.apply-fulfillment-demand.v1',
      surface: {
        id: 'production.apply-fulfillment-demand-job.v2',
        trigger: 'message',
        queue: 'order_outbox',
      },
      cell: {
        retry: {
          maxAttempts: 8,
          strategy: 'bounded-exponential-jitter',
          deadLetter: 'retain',
        },
      },
    });
    expect(processorClient.experienceId).toBe('processor');
    expect(Object.keys(processorClient.operations)).toEqual([
      'orders.accept-incoming-order-proposal.v1',
      'orders.list-incoming-order-proposals.v1',
      'orders.reject-incoming-order-proposal.v1',
      'orders.restore-incoming-order-proposal.v1',
      'processor.auth-login.v1',
      'processor.complete-mfa-challenge.v1',
      'processor.list-production-history-activity.v1',
      'processor.list-production-order-control.v1',
      'processor.load-auth-session.v1',
      'processor.load-production-board.v1',
      'processor.load-production-history-run.v1',
      'processor.load-production-workspace.v1',
      'processor.load-remaining-day-forecast.v1',
      'processor.logout.v1',
      'processor.preview-production-order-backlog.v1',
      'production.accept-schedule.v1',
      'production.advance-stage.v1',
      'production.assign-stage-machines.v1',
      'production.change-admission.v1',
      'production.change-order-resolution.v1',
      'production.commit-order-backlog.v1',
      'production.commit-order-route.v1',
      'production.confirm-order-overtime.v1',
      'production.create-schedule.v1',
      'production.create-shift.v1',
      'production.freeze-batch-membership.v1',
      'production.list-history-plans.v1',
      'production.list-history-runs.v1',
      'production.list-locations.v1',
      'production.list-orders.v1',
      'production.load-schedule.v1',
      'production.place-order-automatically.v1',
      'production.place-order-exactly.v1',
      'production.preview-order-route.v1',
      'production.publish-scheduler-config.v1',
      'production.reconcile-batch-progress.v1',
      'production.record-order-intake.v1',
      'production.replace-shift-selection.v1',
      'production.set-order-priority.v1',
      'production.start-schedule.v1',
      'production.subscribe-changes.v1',
      'production.unfreeze-batch-membership.v1',
      'production.update-shift.v1',
    ]);
    expect(processorClient.operations['production.accept-schedule.v1']).toBe(
      productionAcceptScheduleV1,
    );
    expect(processorClient.operations['production.advance-stage.v1']).toBe(
      productionAdvanceStageV1,
    );
    expect(processorClient.operations['production.create-schedule.v1']).toBe(
      productionCreateScheduleV1,
    );
    expect(processorClient.operations['production.start-schedule.v1']).toBe(
      productionStartScheduleV1,
    );
    expect(
      processorClient.operations['production.replace-shift-selection.v1'],
    ).toBe(productionReplaceShiftSelectionV1);
    expect(
      processorClient.operations['production.place-order-automatically.v1'],
    ).toBe(productionPlaceOrderAutomaticallyV1);
    expect(
      processorClient.operations['production.place-order-exactly.v1'],
    ).toBe(productionPlaceOrderExactlyV1);
    expect(
      processorClient.operations['production.confirm-order-overtime.v1'],
    ).toBe(productionConfirmOrderOvertimeV1);
    expect(productionAcceptScheduleV1).toEqual({
      operationId: 'production.accept-schedule.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        accept: {
          method: 'POST',
          path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
        },
      },
    });
    expect(productionAdvanceStageV1).toEqual({
      operationId: 'production.advance-stage.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        complete: {
          method: 'POST',
          path: '/production/locations/:locationId/stages/:stageRunId/complete',
        },
        start: {
          method: 'POST',
          path: '/production/locations/:locationId/stages/:stageRunId/start',
        },
      },
    });
    expect(productionAssignStageMachinesV1).toEqual({
      operationId: 'production.assign-stage-machines.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        machines: {
          method: 'PUT',
          path: '/production/locations/:locationId/stages/:stageRunId/machines',
        },
      },
    });
    expect(productionChangeAdmissionV1).toEqual({
      operationId: 'production.change-admission.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        admission: {
          method: 'PUT',
          path: '/production/locations/:locationId/orders/:productionOrderId/admission',
        },
      },
    });
    expect(productionChangeOrderResolutionV1).toEqual({
      operationId: 'production.change-order-resolution.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        resolution: {
          method: 'PUT',
          path: '/production/locations/:locationId/orders/:productionOrderId/resolution',
        },
      },
    });
    expect(productionCommitOrderBacklogV1).toEqual({
      operationId: 'production.commit-order-backlog.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        'order-backlog': {
          method: 'POST',
          path: '/production/locations/:locationId/order-backlog',
        },
      },
    });
    expect(productionCommitOrderRouteV1).toEqual({
      operationId: 'production.commit-order-route.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        route: {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route',
        },
      },
    });
    expect(productionCreateShiftV1).toEqual({
      operationId: 'production.create-shift.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        shifts: {
          method: 'POST',
          path: '/production/locations/:locationId/shifts',
        },
      },
    });
    expect(productionStartScheduleV1).toEqual({
      operationId: 'production.start-schedule.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        start: {
          method: 'POST',
          path: '/production/locations/:locationId/schedules/:scheduleRunId/start',
        },
      },
    });
    expect(productionFreezeBatchMembershipV1).toEqual({
      operationId: 'production.freeze-batch-membership.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        freeze: {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
        },
      },
    });
    expect(productionSetOrderPriorityV1).toEqual({
      operationId: 'production.set-order-priority.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        priority: {
          method: 'PATCH',
          path: '/production/locations/:locationId/orders/:productionOrderId/priority',
        },
      },
    });
    expect(productionListHistoryPlansV1).toEqual({
      operationId: 'production.list-history-plans.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        plans: {
          method: 'GET',
          path: '/production/locations/:locationId/history/plans',
        },
      },
    });
    expect(productionListHistoryRunsV1).toEqual({
      operationId: 'production.list-history-runs.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        runs: {
          method: 'GET',
          path: '/production/locations/:locationId/history/runs',
        },
      },
    });
    expect(productionListLocationsV1).toEqual({
      operationId: 'production.list-locations.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        locations: {
          method: 'GET',
          path: '/production/locations',
        },
      },
    });
    expect(productionListOrdersV1).toEqual({
      operationId: 'production.list-orders.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        orders: {
          method: 'GET',
          path: '/production/locations/:locationId/orders',
        },
      },
    });
    expect(productionLoadScheduleV1).toEqual({
      operationId: 'production.load-schedule.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        request: {
          method: 'GET',
          path: '/production/locations/:locationId/schedules/:scheduleRunId',
        },
      },
    });
    expect(productionPreviewOrderRouteV1).toEqual({
      operationId: 'production.preview-order-route.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        preview: {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
        },
      },
    });
    expect(productionPublishSchedulerConfigV1).toEqual({
      operationId: 'production.publish-scheduler-config.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        'scheduler-configs': {
          method: 'POST',
          path: '/production/locations/:locationId/scheduler-configs',
        },
      },
    });
    expect(productionReconcileBatchProgressV1).toEqual({
      operationId: 'production.reconcile-batch-progress.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        'progress-reconciliation': {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
        },
      },
    });
    expect(productionRecordOrderIntakeV1).toEqual({
      operationId: 'production.record-order-intake.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        intake: {
          method: 'PUT',
          path: '/production/locations/:locationId/orders/:productionOrderId/intake',
        },
      },
    });
    expect(productionSubscribeChangesV1).toEqual({
      operationId: 'production.subscribe-changes.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
        eventVersion: 1,
      },
      eventStream: {
        method: 'GET',
        path: '/production/locations/:locationId/events',
        retryMs: 3000,
        eventTypes: ['ready', 'change', 'resync'],
      },
      http: {},
    });
    expect(productionUnfreezeBatchMembershipV1).toEqual({
      operationId: 'production.unfreeze-batch-membership.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        unfreeze: {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
        },
      },
    });
    expect(productionUpdateShiftV1).toEqual({
      operationId: 'production.update-shift.v1',
      contract: {
        inputVersion: 1,
        outputVersion: 1,
        failureVersion: 1,
      },
      http: {
        request: {
          method: 'PATCH',
          path: '/production/locations/:locationId/shifts/:productionShiftId',
        },
      },
    });
    expect(architectureMap.features).toHaveLength(18);
    expect(architectureMap.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'customer.web.order-entry',
          experience: 'customer',
          path: 'experiences/customer/src/web/features/order-entry/feature.ts',
          uses: [],
          componentProofs: [
            'experiences/customer/src/web/features/order-entry/SchedulePickupButton.test.tsx',
          ],
        }),
        expect.objectContaining({
          id: 'processor.production-board',
          experience: 'processor',
          uses: expect.arrayContaining(['production.advance-stage.v1']),
        }),
      ]),
    );
    expect(architectureMap.operations).toHaveLength(193);
    const operationsById = Object.fromEntries(
      architectureMap.operations.map((operation) => [operation.id, operation]),
    );
    const ingressOperations = [
      ['ingress.capture-webhook-receipt.v1', 'command'],
      ['ingress.claim-events.v1', 'command'],
      ['ingress.complete-event.v1', 'command'],
      ['ingress.dead-letter-event.v1', 'command'],
      ['ingress.ingest-event.v1', 'command'],
      ['ingress.link-webhook-receipt.v1', 'command'],
      ['ingress.list-dead-events.v1', 'query'],
      ['ingress.measure-webhook-backlog.v1', 'query'],
      ['ingress.process-inbound-event.v1', 'reaction'],
      ['ingress.purge-expired-webhook-receipts.v1', 'command'],
      ['ingress.receive-cents-webhook.v1', 'command'],
      ['ingress.reconcile-source-location-bindings.v1', 'command'],
      ['ingress.replay-dead-event.v1', 'command'],
      ['ingress.resolve-source-location.v1', 'query'],
      ['ingress.retry-event.v1', 'command'],
    ] as const;
    for (const [id, kind] of ingressOperations)
      expect(operationsById[id]).toMatchObject({
        id,
        kind,
        owner: 'ingress',
        ownerKind: 'system',
        experienceConsumers: [],
        eventStreams: [],
      });
    for (const [id] of ingressOperations.filter(
      ([operationId]) =>
        operationId !== 'ingress.list-dead-events.v1' &&
        operationId !== 'ingress.receive-cents-webhook.v1' &&
        operationId !== 'ingress.replay-dead-event.v1',
    ))
      expect(operationsById[id]).toMatchObject({
        authentication: 'none',
        http: [],
      });
    expect(operationsById['ingress.list-dead-events.v1']).toMatchObject({
      authentication: 'required',
      http: [
        {
          method: 'GET',
          path: '/webhook-ingestion/dead-letters',
          boundaryProfile: 'api-ingress-dead-event-read-v1',
        },
      ],
    });
    expect(operationsById['ingress.receive-cents-webhook.v1']).toMatchObject({
      authentication: 'required',
      http: [
        {
          method: 'POST',
          path: '/webhooks/cents',
          boundaryProfile: 'api-cents-webhook-v1',
        },
      ],
    });
    expect(operationsById['ingress.replay-dead-event.v1']).toMatchObject({
      authentication: 'required',
      http: [
        {
          method: 'POST',
          path: '/webhook-ingestion/dead-letters/:eventId/replay',
          boundaryProfile: 'api-ingress-dead-event-replay-v1',
        },
      ],
    });
    expect(operationsById['ingress.ingest-event.v1']).toMatchObject({
      emits: ['ingress.webhook-event-ready.v1'],
      consumes: [],
      jobs: [],
    });
    expect(operationsById['ingress.process-inbound-event.v1']).toMatchObject({
      consumes: ['ingress.webhook-event-ready.v1'],
      emits: [],
      jobs: [
        {
          id: 'ingress.process-inbound-event-job.v1',
          trigger: 'message',
        },
      ],
    });
    const ordersOperations = [
      'orders.claim-order-outbox.v1',
      'orders.close-incoming-order-source.v1',
      'orders.complete-order-outbox.v1',
      'orders.dead-letter-order-outbox.v1',
      'orders.measure-order-outbox-backlog.v1',
      'orders.propose-incoming-order.v1',
      'orders.retry-order-outbox.v1',
    ] as const;
    for (const id of ordersOperations)
      expect(operationsById[id]).toMatchObject({
        id,
        authentication: 'none',
        owner: 'orders',
        ownerKind: 'system',
        experienceConsumers: [],
        http: [],
        eventStreams: [],
        jobs: [],
      });
    expect(
      operationsById['production.resolve-source-closed-fulfillment.v1'],
    ).toMatchObject({
      id: 'production.resolve-source-closed-fulfillment.v1',
      authentication: 'none',
      kind: 'command',
      owner: 'production',
      ownerKind: 'system',
      experienceConsumers: [],
      http: [],
      eventStreams: [],
      jobs: [],
    });
    const finiteOperations = [
      ['production.accept-schedule.v1', 'command'],
      ['production.advance-stage.v1', 'command'],
      ['production.assign-stage-machines.v1', 'command'],
      ['production.change-admission.v1', 'command'],
      ['production.change-order-resolution.v1', 'command'],
      ['production.commit-order-backlog.v1', 'command'],
      ['production.commit-order-route.v1', 'command'],
      ['production.confirm-order-overtime.v1', 'command'],
      ['production.create-schedule.v1', 'command'],
      ['production.create-shift.v1', 'command'],
      ['production.freeze-batch-membership.v1', 'command'],
      ['production.list-history-plans.v1', 'query'],
      ['production.list-history-runs.v1', 'query'],
      ['production.list-locations.v1', 'query'],
      ['production.list-orders.v1', 'query'],
      ['production.load-schedule.v1', 'query'],
      ['production.place-order-automatically.v1', 'command'],
      ['production.place-order-exactly.v1', 'command'],
      ['production.preview-order-route.v1', 'query'],
      ['production.publish-scheduler-config.v1', 'command'],
      ['production.reconcile-batch-progress.v1', 'command'],
      ['production.record-order-intake.v1', 'command'],
      ['production.set-order-priority.v1', 'command'],
      ['production.start-schedule.v1', 'command'],
      ['production.unfreeze-batch-membership.v1', 'command'],
      ['production.update-shift.v1', 'command'],
    ] as const;
    for (const [id, kind] of finiteOperations)
      expect(operationsById[id]).toMatchObject({
        id,
        authentication: 'required',
        kind,
        owner: 'production',
        ownerKind: 'system',
        experienceConsumers: ['processor'],
      });
    expect(
      operationsById['production.apply-fulfillment-demand.v1'],
    ).toMatchObject({
      id: 'production.apply-fulfillment-demand.v1',
      authentication: 'none',
      kind: 'reaction',
      owner: 'production',
      ownerKind: 'system',
      experienceConsumers: [],
      jobs: [
        {
          id: 'production.apply-fulfillment-demand-job.v2',
          trigger: 'message',
        },
      ],
      consumes: ['fulfillment_demand_changed.v2'],
    });
    expect(
      Object.isFrozen(
        operationsById['production.advance-stage.v1']?.http[0]
          ?.contextRequirements,
      ),
    ).toBe(true);
    expect(operationsById['production.subscribe-changes.v1']).toMatchObject({
      id: 'production.subscribe-changes.v1',
      authentication: 'required',
      kind: 'subscription',
      owner: 'production',
      ownerKind: 'system',
      experienceConsumers: ['processor'],
      eventStreams: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/events',
          retryMs: 3000,
          eventTypes: ['ready', 'change', 'resync'],
        },
      ],
    });

    const httpCatalog = expected.find(
      (artifact) => artifact.path === 'generated/http-catalog.ts',
    )?.content;
    const processorClientSource = expected.find(
      (artifact) => artifact.path === 'generated/clients/processor.ts',
    )?.content;
    expect(httpCatalog).toContain(
      "import { makeProcessorExperience as assemble2 } from '@pressly/experience-processor/server';",
    );
    expect(httpCatalog).toContain(
      "import { makeProductionSystem as assemble6 } from '@pressly/production-system';",
    );
    expect(httpCatalog).toContain(
      "'experience:processor': Parameters<typeof assemble2>;",
    );
    expect(httpCatalog).toContain(
      "'system:production': Parameters<typeof assemble6>;",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['listHistoryActivity']",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['listOrderControl']",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['loadBoard']",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['loadHistoryRun']",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['loadWorkspace']",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['loadRemainingDayForecast']",
    );
    expect(httpCatalog).toContain(
      "owners['experience:processor'].cells['previewOrderBacklog']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['acceptSchedule']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['advanceStage']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['assignStageMachines']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['changeAdmission']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['changeOrderResolution']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['commitOrderBacklog']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['commitOrderRoute']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['createShift']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['freezeBatchMembership']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['listHistoryPlans']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['listHistoryRuns']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['listLocations']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['listOrders']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['loadSchedule']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['previewOrderRoute']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['publishSchedulerConfig']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['reconcileBatchProgress']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['recordOrderIntake']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['setOrderPriority']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['unfreezeBatchMembership']",
    );
    expect(httpCatalog).toContain(
      "owners['system:production'].cells['updateShift']",
    );
    expect(processorClientSource).not.toMatch(
      /@pressly\/(?:production-system|db)|node:crypto|makeExecuteAdvanceStage/u,
    );
  });

  it('selects Processor HTTP owners while keeping their Production dependencies headless', () => {
    const processorOperations = [
      processorListProductionHistoryActivityV1,
      processorListProductionOrderControlV1,
      processorLoadProductionBoardV1,
      processorLoadProductionHistoryRunV1,
      processorLoadProductionWorkspaceV1,
      processorLoadRemainingDayForecastV1,
      processorPreviewProductionOrderBacklogV1,
    ];
    expect(processorOperations).toEqual([
      {
        operationId: 'processor.list-production-history-activity.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          activity: {
            method: 'GET',
            path: '/production/locations/:locationId/history/activity',
          },
        },
      },
      {
        operationId: 'processor.list-production-order-control.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          'order-control': {
            method: 'GET',
            path: '/production/locations/:locationId/order-control',
          },
        },
      },
      {
        operationId: 'processor.load-production-board.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          board: {
            method: 'GET',
            path: '/production/locations/:locationId/runs/:productionRunId/board',
          },
        },
      },
      {
        operationId: 'processor.load-production-history-run.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          request: {
            method: 'GET',
            path: '/production/locations/:locationId/history/runs/:productionRunId',
          },
        },
      },
      {
        operationId: 'processor.load-production-workspace.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          workspace: {
            method: 'GET',
            path: '/production/locations/:locationId/workspace',
          },
        },
      },
      {
        operationId: 'processor.load-remaining-day-forecast.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          forecast: {
            method: 'GET',
            path: '/production/locations/:locationId/forecast',
          },
        },
      },
      {
        operationId: 'processor.preview-production-order-backlog.v1',
        contract: { inputVersion: 1, outputVersion: 1, failureVersion: 1 },
        http: {
          preview: {
            method: 'POST',
            path: '/production/locations/:locationId/order-backlog/preview',
          },
        },
      },
    ]);

    const operationsById = new Map(
      architectureMap.operations.map((operation) => [operation.id, operation]),
    );
    for (const operation of processorOperations)
      expect(operationsById.get(operation.operationId)).toMatchObject({
        id: operation.operationId,
        owner: 'processor',
        ownerKind: 'experience',
        authentication: 'required',
        experienceConsumers: ['processor'],
        http: [expect.any(Object)],
      });

    const headlessDependencies = [
      'production.list-history-activity.v1',
      'production.list-order-control.v1',
      'production.load-board.v1',
      'production.load-history-run.v1',
      'production.load-remaining-day-forecast.v1',
      'production.load-workspace.v1',
      'production.preview-order-backlog.v1',
    ] as const;
    for (const operationId of headlessDependencies) {
      expect(operationsById.get(operationId)).toMatchObject({
        id: operationId,
        owner: 'production',
        ownerKind: 'system',
        experienceConsumers: ['processor'],
        http: [],
      });
      expect(processorClient.operations).not.toHaveProperty(operationId);
    }
  });

  it('writes deterministic artifacts and reports filesystem staleness', async () => {
    const expected = await expectResolvedArtifacts();
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'pressly-topology-'));
    try {
      expect(writeGeneratedArtifacts(temporaryRoot, expected)).toEqual(
        expected.map((artifact) => artifact.path),
      );
      expect(checkGeneratedArtifacts(temporaryRoot, expected)).toEqual([]);

      const first = expected[0];
      expect(first).toBeDefined();
      if (first === undefined) return;
      writeFileSync(path.join(temporaryRoot, first.path), 'stale', 'utf8');
      expect(checkGeneratedArtifacts(temporaryRoot, expected)).toContainEqual({
        path: first.path,
        reason: 'stale',
      });

      const staleClient = path.join(
        temporaryRoot,
        'generated/clients/stale.ts',
      );
      writeFileSync(staleClient, 'stale client', 'utf8');
      expect(checkGeneratedArtifacts(temporaryRoot, expected)).toContainEqual({
        path: 'generated/clients/stale.ts',
        reason: 'unexpected',
      });

      const handwrittenRuntimeTest = path.join(
        temporaryRoot,
        'generated/runtime/test/handwritten.test.ts',
      );
      mkdirSync(path.dirname(handwrittenRuntimeTest), { recursive: true });
      writeFileSync(handwrittenRuntimeTest, 'handwritten test', 'utf8');
      expect(checkGeneratedArtifacts(temporaryRoot, expected)).toContainEqual({
        path: 'generated/runtime/test/handwritten.test.ts',
        reason: 'unexpected',
      });
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('explains one operation from compiled source evidence', () => {
    const topology = expectCompiled(validTopology());
    const result = explainOperation(topology, reserveItem.id);
    expect(result.kind).toBe('found');
    if (result.kind === 'not-found') return;

    expect(result.explanation).toMatchObject({
      operationId: 'inventory.reserve-item.v1',
      authentication: 'required',
      owner: 'system:inventory',
      authorization: 'inventory.reserve (before-input)',
      emits: ['inventory.item-reserved.v1'],
      experienceConsumers: ['operator'],
    });
    expect(formatArchitectureExplanation(result.explanation)).toContain(
      'POST /locations/:locationId/items/:itemId/reserve',
    );
  });

  it('explains subscription kind and event-stream transport metadata', () => {
    const topology = expectCompiled(subscriptionTopology());
    const result = explainOperation(topology, watchItemManifest.id);
    expect(result.kind).toBe('found');
    if (result.kind === 'not-found') return;

    expect(result.explanation).toMatchObject({
      operationId: 'inventory.watch-item.v1',
      kind: 'subscription',
      authentication: 'required',
      eventStreams: [
        'GET /locations/:locationId/items/:itemId/events (retry 2500ms; events: ready, changed)',
      ],
      http: [],
      jobs: [],
    });
    expect(formatArchitectureExplanation(result.explanation)).toContain(
      'Event streams\n  GET /locations/:locationId/items/:itemId/events',
    );
  });

  it('explains the registered Production operation and Processor consumer', () => {
    const topology = expectCompiled(presslyTopology);
    const evidence = resolveRepositoryOperationEvidence(
      topology,
      presslyRepositoryRoot,
    );
    expect(evidence.kind).toBe('resolved');
    if (evidence.kind === 'invalid') return;

    const result = explainOperation(
      topology,
      'production.advance-stage.v1',
      evidence.operations,
    );
    expect(result.kind).toBe('found');
    if (result.kind === 'not-found') return;

    expect(result.explanation).toMatchObject({
      operationId: 'production.advance-stage.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'system:production',
      source:
        '@pressly/production-system#advanceStageCellDeclaration -> makeProductionSystem().cells["advanceStage"]',
      authorization: 'production:stage (before-input)',
      consistency: [
        'transaction: required',
        'concurrency: optimistic',
        'idempotency: required',
      ],
      contextRequirements: ['authenticated-actor'],
      cli: [],
      eventStreams: [],
      http: [
        'POST /production/locations/:locationId/stages/:stageRunId/start',
        'POST /production/locations/:locationId/stages/:stageRunId/complete',
      ],
      jobs: [],
      emits: [],
      consumes: [],
      consumers: ['processor (experience)'],
      experienceConsumers: ['processor'],
      experienceFeatures: [
        {
          id: 'processor.production-board',
          experience: 'processor',
          path: 'experiences/processor/src/features/production-board/feature.ts',
          uses: expect.arrayContaining(['production.advance-stage.v1']),
          stateProofs: [
            'experiences/processor/src/features/production-board/production-board.test.tsx',
          ],
          componentProofs: [
            'experiences/processor/src/features/production-board/production-board.test.tsx',
          ],
        },
      ],
      protocols: [
        'http: POST /production/locations/:locationId/stages/:stageRunId/complete',
        'http: POST /production/locations/:locationId/stages/:stageRunId/start',
      ],
      observability: 'production.advance_stage',
    });
    expect(result.explanation.paths).toMatchObject({
      cell: 'systems/production/src/cells/floor/advance-stage/cell.ts',
      decisions: expect.arrayContaining([
        'systems/production/src/cells/floor/advance-stage/decide.ts',
      ]),
      executors: expect.arrayContaining([
        'systems/production/src/cells/floor/advance-stage/execute.ts',
      ]),
      persistence: expect.arrayContaining([
        'systems/production/src/cells/floor/advance-stage/postgres.ts',
      ]),
      tests: expect.arrayContaining([
        'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
      ]),
      features: [expect.objectContaining({ id: 'processor.production-board' })],
    });
    const formatted = formatArchitectureExplanation(result.explanation);
    expect(formatted).toContain('Experience consumers\n  processor');
    expect(formatted).toContain('Consumers\n  processor (experience)');
    expect(formatted).toContain(
      'Experience features\n  processor.production-board (processor)',
    );
    expect(formatted).toContain(
      'component proof: experiences/processor/src/features/production-board/production-board.test.tsx',
    );
    expect(formatted).toContain(
      'Repository paths\n  cell: systems/production/src/cells/floor/advance-stage/cell.ts',
    );
  });
});
