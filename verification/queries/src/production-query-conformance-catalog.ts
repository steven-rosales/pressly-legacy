export type QueryConformanceRoute = Readonly<{
  method: 'GET' | 'POST';
  path: string;
  capability:
    | 'authentication-required'
    | 'production:override'
    | 'production:read'
    | 'production:stage';
}>;

export type QueryConformanceEvidence = Readonly<{
  contractTests: readonly string[];
  behaviorTests: readonly string[];
  postgresTests: readonly string[];
}>;

export type QueryConformanceSourceAnchor = Readonly<{
  file: string;
  contains: readonly string[];
}>;

export type QueryConformanceCapability =
  | 'bound-cursor-codec'
  | 'canonical-hash'
  | 'clock-as-of'
  | 'location-authorization-scope'
  | 'operational-order-identity'
  | 'production-rules'
  | 'read-only-repeatable-read'
  | 'scheduler-projection';

export type ProductionQueryConformance = Readonly<{
  operationId: string;
  boundarySource: string;
  route: QueryConformanceRoute;
  selectedHttpOwner: 'processor-experience' | 'production-system';
  systemSurface: 'headless' | 'http';
  requestSchemas: readonly string[];
  resultSchema: string;
  filters: readonly string[];
  ordering: string;
  cursor: string;
  asOf: string;
  sqlSemantics: readonly string[];
  fallbackIdentity: string;
  requiredCapabilities: readonly QueryConformanceCapability[];
  evidence: QueryConformanceEvidence;
  sourceAnchors: readonly QueryConformanceSourceAnchor[];
}>;

export type ProcessorProjectionRoute = Readonly<{
  operationId: string;
  processorOperationId: string;
  route: QueryConformanceRoute;
  responseSchema: string;
  identitySelection: string;
}>;

const readRoute = (path: string): QueryConformanceRoute => ({
  method: 'GET',
  path,
  capability: 'production:read',
});

export const productionQueryConformanceCatalog: readonly ProductionQueryConformance[] =
  Object.freeze([
    {
      operationId: 'production.preview-order-backlog.v1',
      boundarySource:
        'experiences/processor/src/cells/production/preview-production-order-backlog/contract.ts',
      route: {
        method: 'POST',
        path: '/production/locations/:locationId/order-backlog/preview',
        capability: 'production:override',
      },
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: [
        'productionLocationParamsSchema',
        'previewProductionOrderBacklogRequestSchema',
      ],
      resultSchema: 'processorProductionOrderBacklogPreviewSchema',
      filters: [
        "filter is the literal 'all_due_before_cutoff'",
        'cutoff and reason are cursor-bound scope',
        'cursor defaults to null',
        'maxOrders defaults to and is capped at 250',
      ],
      ordering: 'due_at ASC, production_order_id ASC',
      cursor:
        'Version-1 checksum-protected cursor bound to locationId, filter, cutoff, and reason; point is dueAt plus orderId.',
      asOf: 'generatedAt is the one injected clock value observed after the snapshot read.',
      sqlSemantics: [
        'Includes every location order due_at <= cutoff, including already resolved rows.',
        'Reads intake, admission, priority, placement, shift-selection, batch, stage-attempt, and route evidence before pure safety classification.',
        'Reads maxOrders + 1 rows and hashes the complete classified snapshot with the version-2 canonical preview payload.',
      ],
      fallbackIdentity:
        'Processor resolves each of the four result groups by production order id; missing canonical data keeps displayReference as displayNumber, customerDisplayName null, and canonical null.',
      requiredCapabilities: [
        'bound-cursor-codec',
        'canonical-hash',
        'clock-as-of',
        'operational-order-identity',
        'production-rules',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/demand/preview-order-backlog/contract.spec.ts',
          'systems/production/src/read-models/production-order-backlog/cursor.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/demand/preview-order-backlog/execute.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/demand/preview-order-backlog/postgres.int.spec.ts',
          'verification/queries/test/preview-order-backlog.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'experiences/processor/src/cells/production/preview-production-order-backlog/contract.ts',
          contains: [
            "'processor.preview-production-order-backlog.v1'",
            'previewProductionOrderBacklogRequestSchema',
            'processorProductionOrderBacklogPreviewSchema',
          ],
        },
        {
          file: 'experiences/processor/src/cells/production/preview-production-order-backlog/execute.ts',
          contains: [
            'dependencies.previewBacklog(input)',
            'resolveOperationalOrders(',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'previewOrderBacklog: (input) => production.previewOrderBacklog.execute(input)',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
        {
          file: 'systems/production/src/read-models/production-order-backlog/postgres.ts',
          contains: [
            'lte(schema.productionOrders.dueAt, input.cutoff)',
            'asc(schema.productionOrders.dueAt)',
            'asc(schema.productionOrders.id)',
            '.limit(input.maxOrders + 1)',
          ],
        },
        {
          file: 'systems/production/src/read-models/production-order-backlog/cursor.ts',
          contains: [
            'pressly:production-order-backlog-cursor:v1',
            'point.locationId === scope.locationId',
            'point.cutoff === scope.cutoff',
          ],
        },
      ],
    },
    {
      operationId: 'production.list-history-activity.v1',
      boundarySource:
        'experiences/processor/src/cells/history/list-production-history-activity/contract.ts',
      route: readRoute('/production/locations/:locationId/history/activity'),
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: [
        'productionHistoryLocationParamsSchema',
        'listProductionHistoryActivityQuerySchema',
      ],
      resultSchema: 'processorListProductionHistoryActivityResultSchema',
      filters: [
        'limit defaults to 50 and is capped at 100',
        'runId, entityType, eventType, orderResolution, trimmed search, and inclusive occurredAfter are optional',
        'occurredAfter crosses the HTTP boundary as one Date',
      ],
      ordering: 'work_event.created_at DESC, work_event.id DESC',
      cursor:
        'Version-2 activity cursor bound to every filter; exact PostgreSQL six-digit createdAtKey plus UUID avoids JavaScript timestamp precision loss.',
      asOf: 'One injected now is returned from the same repeatable-read snapshot as the page.',
      sqlSemantics: [
        'Reads only the declared production-history event allowlist for one location.',
        'Run scope resolves direct and related order/batch/stage events; orderResolution maps archived to the two archive event kinds and restored to production_order_restored.',
        'Search covers event type, entity type, entity UUID, and actor display name.',
      ],
      fallbackIdentity:
        'Processor resolves only production_order events, keyed by production order id; because activity has no display reference, fallback displayNumber is the entity UUID.',
      requiredCapabilities: [
        'bound-cursor-codec',
        'clock-as-of',
        'operational-order-identity',
        'read-only-repeatable-read',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/history/list-activity/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/history/list-activity/execute.spec.ts',
          'systems/production/src/cells/history/list-activity/project.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/history/list-activity/postgres.int.spec.ts',
          'verification/queries/test/list-history-activity.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/history/list-activity/postgres.ts',
          contains: [
            'desc(schema.workEvents.createdAt)',
            'desc(schema.workEvents.id)',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'experiences/processor/src/cells/history/list-production-history-activity/contract.ts',
          contains: ["'processor.list-production-history-activity.v1'"],
        },
        {
          file: 'experiences/processor/src/cells/history/list-production-history-activity/execute.ts',
          contains: [
            "item.entityType !== 'production_order'",
            'productionOrderReferenceId(item.entityId)',
            'fallbackDisplayNumber: item.entityId',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'listHistoryActivity: (input) => production.listHistoryActivity.execute({',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
      ],
    },
    {
      operationId: 'production.list-history-plans.v1',
      boundarySource:
        'systems/production/src/cells/history/list-plans/contract.ts',
      route: readRoute('/production/locations/:locationId/history/plans'),
      selectedHttpOwner: 'production-system',
      systemSurface: 'http',
      requestSchemas: [
        'productionHistoryLocationParamsSchema',
        'listProductionHistoryPlansQuerySchema',
      ],
      resultSchema: 'listProductionHistoryPlansResultSchema',
      filters: [
        'limit defaults to 50 and is capped at 100',
        'runId, trimmed search, schedule status, and inclusive createdAfter are optional',
      ],
      ordering: 'schedule_run.created_at DESC, schedule_run.id DESC',
      cursor:
        'Version-2 plans cursor bound to runId, search, status, and createdAfter; exact six-digit createdAtKey plus UUID.',
      asOf: 'One injected now is returned from the same repeatable-read snapshot as the page.',
      sqlSemantics: [
        'Left joins the execution run so runId and search can address the resulting production run.',
        'Search covers schedule, shift, scheduler-config, production-run IDs and algorithm version.',
        'Returns limit + 1 and maps the last emitted row into the next cursor.',
      ],
      fallbackIdentity: 'No order identity is present on a plan summary.',
      requiredCapabilities: [
        'bound-cursor-codec',
        'clock-as-of',
        'read-only-repeatable-read',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/history/list-plans/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/history/list-plans/execute.spec.ts',
          'systems/production/src/cells/history/list-plans/http.spec.ts',
          'systems/production/src/cells/history/list-plans/project.spec.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/history/list-plans/postgres.int.spec.ts',
          'verification/queries/test/list-history-plans.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/history/list-plans/postgres.ts',
          contains: [
            'desc(schema.scheduleRuns.createdAt)',
            'desc(schema.scheduleRuns.id)',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'systems/production/src/cells/history/list-plans/cursor.ts',
          contains: [
            'version: 2',
            "kind: 'plans'",
            'createdAfter: input.createdAfter?.toISOString() ?? null',
          ],
        },
      ],
    },
    {
      operationId: 'production.list-history-runs.v1',
      boundarySource:
        'systems/production/src/cells/history/list-runs/contract.ts',
      route: readRoute('/production/locations/:locationId/history/runs'),
      selectedHttpOwner: 'production-system',
      systemSurface: 'http',
      requestSchemas: [
        'productionHistoryLocationParamsSchema',
        'listProductionHistoryRunsQuerySchema',
      ],
      resultSchema: 'listProductionHistoryRunsResultSchema',
      filters: [
        'limit defaults to 50 and is capped at 100',
        'trimmed search, started/completed status, and inclusive createdAfter are optional',
      ],
      ordering: 'production_run.created_at DESC, production_run.id DESC',
      cursor:
        'Version-2 runs cursor bound to search, status, and createdAfter; exact six-digit createdAtKey plus UUID.',
      asOf: 'One injected now is returned from the same repeatable-read snapshot as the page and its aggregate statistics.',
      sqlSemantics: [
        'Requires a location and inner-joins its shift.',
        'Search covers production-run, shift, and schedule UUIDs.',
        'Loads batch/order statistics for only the emitted page inside the same read-only snapshot.',
      ],
      fallbackIdentity: 'No order identity is present on a run summary.',
      requiredCapabilities: [
        'bound-cursor-codec',
        'clock-as-of',
        'read-only-repeatable-read',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/history/list-runs/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/history/list-runs/execute.spec.ts',
          'systems/production/src/cells/history/list-runs/http.spec.ts',
          'systems/production/src/cells/history/list-runs/project.spec.ts',
          'systems/production/src/cells/history/list-runs/cursor.spec.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/history/list-runs/postgres.int.spec.ts',
          'verification/queries/test/production-queries.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/history/list-runs/postgres.ts',
          contains: [
            'desc(schema.productionRuns.createdAt)',
            'desc(schema.productionRuns.id)',
            'loadStatistics',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'systems/production/src/cells/history/list-runs/cursor.ts',
          contains: [
            'version: 2',
            "kind: 'runs'",
            'createdAfter: input.createdAfter?.toISOString() ?? null',
          ],
        },
      ],
    },
    {
      operationId: 'production.load-history-run.v1',
      boundarySource:
        'experiences/processor/src/cells/history/load-production-history-run/contract.ts',
      route: readRoute(
        '/production/locations/:locationId/history/runs/:productionRunId',
      ),
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: ['productionHistoryRunParamsSchema'],
      resultSchema: 'processorProductionHistoryRunDetailSchema',
      filters: ['Exact locationId plus productionRunId identity only.'],
      ordering:
        'batches by sequence; memberships by sequence, placedAt, id; stages by sequence, plannedStartAt; plans and activity newest-first by createdAt then id.',
      cursor:
        'No page cursor. Embedded activity is hard-bounded at 100 items with a hasMore flag from a 101-row read.',
      asOf: 'One injected now is returned from the same repeatable-read snapshot as overview, lineage, batches, memberships, stages, activity, and statistics.',
      sqlSemantics: [
        'Distinguishes location_not_found from run_not_found.',
        'Preserves both current and released membership episodes and counts current versus historical membership separately.',
        'Loads schedule revisions for the run shift and scopes related activity through productionHistoryRunScope.',
      ],
      fallbackIdentity:
        'Processor resolves each membership by production order id and falls back to its externalOrderId; repeated membership episodes reuse the same deduplicated identity.',
      requiredCapabilities: [
        'clock-as-of',
        'operational-order-identity',
        'read-only-repeatable-read',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/history/load-run/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/history/load-run/execute.spec.ts',
          'systems/production/src/cells/history/load-run/project.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/history/load-run/postgres.int.spec.ts',
          'verification/queries/test/load-history-run.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/history/load-run/postgres.ts',
          contains: [
            '.limit(101)',
            'activityRows.slice(0, 100)',
            'hasMore: activityRows.length > 100',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'experiences/processor/src/cells/history/load-production-history-run/contract.ts',
          contains: ["'processor.load-production-history-run.v1'"],
        },
        {
          file: 'experiences/processor/src/cells/history/load-production-history-run/execute.ts',
          contains: [
            'run.orderMemberships.map',
            'productionOrderReferenceId(membership.productionOrderId)',
            'fallbackDisplayNumber: membership.externalOrderId',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'loadHistoryRun: (input) => production.loadHistoryRun.execute(input)',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
      ],
    },
    {
      operationId: 'production.list-order-control.v1',
      boundarySource:
        'experiences/processor/src/cells/orders/list-production-order-control/contract.ts',
      route: readRoute('/production/locations/:locationId/order-control'),
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: [
        'productionLocationParamsSchema',
        'listProductionOrderControlQuerySchema',
      ],
      resultSchema: 'listProcessorOrderControlResultSchema',
      filters: [
        "view defaults to 'attention'",
        'limit defaults to 25 and is capped at 100',
        'search, status, location-calendar dueBucket, run, batch, earliest assigned stage, priority, movable, and cursor are optional',
        'priority and movable accept booleans or the strings true/false',
      ],
      ordering: 'production_order.due_at ASC, production_order.id ASC',
      cursor:
        'Version-1 bound cursor over every filter except limit; point is dueAt plus production order UUID.',
      asOf: 'One injected now drives local due buckets, counts, command capabilities, and the response asOf.',
      sqlSemantics: [
        'Requires an active location, open resolution, and floor-visible lifecycle; finished and resolved work stays out.',
        'Attention means intake_pending or eligible with persisted pending placement; active means scheduled; intake spans release_pending, intake_pending, and eligible.',
        'Loads active placement, ordered attempt history, counts, resolution safety evidence, and route command capabilities for the emitted page.',
      ],
      fallbackIdentity:
        'Processor batches every item by production order id; missing canonical data keeps externalOrderId and null customer/canonical. Canonical rows add latest source and at most eight deterministic cross-domain audit entries.',
      requiredCapabilities: [
        'bound-cursor-codec',
        'clock-as-of',
        'operational-order-identity',
        'production-rules',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/orders/list-order-control/contract.spec.ts',
          'systems/production/src/cells/orders/list-order-control/cursor.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/orders/list-order-control/execute.spec.ts',
          'systems/production/src/cells/orders/list-order-control/project.spec.ts',
          'systems/production/src/cells/orders/list-order-control/capabilities.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/orders/list-order-control/postgres.int.spec.ts',
          'systems/orders/src/capabilities/operational-order-reads.postgres.int.spec.ts',
          'systems/production/src/capabilities/operational-order-reads.postgres.int.spec.ts',
          'experiences/processor/test/server/operational-order-capabilities.test.ts',
          'verification/queries/test/list-order-control.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/orders/list-order-control/postgres.ts',
          contains: [
            "input.view === 'attention'",
            "eq(schema.productionOrders.resolutionState, 'open')",
            'asc(schema.productionOrders.dueAt)',
            'asc(schema.productionOrders.id)',
            '.limit(input.limit + 1)',
          ],
        },
        {
          file: 'systems/production/src/cells/orders/list-order-control/cursor.ts',
          contains: [
            'version: 1',
            'dueAt: point.dueAt.toISOString()',
            'movable: input.movable ?? null',
          ],
        },
        {
          file: 'experiences/processor/src/cells/orders/list-production-order-control/contract.ts',
          contains: ["'processor.list-production-order-control.v1'"],
        },
        {
          file: 'experiences/processor/src/cells/orders/list-production-order-control/execute.ts',
          contains: [
            'referenceId: item.order.id',
            'fallbackDisplayNumber: item.order.externalOrderId',
            'loadOperationalOrderContexts({',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'listOrderControl: (input) => production.listOrderControl.execute({',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
      ],
    },
    {
      operationId: 'production.list-orders.v1',
      boundarySource:
        'systems/production/src/cells/orders/list-orders/contract.ts',
      route: readRoute('/production/locations/:locationId/orders'),
      selectedHttpOwner: 'production-system',
      systemSurface: 'http',
      requestSchemas: [
        'productionLocationParamsSchema',
        'listProductionOrdersQuerySchema',
      ],
      resultSchema: 'listProductionOrdersResultSchema',
      filters: [
        'limit defaults to 50 and is capped at 100',
        'status, strict dueAfter, strict dueBefore, and cursor are optional',
        'when both bounds exist dueBefore must be later than dueAfter',
      ],
      ordering: 'production_order.id ASC',
      cursor:
        'Unbound base64url production-order UUID; the next page uses id > cursor and rejects malformed/non-UUID values.',
      asOf: 'One injected now drives location-local due buckets and is returned as asOf.',
      sqlSemantics: [
        'Requires an active location and joins the matching demand in the same location.',
        'Includes only open-resolution, unfinished execution rows.',
        'Reads limit + 1 and emits the last page row UUID as the next cursor.',
      ],
      fallbackIdentity:
        'System result exposes externalOrderId only; there is no current Processor shadow projection.',
      requiredCapabilities: ['clock-as-of'],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/orders/list-orders/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/orders/list-orders/execute.spec.ts',
          'systems/production/src/cells/orders/list-orders/http.spec.ts',
          'systems/production/src/cells/orders/list-orders/project.spec.ts',
          'systems/production/src/cells/orders/list-orders/cursor.spec.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/orders/list-orders/postgres.int.spec.ts',
          'verification/queries/test/production-queries.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/orders/list-orders/postgres.ts',
          contains: [
            "eq(schema.productionOrders.resolutionState, 'open')",
            "ne(schema.productionOrders.executionStatus, 'finished')",
            'asc(schema.productionOrders.id)',
            '.limit(input.limit + 1)',
          ],
        },
        {
          file: 'systems/production/src/cells/orders/list-orders/cursor.ts',
          contains: [
            'encodeBase64UrlText(orderId)',
            'uuidPattern.test(decoded)',
          ],
        },
      ],
    },
    {
      operationId: 'production.preview-order-route.v1',
      boundarySource:
        'systems/production/src/cells/orders/preview-order-route/contract.ts',
      route: {
        method: 'POST',
        path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
        capability: 'production:stage',
      },
      selectedHttpOwner: 'production-system',
      systemSurface: 'http',
      requestSchemas: [
        'productionOrderRoutingParamsSchema',
        'previewProductionOrderRouteRequestSchema',
      ],
      resultSchema: 'productionOrderRouteProposalSchema',
      filters: [
        'queued_move is fixed to manual_rebatch and sorting restart with one target batch',
        'exception requires a non-manual reason and restart stage; reason other requires a trimmed note',
        'both variants require expected run queue, order, and source-batch versions',
      ],
      ordering:
        'Candidate batches by sequence; stage plan by plannedStartAt; routing policy determines released and assigned stage order.',
      cursor: 'No cursor. Proposal hash binds the complete evaluated proposal.',
      asOf: 'No response asOf. Preview reads a snapshot without locks and does not use the injected clock to mutate state.',
      sqlSemantics: [
        'Loads run, order, active source membership, ordered candidate batches/stages, and attempt history in one unit of work with lock=false.',
        "Evaluates with consistency 'snapshot'; commit is a separate operation that rechecks under locks.",
        'Emits only the existing preview observability signal and performs no writes.',
      ],
      fallbackIdentity:
        'No Processor shadow projection; the proposal is addressed by production order UUID.',
      requiredCapabilities: [
        'canonical-hash',
        'production-rules',
        'read-only-repeatable-read',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/orders/preview-order-route/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/model/order-route-proposal/evaluate.spec.ts',
          'systems/production/src/cells/orders/preview-order-route/execute.spec.ts',
          'verification/queries/test/preview-order-route.conformance.int.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/orders/preview-order-route/postgres.int.spec.ts',
          'verification/queries/test/preview-order-route.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/orders/preview-order-route/execute.ts',
          contains: [
            'context = await dependencies.repo.load',
            'decidePreviewOrderRoute',
            "operation: 'order_route_preview'",
          ],
        },
        {
          file: 'systems/production/src/cells/orders/preview-order-route/postgres.ts',
          contains: [
            'loadContext(transaction, input, schema)',
            'asc(schema.productionBatches.sequenceIndex)',
            'asc(schema.stageRuns.plannedStartAt)',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'systems/production/src/cells/orders/preview-order-route/http.ts',
          contains: [
            '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
            "contextRequirements: ['authenticated-actor']",
          ],
        },
      ],
    },
    {
      operationId: 'production.load-board.v1',
      boundarySource:
        'experiences/processor/src/cells/production/load-production-board/contract.ts',
      route: readRoute(
        '/production/locations/:locationId/runs/:productionRunId/board',
      ),
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: ['productionRunBoardParamsSchema'],
      resultSchema: 'processorProductionBoardSchema',
      filters: ['Exact locationId plus productionRunId identity only.'],
      ordering:
        'orders by UUID; batches by sequence; stages by batch then plannedStartAt; projection policies retain their declared stage order.',
      cursor: 'No cursor.',
      asOf: 'One injected now drives due buckets and next-action timing and is returned as board asOf.',
      sqlSemantics: [
        'Loads run and shift plus all open-resolution location orders, selected-run batches/memberships/stages, active run IDs, active stages, and bounded machine assignments.',
        'Runs in a read-only repeatable-read transaction; the result is advisory and command paths recheck under locks.',
        'Pure Production rules derive stage next actions after the database projection.',
      ],
      fallbackIdentity:
        'Processor resolves only orders inside board batches, deduplicated by production order id, with externalOrderId fallback and null customer when canonical identity is absent.',
      requiredCapabilities: [
        'clock-as-of',
        'operational-order-identity',
        'production-rules',
        'read-only-repeatable-read',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/queries/load-board/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/queries/load-board/execute.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/queries/load-board/postgres.int.spec.ts',
          'verification/queries/test/load-board.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/queries/load-board/postgres.ts',
          contains: [
            'loadProductionBoardSnapshot(',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'systems/production/src/read-models/production-board/postgres.ts',
          contains: [
            "eq(schema.productionOrders.resolutionState, 'open')",
            'asc(schema.productionBatches.sequenceIndex)',
            'asc(schema.stageRuns.plannedStartAt)',
          ],
        },
        {
          file: 'experiences/processor/src/cells/production/load-production-board/contract.ts',
          contains: ["'processor.load-production-board.v1'"],
        },
        {
          file: 'experiences/processor/src/cells/production/load-production-board/execute.ts',
          contains: [
            'productionBoardOrderReferences(loaded.value)',
            'projectProcessorProductionBoard(loaded.value, resolutions)',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'loadBoard: (input) => production.loadBoard.execute(input)',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
      ],
    },
    {
      operationId: 'production.load-remaining-day-forecast.v1',
      boundarySource:
        'experiences/processor/src/cells/forecast/load-remaining-day-forecast/contract.ts',
      route: readRoute('/production/locations/:locationId/forecast'),
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: [
        'productionRemainingDayForecastParamsSchema',
        'productionRemainingDayForecastQuerySchema',
      ],
      resultSchema: 'processorRemainingDayForecastSchema',
      filters: [
        'serviceDay is a real Gregorian YYYY-MM-DD date',
        'the location timezone defines the service-day window, including DST-length days',
        'unfinished overdue demand is intentionally included; dueAt must be before the window end',
      ],
      ordering:
        'demand by dueAt then demand id; shifts by start then id; runs by id; batches by run then sequence; memberships by run, sequence, order id; stages/assignments by stable IDs and plan order.',
      cursor:
        'No pagination cursor. Every read set is explicitly bounded at 500 base rows, 4x stages, and 16x assignments; overflow is a typed conflict.',
      asOf: 'One injected now is passed into timezone window derivation, repository snapshot, placement projection, and response asOf.',
      sqlSemantics: [
        'Requires an active location and includes expected, inbound, or production_released demands whose production order is absent or unresolved.',
        'Merges active placements back by demand id so placed unfinished work outside the due window remains visible.',
        'Pure lifecycle and scheduler projections partition every row exactly once into inProduction, readyToPlace, expectedLater, or needsShift.',
      ],
      fallbackIdentity:
        'Processor keys admitted rows by production order id and pre-admission rows by demand id; both fall back to externalOrderId with null customer/canonical when unresolved.',
      requiredCapabilities: [
        'clock-as-of',
        'operational-order-identity',
        'production-rules',
        'read-only-repeatable-read',
        'scheduler-projection',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/execute.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/project.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/placement.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/window.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/postgres.int.spec.ts',
          'verification/queries/test/load-remaining-day-forecast.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/queries/load-remaining-day-forecast/postgres.ts',
          contains: [
            'productionServiceDayWindow({',
            'lt(schema.orderDemands.dueAt, range.endsAt)',
            '.limit(input.rowLimit + 1)',
            "return 'scope_too_large'",
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'systems/production/src/cells/queries/load-remaining-day-forecast/execute.ts',
          contains: ['rowLimit: remainingDayForecastRowLimit'],
        },
        {
          file: 'systems/production/src/cells/queries/load-remaining-day-forecast/project.ts',
          contains: [
            'overdueUnfinishedIncluded: true',
            'placementRevalidatedOnCommit: true',
          ],
        },
        {
          file: 'experiences/processor/src/cells/forecast/load-remaining-day-forecast/contract.ts',
          contains: ["'processor.load-remaining-day-forecast.v1'"],
        },
        {
          file: 'experiences/processor/src/cells/forecast/load-remaining-day-forecast/execute.ts',
          contains: [
            'productionOrderReferenceId(item.productionOrderId)',
            'orderDemandReferenceId(item.orderDemandId)',
            'fallbackDisplayNumber: item.externalOrderId',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'loadRemainingDayForecast: (input) => production.loadRemainingDayForecast.execute(input)',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
      ],
    },
    {
      operationId: 'production.load-workspace.v1',
      boundarySource:
        'experiences/processor/src/cells/production/load-production-workspace/contract.ts',
      route: readRoute('/production/locations/:locationId/workspace'),
      selectedHttpOwner: 'processor-experience',
      systemSurface: 'headless',
      requestSchemas: [
        'productionWorkspaceParamsSchema',
        'productionWorkspaceQuerySchema',
      ],
      resultSchema: 'processorProductionWorkspaceSchema',
      filters: [
        'Optional query shiftId selects an exact shift and suppresses fallback selection',
        'the params schema still tolerates optional shiftId, but the deployed route has no shiftId path segment',
      ],
      ordering:
        'shifts and runs newest-first; actionable schedules newest-first; config highest version then publish time; stations by sortOrder/id; machines by station order/label; workspace and pending-order arrays preserve repository-return order, while demand outlook and live changes apply their declared deterministic sorts.',
      cursor: 'No cursor.',
      asOf: 'One injected now drives actionable-schedule selection, due buckets, live placement, demand outlook, board timing, and response asOf.',
      sqlSemantics: [
        'Requires an active location. Selection precedence is one started-run shift, then one actionable accepted-plan shift, then one open future uncommitted shift; ambiguity returns candidateShifts instead of guessing.',
        'An explicit unknown shift is shift_not_found. Live-placement identity must match the selected started run and queue version or the query returns a conflict.',
        'Composes current resources, schedule, run, orders, live changes, demand outlook, and optional board from one read-only repeatable-read snapshot.',
      ],
      fallbackIdentity:
        'Processor deduplicates one identity batch across orders, pending orders, live-run changes, and nested board orders; each uses production order id plus externalOrderId fallback.',
      requiredCapabilities: [
        'clock-as-of',
        'operational-order-identity',
        'production-rules',
        'read-only-repeatable-read',
        'scheduler-projection',
      ],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/queries/load-workspace/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/queries/load-workspace/execute.spec.ts',
          'systems/production/src/cells/queries/load-workspace/selection.spec.ts',
          'systems/production/src/cells/queries/load-workspace/demand.spec.ts',
          'systems/production/src/cells/queries/load-workspace/live.spec.ts',
          'experiences/processor/test/server/processor-server.test.ts',
          'verification/http/test/bootstrap/api-live-catalog.composition.test.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/queries/load-workspace/postgres.int.spec.ts',
          'verification/queries/test/load-workspace.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/queries/load-workspace/selection.ts',
          contains: [
            'startedCandidates.length === 1',
            'acceptedCandidates.length === 1',
            'openCandidates.length === 1',
            "return 'shift_not_found'",
          ],
        },
        {
          file: 'systems/production/src/cells/queries/load-workspace/postgres.ts',
          contains: [
            'selectWorkspaceShift({',
            'loadProductionBoardSnapshot(',
            "isolationLevel: 'repeatable read'",
            "accessMode: 'read only'",
          ],
        },
        {
          file: 'systems/production/src/cells/queries/load-workspace/execute.ts',
          contains: [
            'projectLiveRunChanges',
            'projectDemandOutlook',
            'evaluateBoardProjection(',
          ],
        },
        {
          file: 'experiences/processor/src/cells/production/load-production-workspace/contract.ts',
          contains: ["'processor.load-production-workspace.v1'"],
        },
        {
          file: 'experiences/processor/src/cells/production/load-production-workspace/execute.ts',
          contains: [
            'productionOrderReferenceId(order.id)',
            'productionBoardOrderReferences(workspace.board)',
            'fallbackDisplayNumber: order.externalOrderId',
          ],
        },
        {
          file: 'topology/runtime/http/bootstrap/target-owners.ts',
          contains: [
            'loadWorkspace: (input) => production.loadWorkspace.execute(input)',
            'const processorOperationalOrders = makeProcessorOperationalOrderCapabilities({',
          ],
        },
      ],
    },
    {
      operationId: 'production.list-locations.v1',
      boundarySource:
        'systems/production/src/cells/resources/list-locations/contract.ts',
      route: {
        method: 'GET',
        path: '/production/locations',
        capability: 'authentication-required',
      },
      selectedHttpOwner: 'production-system',
      systemSurface: 'http',
      requestSchemas: ['listProductionLocationsQuerySchema'],
      resultSchema: 'listProductionLocationsResultSchema',
      filters: [
        'includeInactive accepts boolean or true/false string and defaults false',
        'allowedLocationIds is derived asynchronously from the authenticated response context, not client input',
        'null allowedLocationIds means unrestricted; an empty array returns no rows without querying',
      ],
      ordering: 'location.name ASC, location.id ASC',
      cursor: 'No cursor.',
      asOf: 'The injected clock is observed after the repository list and serialized as asOf.',
      sqlSemantics: [
        'By default includes only active locations.',
        'When scope is non-null, filters by the exact allowed location ID set.',
        'Returns id, name, timezone, and isActive only.',
      ],
      fallbackIdentity:
        'No order identity. Authorization-derived location scope is the contextual fallback that must remain host-owned.',
      requiredCapabilities: ['clock-as-of', 'location-authorization-scope'],
      evidence: {
        contractTests: [
          'verification/topology/contract-schema-compatibility.test.ts',
          'systems/production/src/cells/resources/list-locations/contract.spec.ts',
        ],
        behaviorTests: [
          'systems/production/src/cells/resources/list-locations/execute.spec.ts',
          'systems/production/src/cells/resources/list-locations/http.spec.ts',
          'systems/production/src/cells/resources/list-locations/project.spec.ts',
        ],
        postgresTests: [
          'systems/production/src/cells/resources/list-locations/postgres.int.spec.ts',
          'verification/queries/test/production-queries.conformance.int.test.ts',
        ],
      },
      sourceAnchors: [
        {
          file: 'systems/production/src/cells/resources/list-locations/http.ts',
          contains: [
            "contextRequirements: ['allowed-production-location-ids']",
            'allowedLocationIds: readAllowedLocationIds(request.context)',
          ],
        },
        {
          file: 'systems/production/src/cells/resources/list-locations/postgres.ts',
          contains: [
            'allowedLocationIds !== null && allowedLocationIds.length === 0',
            'productionScopeReconciliationV1.list({',
            'locationIds: allowedLocationIds',
          ],
        },
      ],
    },
  ]);

export const processorProjectionRoutes: readonly ProcessorProjectionRoute[] =
  Object.freeze([
    {
      operationId: 'production.load-board.v1',
      processorOperationId: 'processor.load-production-board.v1',
      route: readRoute(
        '/production/locations/:locationId/runs/:productionRunId/board',
      ),
      responseSchema: 'processorProductionBoardSchema',
      identitySelection:
        'All nested batch orders by production order id; fallback externalOrderId.',
    },
    {
      operationId: 'production.preview-order-backlog.v1',
      processorOperationId: 'processor.preview-production-order-backlog.v1',
      route: {
        method: 'POST',
        path: '/production/locations/:locationId/order-backlog/preview',
        capability: 'production:override',
      },
      responseSchema: 'processorProductionOrderBacklogPreviewSchema',
      identitySelection:
        'All four bounded groups by production order id; fallback displayReference.',
    },
    {
      operationId: 'production.load-workspace.v1',
      processorOperationId: 'processor.load-production-workspace.v1',
      route: readRoute('/production/locations/:locationId/workspace'),
      responseSchema: 'processorProductionWorkspaceSchema',
      identitySelection:
        'Deduplicated union of orders, pending orders, live changes, and board orders; fallback externalOrderId.',
    },
    {
      operationId: 'production.load-remaining-day-forecast.v1',
      processorOperationId: 'processor.load-remaining-day-forecast.v1',
      route: readRoute('/production/locations/:locationId/forecast'),
      responseSchema: 'processorRemainingDayForecastSchema',
      identitySelection:
        'Production order id when admitted, otherwise demand id; fallback externalOrderId.',
    },
    {
      operationId: 'production.list-history-activity.v1',
      processorOperationId: 'processor.list-production-history-activity.v1',
      route: readRoute('/production/locations/:locationId/history/activity'),
      responseSchema: 'processorListProductionHistoryActivityResultSchema',
      identitySelection:
        'Only production_order events by entity id; fallback entity UUID.',
    },
    {
      operationId: 'production.load-history-run.v1',
      processorOperationId: 'processor.load-production-history-run.v1',
      route: readRoute(
        '/production/locations/:locationId/history/runs/:productionRunId',
      ),
      responseSchema: 'processorProductionHistoryRunDetailSchema',
      identitySelection:
        'All membership episodes by production order id; fallback externalOrderId.',
    },
    {
      operationId: 'production.list-order-control.v1',
      processorOperationId: 'processor.list-production-order-control.v1',
      route: readRoute('/production/locations/:locationId/order-control'),
      responseSchema: 'listProcessorOrderControlResultSchema',
      identitySelection:
        'All page items by production order id; fallback externalOrderId plus optional canonical source/audit context.',
    },
  ]);

export const queryConformanceCapabilities: Readonly<
  Record<QueryConformanceCapability, string>
> = Object.freeze({
  'bound-cursor-codec':
    'Keep filter-bound cursor codecs cell-owned until a second target query proves a reusable envelope; preserve exact PostgreSQL microsecond keys for history.',
  'canonical-hash':
    'Use the existing deterministic codec/hash mechanism through an explicit pure capability; do not move Node crypto into decisions.',
  'clock-as-of':
    'Every query receives one host-composed clock value and threads it through filters, policies, and response asOf without a second read.',
  'location-authorization-scope':
    'The HTTP host must expose authenticated allowedLocationIds as opaque context before full input decode; clients never supply this scope.',
  'operational-order-identity':
    'Processor experience owns batched, deduplicated canonical identity and audit composition; Production returns operational references only.',
  'production-rules':
    'Consume the canonical @pressly/production-system/model rules from each cell; do not copy owner policy objects.',
  'read-only-repeatable-read':
    'Cell-local PostgreSQL adapters need an explicit read-only repeatable-read unit for multi-query snapshots; promote only after two identical implementations exist.',
  'scheduler-projection':
    'Forecast/workspace receive a narrow deterministic scheduler projection port; no Production cell imports a sibling runtime or app composition.',
});
