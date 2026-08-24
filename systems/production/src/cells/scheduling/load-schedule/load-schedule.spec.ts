import { proveOperation } from '@pressly/testkit/operation-proof';
import type { HttpRequest, HttpRequestInput } from '@pressly/cells';
import type { ScheduleProposal } from '../../../read-models/production-schedule/contract.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it, vi } from 'vitest';
import { loadScheduleCellDeclaration, makeLoadScheduleCell } from './cell.ts';
import { loadScheduleContract } from './contract.ts';
import { makeExecuteLoadSchedule } from './execute.ts';
import { loadScheduleNotFound } from './failures.ts';
import { loadScheduleHttpSurfaces } from './http.ts';
import type { LoadScheduleRepository } from './types.ts';

const ids = {
  schedule: '22000000-0000-4000-8000-000000000001',
  shift: '22000000-0000-4000-8000-000000000002',
  config: '22000000-0000-4000-8000-000000000003',
  order: '22000000-0000-4000-8000-000000000004',
  washer: '22000000-0000-4000-8000-000000000005',
  dryer: '22000000-0000-4000-8000-000000000006',
} as const;

const proposal = (): ScheduleProposal => ({
  scheduleRunId: ids.schedule,
  productionShiftId: ids.shift,
  schedulerConfigId: ids.config,
  status: 'draft',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 80,
  batchCount: 1,
  makespanMinutes: 224,
  plannedCompletionAt: '2026-08-22T20:00:00.000Z',
  batches: [
    {
      sequence: 0,
      orderIds: [ids.order],
      derivedWeightLbs: 32,
      bagCount: 2,
      stages: [
        {
          stage: 'sorting',
          startsAt: '2026-08-22T16:00:00.000Z',
          endsAt: '2026-08-22T16:56:00.000Z',
          machineIds: [],
        },
        {
          stage: 'washing',
          startsAt: '2026-08-22T16:56:00.000Z',
          endsAt: '2026-08-22T17:52:00.000Z',
          machineIds: [ids.washer],
        },
        {
          stage: 'drying',
          startsAt: '2026-08-22T17:52:00.000Z',
          endsAt: '2026-08-22T18:48:00.000Z',
          machineIds: [ids.dryer],
        },
        {
          stage: 'folding_packaging',
          startsAt: '2026-08-22T18:48:00.000Z',
          endsAt: '2026-08-22T19:44:00.000Z',
          machineIds: [],
        },
      ],
    },
  ],
  unplacedOrderIds: [],
  warnings: [
    {
      code: 'SHIFT_OVERFLOW',
      message: 'The plan ends after the shift.',
      blocking: true,
      orderIds: [ids.order],
    },
  ],
  createdAt: '2026-08-22T15:00:00.000Z',
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
});

const input = { locationId: 'location-1', scheduleRunId: ids.schedule };

const request = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  params: input,
  query: {},
  headers: {},
  body: undefined,
  context: {},
  ...overrides,
});

describe('production.load-schedule.v1 contract', () => {
  proveOperation({
    operationId: 'production.load-schedule.v1',
    declaration: loadScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips strict route identity, canonical proposal copies, and failure',
        proves: ['contract'],
        run: () => {
          expect(loadScheduleContract.input.decode({ params: input })).toEqual({
            kind: 'valid',
            value: input,
          });
          expect(
            loadScheduleContract.input.decode({
              params: { ...input, scheduleRunId: 'not-a-uuid', extra: true },
            }),
          ).toMatchObject({ kind: 'invalid' });

          const value = proposal();
          const encoded = loadScheduleContract.output.encode(value);
          expect(encoded).toEqual(value);
          expect(encoded).not.toBe(value);
          expect((encoded as ScheduleProposal).batches).not.toBe(value.batches);
          expect(loadScheduleContract.output.decode(encoded)).toEqual({
            kind: 'valid',
            value,
          });

          const failure = loadScheduleNotFound();
          expect(
            loadScheduleContract.failure.decode(
              loadScheduleContract.failure.encode(failure),
            ),
          ).toEqual({ kind: 'valid', value: failure });
          expect(loadScheduleContract.input.version).toBe(1);
          expect(loadScheduleContract.output.version).toBe(1);
          expect(loadScheduleContract.failure.version).toBe(1);
        },
      },
    ],
  });
});

describe('production.load-schedule.v1 HTTP boundary', () => {
  const surface = loadScheduleHttpSurfaces[0]!;

  proveOperation({
    operationId: 'production.load-schedule.v1',
    declaration: loadScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares GET and validates params before after-input authorization',
        proves: ['protocol'],
        run: () => {
          expect(surface).toMatchObject({
            kind: 'http',
            method: 'GET',
            path: '/production/locations/:locationId/schedules/:scheduleRunId',
            bodyLimit: null,
            authorization: 'staged',
            contextRequirements: [],
            invalidRequest: {
              authorizationScope: null,
              input: {
                code: 'invalid_params_type',
                status: 400,
                location: 'params',
              },
            },
          });
          expect(surface.validateRequest).not.toBeNull();

          try {
            surface.validateRequest?.(
              request({
                params: { locationId: '', scheduleRunId: 'not-a-uuid' },
              }) as HttpRequestInput,
            );
            expect.unreachable(
              'invalid params should stop before authorization',
            );
          } catch (error) {
            expect(isAppError(error)).toBe(true);
            if (isAppError(error))
              expect(error).toMatchObject({
                code: 'invalid_params_type',
                status: 400,
                publicDetails: { location: 'params' },
              });
          }
        },
      },
    ],
  });

  it('serializes identity and presents the canonical success or 404', () => {
    expect(surface.toSerializedInput(request())).toEqual({ params: input });
    const value = proposal();
    expect(surface.present({ kind: 'success', value })).toEqual({
      status: 200,
      body: { ok: true, data: value },
    });

    try {
      surface.present({ kind: 'failure', failure: loadScheduleNotFound() });
      expect.unreachable('not found should reach the error boundary');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error).toMatchObject({
          kind: 'NotFoundError',
          code: 'schedule_not_found',
          status: 404,
        });
    }
  });
});

describe('production.load-schedule.v1 executor', () => {
  proveOperation({
    operationId: 'production.load-schedule.v1',
    declaration: loadScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns the repository proposal or the exact typed not-found failure',
        proves: ['executor-success'],
        run: async () => {
          for (const [loaded, expected] of [
            [proposal(), { kind: 'success', value: proposal() }],
            [null, { kind: 'failure', failure: loadScheduleNotFound() }],
          ] as const) {
            const load = vi.fn(async () => loaded);
            await expect(
              makeExecuteLoadSchedule({ load })(input),
            ).resolves.toEqual(expected);
            expect(load).toHaveBeenCalledWith(input);
          }
        },
      },
    ],
  });

  it('maps unknown persistence faults to the deployed database error', async () => {
    const cause = Object.freeze({ fixture: 'database unavailable' });
    const execute = makeExecuteLoadSchedule({
      load: async () => Promise.reject(cause),
    });

    await expect(execute(input)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'schedule_load_failed',
      message: 'The schedule proposal could not be loaded.',
      safeMessage: 'The schedule proposal could not be loaded.',
      status: 503,
      cause,
    });
  });
});

describe('production.load-schedule.v1 cell declaration', () => {
  it('has only the read boundary and its single repository dependency', async () => {
    expect(loadScheduleCellDeclaration).toMatchObject({
      id: 'production.load-schedule.v1',
      kind: 'query',
      authentication: 'required',
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: { transaction: 'none', concurrency: 'none' },
      idempotency: { required: false },
      emits: [],
      consumes: [],
      retry: null,
      timeoutMs: null,
      observability: { operation: 'production.load_schedule' },
    });
    expect(
      loadScheduleCellDeclaration.authorization?.timing === 'after-input'
        ? loadScheduleCellDeclaration.authorization.scope(input)
        : null,
    ).toBe('location-1');

    const load = vi.fn<LoadScheduleRepository['load']>(async () => proposal());
    const cell = makeLoadScheduleCell({ load });
    await expect(cell.execute(input)).resolves.toEqual({
      kind: 'success',
      value: proposal(),
    });
    expect(load).toHaveBeenCalledOnce();
  });
});
