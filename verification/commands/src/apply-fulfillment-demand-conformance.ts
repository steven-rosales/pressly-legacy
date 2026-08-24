import type { ApplyFulfillmentDemandCommand } from '@pressly/production-system/operations/demand/apply-fulfillment-demand/types';

export type ApplyFulfillmentDemandConformanceFixture =
  | 'fresh'
  | 'inactive_location'
  | 'intake_override'
  | 'resolved'
  | 'scheduled'
  | 'finished'
  | 'stored_invalid_replay'
  | 'stored_malformed_envelope'
  | 'stored_malformed_result'
  | 'unweighted'
  | 'weighted'
  | 'weighted_v2';

export type ApplyFulfillmentDemandConformanceMutation =
  | 'event_id_collision'
  | 'none'
  | 'order_cas_miss'
  | 'receipt_collision'
  | 'suppress_demand_update';

export type ApplyFulfillmentDemandConformanceExecution =
  | 'concurrent'
  | 'sequential';

export type ApplyFulfillmentDemandConformanceExpectedOutcome =
  | Readonly<{
      kind: 'success';
      outcome: 'applied' | 'ignored_older' | 'unchanged';
      replayed: boolean;
    }>
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure' | 'unexpected'; code: string }>;

export type ApplyFulfillmentDemandConformanceScenario = Readonly<{
  name: string;
  fixture: ApplyFulfillmentDemandConformanceFixture;
  mutation: ApplyFulfillmentDemandConformanceMutation;
  execution: ApplyFulfillmentDemandConformanceExecution;
  commands: readonly ApplyFulfillmentDemandCommand[];
  generatedIds: readonly string[];
  expectedOutcomes: readonly ApplyFulfillmentDemandConformanceExpectedOutcome[];
  expectedClockReads: number;
  expectedEventDelta: number;
  expectedLiveRevisionDelta: number;
  normalizeWinner?: boolean;
}>;

const uuid = (suffix: number): string =>
  `74000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const applyFulfillmentDemandConformanceIds = Object.freeze({
  business: uuid(1),
  fulfillment: uuid(3),
  demand: uuid(4),
  productionOrder: uuid(5),
  event: uuid(6),
  secondEvent: uuid(7),
  thirdEvent: uuid(8),
  collisionEvent: uuid(9),
  replayEvent: uuid(10),
  bagOne: uuid(11),
  bagTwo: uuid(12),
  actor: uuid(13),
});

export const applyFulfillmentDemandConformanceLocationId =
  'apply-fulfillment-demand-conformance';
export const applyFulfillmentDemandConformanceOtherLocationId =
  'apply-fulfillment-demand-conformance-other';
export const applyFulfillmentDemandConformanceNow = new Date(
  '2026-08-22T16:00:00.000Z',
);
export const applyFulfillmentDemandConformanceDueAt =
  '2026-08-23T20:00:00.000Z';
export const applyFulfillmentDemandConformanceObservedAt =
  '2026-08-22T15:00:00.000Z';

const command = (
  idempotencyKey: string,
  overrides: Partial<ApplyFulfillmentDemandCommand> = {},
): ApplyFulfillmentDemandCommand => ({
  fulfillmentId: applyFulfillmentDemandConformanceIds.fulfillment,
  fulfillmentVersion: 1,
  projectionHash: 'a'.repeat(64),
  displayReference: 'ORDER-740',
  locationId: applyFulfillmentDemandConformanceLocationId,
  admissionState: 'released',
  commercialState: 'open',
  dueAt: applyFulfillmentDemandConformanceDueAt,
  observedAt: applyFulfillmentDemandConformanceObservedAt,
  estimatedWeightLbs: 24,
  estimatedWeightSource: 'external_estimate',
  idempotencyKey,
  ...overrides,
});

const success = (
  outcome: 'applied' | 'ignored_older' | 'unchanged',
  replayed = false,
): ApplyFulfillmentDemandConformanceExpectedOutcome => ({
  kind: 'success',
  outcome,
  replayed,
});

const failure = (
  code: string,
): ApplyFulfillmentDemandConformanceExpectedOutcome => ({
  kind: 'failure',
  code,
});

const unexpected = (
  code: string,
): ApplyFulfillmentDemandConformanceExpectedOutcome => ({
  kind: 'unexpected',
  code,
});

const scenario = (
  input: ApplyFulfillmentDemandConformanceScenario,
): ApplyFulfillmentDemandConformanceScenario => Object.freeze(input);

const ordinaryReplay = command('apply-demand-conformance-replay');
export const applyFulfillmentDemandInvalidStoredReplayCommand = command(
  'apply-demand-conformance-invalid-replay',
  {
    projectionHash: 'invalid',
  },
);
export const applyFulfillmentDemandMalformedResultCommand = command(
  'apply-demand-conformance-malformed-result',
);
export const applyFulfillmentDemandMalformedEnvelopeCommand = command(
  'apply-demand-conformance-malformed-envelope',
  { projectionHash: 'invalid' },
);

export const applyFulfillmentDemandConformanceScenarios: readonly ApplyFulfillmentDemandConformanceScenario[] =
  Object.freeze([
    scenario({
      name: 'weighted create replays exactly and rejects divergent key reuse',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        ordinaryReplay,
        ordinaryReplay,
        { ...ordinaryReplay, displayReference: 'CHANGED' },
      ],
      generatedIds: [
        applyFulfillmentDemandConformanceIds.demand,
        applyFulfillmentDemandConformanceIds.productionOrder,
        applyFulfillmentDemandConformanceIds.event,
      ],
      expectedOutcomes: [
        success('applied'),
        success('applied', true),
        failure('production_idempotency_conflict'),
      ],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'exact stored receipt replays before semantic validation',
      fixture: 'stored_invalid_replay',
      mutation: 'none',
      execution: 'sequential',
      commands: [applyFulfillmentDemandInvalidStoredReplayCommand],
      generatedIds: [],
      expectedOutcomes: [success('unchanged', true)],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'schema-invalid stored object result fails closed as an idempotency conflict',
      fixture: 'stored_malformed_result',
      mutation: 'none',
      execution: 'sequential',
      commands: [applyFulfillmentDemandMalformedResultCommand],
      generatedIds: [],
      expectedOutcomes: [failure('production_idempotency_conflict')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'malformed stored envelope conflicts before semantic validation',
      fixture: 'stored_malformed_envelope',
      mutation: 'none',
      execution: 'sequential',
      commands: [applyFulfillmentDemandMalformedEnvelopeCommand],
      generatedIds: [],
      expectedOutcomes: [failure('production_idempotency_conflict')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'invalid version date hash or bag input is semantic failure',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-invalid', {
          projectionHash: 'invalid',
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [failure('fulfillment_demand_invalid')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'inconsistent weight provenance is semantic failure',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-invalid-weight', {
          estimatedWeightLbs: null,
          estimatedWeightSource: 'external_estimate',
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [failure('fulfillment_demand_weight_invalid')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'missing location fails before locks IDs or clock',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-missing-location', {
          locationId: 'apply-fulfillment-demand-missing-location',
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [failure('production_location_unavailable')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'inactive location fails before locks IDs or clock',
      fixture: 'inactive_location',
      mutation: 'none',
      execution: 'sequential',
      commands: [command('apply-demand-conformance-inactive-location')],
      generatedIds: [],
      expectedOutcomes: [failure('production_location_unavailable')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'unweighted demand persists without Production work',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-unweighted', {
          admissionState: 'unreleased',
          estimatedWeightLbs: null,
          estimatedWeightSource: null,
        }),
      ],
      generatedIds: [
        applyFulfillmentDemandConformanceIds.demand,
        applyFulfillmentDemandConformanceIds.event,
      ],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'new weight materializes deferred Production work',
      fixture: 'unweighted',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-materialize', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          admissionState: 'unreleased',
        }),
      ],
      generatedIds: [
        applyFulfillmentDemandConformanceIds.productionOrder,
        applyFulfillmentDemandConformanceIds.event,
      ],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'newer weighted source truth updates open Production work',
      fixture: 'weighted',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-weighted-update', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          estimatedWeightLbs: 30,
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'older source version is audited without mutation or clock',
      fixture: 'weighted',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-older', {
          fulfillmentVersion: 0,
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [failure('fulfillment_demand_invalid')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'valid older source version is audited without mutation or clock',
      fixture: 'weighted_v2',
      mutation: 'none',
      execution: 'sequential',
      commands: [command('apply-demand-conformance-older-valid')],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('ignored_older')],
      expectedClockReads: 0,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'equal source version and hash is audited unchanged without clock',
      fixture: 'weighted_v2',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-equal', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('unchanged')],
      expectedClockReads: 0,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'equal source version with divergent hash is rejected',
      fixture: 'weighted_v2',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-diverged', {
          fulfillmentVersion: 2,
          projectionHash: 'c'.repeat(64),
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [failure('fulfillment_demand_diverged')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'cross-location fulfillment is rejected after ordered locks',
      fixture: 'weighted_v2',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-cross-location', {
          fulfillmentVersion: 3,
          projectionHash: 'c'.repeat(64),
          locationId: applyFulfillmentDemandConformanceOtherLocationId,
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [failure('fulfillment_location_changed')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'manual admission and physical intake survive lagging source truth',
      fixture: 'intake_override',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-intake-override', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          admissionState: 'unreleased',
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'source withdrawal clears override but preserves physical intake',
      fixture: 'intake_override',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-withdrawn', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          admissionState: 'withdrawn',
          commercialState: 'completed',
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'resolved Production work is preserved while demand advances',
      fixture: 'resolved',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-resolved', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          commercialState: 'completed',
          estimatedWeightLbs: 30,
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'scheduled Production work is preserved while demand advances',
      fixture: 'scheduled',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-scheduled', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          admissionState: 'withdrawn',
          estimatedWeightLbs: 31,
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'finished Production work is preserved while demand advances',
      fixture: 'finished',
      mutation: 'none',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-finished', {
          fulfillmentVersion: 2,
          projectionHash: 'b'.repeat(64),
          admissionState: 'withdrawn',
          commercialState: 'completed',
          estimatedWeightLbs: 32,
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'same-version race commits one projection and rejects divergence',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'concurrent',
      commands: [
        command('apply-demand-conformance-race-a'),
        command('apply-demand-conformance-race-b', {
          projectionHash: 'b'.repeat(64),
          displayReference: 'ORDER-RACE-B',
        }),
      ],
      generatedIds: [
        applyFulfillmentDemandConformanceIds.demand,
        applyFulfillmentDemandConformanceIds.productionOrder,
        applyFulfillmentDemandConformanceIds.event,
      ],
      expectedOutcomes: [
        success('applied'),
        failure('fulfillment_demand_diverged'),
      ],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
      normalizeWinner: true,
    }),
    scenario({
      name: 'suppressed demand update retains the deployed no-CAS quirk',
      fixture: 'weighted',
      mutation: 'suppress_demand_update',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-demand-write-suppressed', {
          fulfillmentVersion: 3,
          projectionHash: 'c'.repeat(64),
          estimatedWeightLbs: 33,
        }),
      ],
      generatedIds: [applyFulfillmentDemandConformanceIds.event],
      expectedOutcomes: [success('applied')],
      expectedClockReads: 1,
      expectedEventDelta: 1,
      expectedLiveRevisionDelta: 1,
    }),
    scenario({
      name: 'late order CAS miss rolls the earlier demand update back',
      fixture: 'weighted',
      mutation: 'order_cas_miss',
      execution: 'sequential',
      commands: [
        command('apply-demand-conformance-order-cas', {
          fulfillmentVersion: 3,
          projectionHash: 'c'.repeat(64),
          estimatedWeightLbs: 33,
        }),
      ],
      generatedIds: [],
      expectedOutcomes: [
        failure('production_fulfillment_demand_order_version_conflict'),
      ],
      expectedClockReads: 1,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'late event identity collision rolls every new row back',
      fixture: 'fresh',
      mutation: 'event_id_collision',
      execution: 'sequential',
      commands: [command('apply-demand-conformance-event-collision')],
      generatedIds: [
        applyFulfillmentDemandConformanceIds.demand,
        applyFulfillmentDemandConformanceIds.productionOrder,
        applyFulfillmentDemandConformanceIds.collisionEvent,
      ],
      expectedOutcomes: [unexpected('fulfillment_demand_application_failed')],
      expectedClockReads: 1,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'late receipt-key collision rolls every new row back',
      fixture: 'fresh',
      mutation: 'receipt_collision',
      execution: 'sequential',
      commands: [command('apply-demand-conformance-receipt-collision')],
      generatedIds: [
        applyFulfillmentDemandConformanceIds.demand,
        applyFulfillmentDemandConformanceIds.productionOrder,
        applyFulfillmentDemandConformanceIds.event,
      ],
      expectedOutcomes: [unexpected('fulfillment_demand_application_failed')],
      expectedClockReads: 1,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
    scenario({
      name: 'injected AppError passes through without unknown remapping',
      fixture: 'fresh',
      mutation: 'none',
      execution: 'sequential',
      commands: [command('apply-demand-conformance-app-error')],
      generatedIds: [],
      expectedOutcomes: [unexpected('test_id_sequence_exhausted')],
      expectedClockReads: 0,
      expectedEventDelta: 0,
      expectedLiveRevisionDelta: 0,
    }),
  ]);
