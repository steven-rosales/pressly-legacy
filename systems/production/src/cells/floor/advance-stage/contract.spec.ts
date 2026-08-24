import { proveOperation } from '@pressly/testkit/operation-proof';
import { advanceStageCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { advanceStageContract } from './contract.ts';
import type { AdvanceStageResult } from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  stage: '10000000-0000-4000-8000-000000000002',
} as const;

const startInput = {
  transition: 'start',
  params: {
    locationId: 'location-1',
    stageRunId: ids.stage,
  },
  body: {
    expectedVersion: 3,
    idempotencyKey: 'start-stage-command',
  },
  actorId: ids.actor,
} as const;

describe('advance-stage cell contract', () => {
  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes and re-encodes the current start request as an authenticated command',
        proves: ['contract'],
        run: () => {
          const decoded = advanceStageContract.input.decode(startInput);

          expect(decoded).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              stageRunId: ids.stage,
              expectedVersion: 3,
              idempotencyKey: 'start-stage-command',
              actorId: ids.actor,
              transition: 'start',
            },
          });
          if (decoded.kind === 'valid')
            expect(advanceStageContract.input.encode(decoded.value)).toEqual(
              startInput,
            );
        },
      },
    ],
  });

  it('preserves the current complete confirmation fields', () => {
    const confirmation = {
      observedAt: '2026-08-21T14:18:00.000Z',
      confirmationHash: 'a'.repeat(64),
    };

    expect(
      advanceStageContract.input.decode({
        ...startInput,
        transition: 'complete',
        body: { ...startInput.body, confirmation },
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: 'location-1',
        stageRunId: ids.stage,
        expectedVersion: 3,
        idempotencyKey: 'start-stage-command',
        actorId: ids.actor,
        transition: 'complete',
        confirmation,
      },
    });
  });

  it('reports malformed params, body, and authenticated context at their boundary paths', () => {
    const decoded = advanceStageContract.input.decode({
      transition: 'start',
      params: { locationId: '', stageRunId: 'not-an-id' },
      body: { expectedVersion: 0, idempotencyKey: 'short' },
      actorId: undefined,
    });

    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          ['params', 'locationId'],
          ['params', 'stageRunId'],
          ['body', 'expectedVersion'],
          ['body', 'idempotencyKey'],
          ['actorId'],
        ]),
      );
  });

  it('round-trips each current output shape and rejects an invalid success', () => {
    const mutation: AdvanceStageResult = {
      entityId: ids.stage,
      version: 4,
      replayed: false,
    };
    const confirmation: AdvanceStageResult = {
      status: 'confirmation_required',
      stageRunId: ids.stage,
      stageVersion: 3,
      code: 'PLANNED_START_NOT_REACHED',
      message: 'This stage is scheduled to start later.',
      confirmation: {
        observedAt: '2026-08-21T14:18:00.000Z',
        confirmationHash: 'a'.repeat(64),
      },
      timing: {
        plannedStartAt: '2026-08-21T15:00:00.000Z',
        plannedEndAt: '2026-08-21T15:56:00.000Z',
        observedAt: '2026-08-21T14:20:00.000Z',
        remainingMilliseconds: 2_400_000,
      },
      replayed: false,
    };

    for (const output of [mutation, confirmation]) {
      const encoded = advanceStageContract.output.encode(output);
      expect(advanceStageContract.output.decode(encoded)).toEqual({
        kind: 'valid',
        value: output,
      });
    }

    try {
      advanceStageContract.output.encode({
        entityId: 'not-an-id',
        version: 0,
        replayed: false,
      } as AdvanceStageResult);
      expect.unreachable('invalid output should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error.code).toBe('invalid_api_success_response');
    }
  });

  it('keeps expected failures typed and versioned', () => {
    const failure = {
      kind: 'conflict',
      code: 'stage_run_version_conflict',
      message: 'The production stage changed before the command.',
      safeMessage: 'The production stage changed before the command.',
    } as const;

    const encoded = advanceStageContract.failure.encode(failure);
    expect(advanceStageContract.failure.decode(encoded)).toEqual({
      kind: 'valid',
      value: failure,
    });
    expect(advanceStageContract.failure.version).toBe(1);
  });
});
