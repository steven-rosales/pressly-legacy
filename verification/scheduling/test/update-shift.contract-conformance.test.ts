import {
  productionShiftParamsSchema,
  updateProductionShiftRequestSchema,
  updateProductionShiftResultSchema,
} from '@pressly/production-system/contracts/scheduling/update-shift';
import { updateShiftCellDeclaration } from '@pressly/production-system/operations/scheduling/update-shift/cell';
import { updateShiftContract } from '@pressly/production-system/operations/scheduling/update-shift/contract';
import type {
  UpdateShiftCommand,
  UpdateShiftExpectedFailure,
  UpdateShiftResult,
} from '@pressly/production-system/operations/scheduling/update-shift/types';
import { describe, expect, it } from 'vitest';

const shiftId = '37000000-0000-4000-8000-000000000003';
const actorId = '37000000-0000-4000-8000-000000000001';
const params = {
  locationId: 'location-update-shift-conformance',
  productionShiftId: shiftId,
};
const body = {
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  idempotencyKey: 'update-shift-contract-conformance',
};
const command: UpdateShiftCommand = {
  ...params,
  ...body,
  actorId,
};
const result: UpdateShiftResult = {
  productionShift: {
    id: shiftId,
    locationId: params.locationId,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    timezone: 'America/New_York',
    effectiveFolderCount: body.effectiveFolderCount,
    status: 'open',
    version: 2,
  },
  supersededScheduleRunId: null,
  replayed: false,
};

const declaredSurface = updateShiftCellDeclaration.surfaces[0];
const surface = declaredSurface?.kind === 'http' ? declaredSurface : null;

const capturedError = (run: () => unknown) => {
  try {
    run();
    return null;
  } catch (error) {
    if (typeof error !== 'object' || error === null) return error;
    const fields = error as Readonly<Record<string, unknown>>;
    return {
      code: fields['code'],
      status: fields['status'],
      publicDetails: fields['publicDetails'],
    };
  }
};

describe('production.update-shift.v1 boundary conformance', () => {
  it('uses the exact deployed body and params schemas and actor mapping', () => {
    expect(updateProductionShiftRequestSchema.parse(body)).toEqual(body);
    expect(productionShiftParamsSchema.parse(params)).toEqual(params);
    expect(updateShiftContract.input.decode({ params, body, actorId })).toEqual(
      { kind: 'valid', value: command },
    );
    expect(updateShiftContract.input.encode(command)).toEqual({
      params,
      body,
      actorId,
    });
    expect(surface).toBeDefined();
    expect(
      surface?.decodeAuthorizationScope?.({
        params,
        query: {},
        headers: {},
      }),
    ).toEqual({ kind: 'valid', value: params.locationId });
    expect(
      surface?.toSerializedInput({
        params,
        query: {},
        headers: {},
        body,
        context: { actorId, ignoredPrivateContext: true },
      }),
    ).toEqual({ params, body, actorId });
  });

  it('preserves deployed body-before-params failure identity and issue location', () => {
    const invalidBody = { ...body, endsAt: 'not-an-instant' };
    const invalidParams = { locationId: '', productionShiftId: 'not-a-uuid' };
    const decoded = updateShiftContract.input.decode({
      params: invalidParams,
      body: invalidBody,
      actorId,
    });
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid') {
      expect(decoded.issues[0]?.path[0]).toBe('body');
      expect(decoded.issues.some((issue) => issue.path[0] === 'params')).toBe(
        true,
      );
    }
    expect(
      capturedError(() =>
        surface?.toSerializedInput({
          params: invalidParams,
          query: {},
          headers: {},
          body: invalidBody,
          context: { actorId },
        }),
      ),
    ).toMatchObject({
      code: 'invalid_body_type',
      status: 400,
      publicDetails: { location: 'body' },
    });
    expect(
      capturedError(() =>
        surface?.toSerializedInput({
          params: invalidParams,
          query: {},
          headers: {},
          body,
          context: { actorId },
        }),
      ),
    ).toMatchObject({
      code: 'invalid_params_type',
      status: 400,
      publicDetails: { location: 'params' },
    });
  });

  it('preserves exact success bytes and the reachable expected-failure statuses', () => {
    expect(updateProductionShiftResultSchema.parse(result)).toEqual(result);
    expect(updateShiftContract.output.encode(result)).toEqual(result);
    expect(surface?.present({ kind: 'success', value: result })).toEqual({
      status: 200,
      body: { ok: true, data: result },
    });

    const failures: readonly Readonly<{
      failure: UpdateShiftExpectedFailure;
      status: number;
    }>[] = [
      {
        failure: {
          kind: 'validation',
          classification: 'semantic',
          code: 'production_shift_window_invalid',
          message: 'Shift end must be after shift start.',
          safeMessage: 'Shift end must be after shift start.',
        },
        status: 422,
      },
      {
        failure: {
          kind: 'not_found',
          code: 'production_shift_not_found',
          message: 'The production shift was not found.',
          safeMessage: 'The production shift was not found.',
        },
        status: 404,
      },
      ...(
        [
          'production_idempotency_conflict',
          'production_shift_already_started',
          'production_shift_closed',
          'production_shift_schedule_version_conflict',
          'production_shift_version_conflict',
          'schedule_current_plan_state_invalid',
        ] as const
      ).map((code) => ({
        failure: {
          kind: 'conflict' as const,
          code,
          message: code,
          safeMessage: code,
        },
        status: 409,
      })),
    ];
    for (const { failure, status } of failures)
      expect(
        capturedError(() => surface?.present({ kind: 'failure', failure })),
      ).toMatchObject({ code: failure.code, status });
  });
});
