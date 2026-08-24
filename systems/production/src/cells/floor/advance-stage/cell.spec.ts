import { proveOperation } from '@pressly/testkit/operation-proof';
import type { HttpRequest, HttpSurface } from '@pressly/cells';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { advanceStageCellDeclaration, makeAdvanceStageCell } from './cell.ts';
import { advanceStageContract } from './contract.ts';
import type { AdvanceStageDependencies } from './execute.ts';
import type {
  AdvanceStageExpectedFailure,
  AdvanceStageResult,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  stage: '10000000-0000-4000-8000-000000000002',
} as const;

const httpSurfaces = (): readonly HttpSurface<
  AdvanceStageResult,
  AdvanceStageExpectedFailure
>[] =>
  advanceStageCellDeclaration.surfaces.filter(
    (
      surface,
    ): surface is HttpSurface<
      AdvanceStageResult,
      AdvanceStageExpectedFailure
    > => surface.kind === 'http',
  );

const request = (
  input: {
    body?: unknown;
    context?: unknown;
    locationId?: string;
    stageRunId?: string;
  } = {},
): HttpRequest => ({
  params: {
    locationId: input.locationId ?? 'location-1',
    stageRunId: input.stageRunId ?? ids.stage,
  },
  query: {},
  headers: {},
  body:
    input.body ??
    ({ expectedVersion: 3, idempotencyKey: 'start-stage-command' } as const),
  context: input.context ?? { actorId: ids.actor },
});

describe('production.advance-stage.v1 cell declaration', () => {
  it('declares the exact operation, authorization, consistency, and delivery semantics', () => {
    expect(advanceStageCellDeclaration.id).toBe('production.advance-stage.v1');
    expect(advanceStageCellDeclaration.kind).toBe('command');
    expect(advanceStageCellDeclaration.authorization).toEqual({
      capability: 'production:stage',
      timing: 'before-input',
    });
    expect(advanceStageCellDeclaration.consistency).toMatchObject({
      transaction: 'required',
      concurrency: 'optimistic',
    });
    expect('concurrencyKey' in advanceStageCellDeclaration.consistency).toBe(
      false,
    );
    expect(
      advanceStageCellDeclaration.consistency.expectedVersion?.({
        locationId: 'location-1',
        stageRunId: ids.stage,
        expectedVersion: 3,
        idempotencyKey: 'start-stage-command',
        actorId: ids.actor,
        transition: 'start',
      }),
    ).toBe(3);
    expect(advanceStageCellDeclaration.idempotency.required).toBe(true);
    expect(
      advanceStageCellDeclaration.idempotency.key?.({
        locationId: 'location-1',
        stageRunId: ids.stage,
        expectedVersion: 3,
        idempotencyKey: 'start-stage-command',
        actorId: ids.actor,
        transition: 'start',
      }),
    ).toBe('start-stage-command');
    expect(advanceStageCellDeclaration.emits).toEqual([]);
    expect(advanceStageCellDeclaration.consumes).toEqual([]);
    expect(advanceStageCellDeclaration.observability).toEqual({
      operation: 'production.advance_stage',
    });
    expect(advanceStageCellDeclaration.contract).toBe(advanceStageContract);
  });

  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'declares only the two current literal POST routes with staged auth and 64kb bodies',
        proves: ['protocol'],
        run: () => {
          expect(
            httpSurfaces().map((surface) => ({
              method: surface.method,
              path: surface.path,
              bodyLimit: surface.bodyLimit,
              authorization: surface.authorization,
              invalidRequest: surface.invalidRequest,
            })),
          ).toEqual([
            {
              method: 'POST',
              path: '/production/locations/:locationId/stages/:stageRunId/start',
              bodyLimit: '64kb',
              authorization: 'staged',
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
            },
            {
              method: 'POST',
              path: '/production/locations/:locationId/stages/:stageRunId/complete',
              bodyLimit: '64kb',
              authorization: 'staged',
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
            },
          ]);
        },
      },
    ],
  });

  it('validates current params into location scope before decoding body input', () => {
    const surface = httpSurfaces()[0];
    expect(surface?.decodeAuthorizationScope?.(request())).toEqual({
      kind: 'valid',
      value: 'location-1',
    });
    expect(
      surface?.decodeAuthorizationScope?.(
        request({ locationId: '', stageRunId: 'not-an-id' }),
      ),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('decodes actorId only from the opaque authenticated context', () => {
    const start = httpSurfaces()[0];
    const decoded = advanceStageContract.input.decode(
      start?.toSerializedInput(request()),
    );
    expect(decoded).toMatchObject({
      kind: 'valid',
      value: {
        transition: 'start',
        actorId: ids.actor,
        locationId: 'location-1',
        stageRunId: ids.stage,
      },
    });

    try {
      start?.toSerializedInput(request({ context: 'opaque' }));
      expect.unreachable('missing authenticated actor should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.kind).toBe('AuthError');
        expect(error.code).toBe('missing_auth_principal');
        expect(error.status).toBe(401);
      }
    }
  });

  it('presents current success bodies and delegates expected errors to the AppError boundary', () => {
    const surface = httpSurfaces()[0];
    expect(
      surface?.present({
        kind: 'success',
        value: { entityId: ids.stage, version: 4, replayed: false },
      }),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        data: { entityId: ids.stage, version: 4, replayed: false },
      },
    });

    for (const [kind, status] of [
      ['not_found', 404],
      ['conflict', 409],
    ] as const) {
      try {
        surface?.present({
          kind: 'failure',
          failure: {
            kind,
            code: 'stage_failure',
            message: 'Private stage failure.',
            safeMessage: 'The stage could not be advanced.',
          },
        });
        expect.unreachable('expected failure should reach the error boundary');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error)) {
          expect(error.code).toBe('stage_failure');
          expect(error.status).toBe(status);
          expect(error.safeMessage).toBe('The stage could not be advanced.');
        }
      }
    }
  });

  it('binds runtime dependencies without mutating the static declaration', () => {
    const inertDependencies = {} as AdvanceStageDependencies<never>;
    const cell = makeAdvanceStageCell(inertDependencies);

    expect(cell.id).toBe(advanceStageCellDeclaration.id);
    expect(cell.contract).toBe(advanceStageCellDeclaration.contract);
    expect(cell.surfaces).toBe(advanceStageCellDeclaration.surfaces);
    expect(typeof cell.execute).toBe('function');
  });
});
