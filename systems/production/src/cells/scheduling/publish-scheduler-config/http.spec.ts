import { proveOperation } from '@pressly/testkit/operation-proof';
import { publishSchedulerConfigCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { publishSchedulerConfigContract } from './contract.ts';
import { publishSchedulerConfigHttpSurfaces } from './http.ts';
import type { SchedulerConfig } from './types.ts';

const surface = publishSchedulerConfigHttpSurfaces[0];
const actorId = '10000000-0000-4000-8000-000000000001';

const validBody = {
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  },
  idempotencyKey: 'scheduler-config-command-1',
} as const;

const config: SchedulerConfig = {
  id: '10000000-0000-4000-8000-000000000002',
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  version: 1,
  stageFitAssertion: {
    ...validBody.stageFitAssertion,
    assertedBy: actorId,
    assertedAt: '2026-08-22T14:00:00.000Z',
  },
  publishedAt: '2026-08-22T14:00:00.000Z',
};

describe('publish scheduler config HTTP boundary', () => {
  proveOperation({
    operationId: 'production.publish-scheduler-config.v1',
    declaration: publishSchedulerConfigCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'preserves body then params validation before actor context resolution',
        proves: ['protocol'],
        run: () => {
          expect(surface).toBeDefined();
          if (surface === undefined) return;
          try {
            surface.validateRequest?.({
              params: { locationId: '' },
              query: {},
              headers: {},
              body: {
                ...validBody,
                stageFitAssertion: {
                  ...validBody.stageFitAssertion,
                  sortingFits: false,
                },
              },
            });
            expect.unreachable('Invalid request must throw.');
          } catch (error) {
            expect(isAppError(error)).toBe(true);
            expect(error).toMatchObject({
              code: 'invalid_body_type',
              status: 400,
              publicDetails: { location: 'body' },
            });
          }
        },
      },
    ],
  });

  it('rejects params only after the canonical body succeeds', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    try {
      surface.validateRequest?.({
        params: { locationId: '' },
        query: {},
        headers: {},
        body: validBody,
      });
      expect.unreachable('Invalid params must throw.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_params_type',
        status: 400,
        publicDetails: { location: 'params' },
      });
    }
  });

  it('resolves actor context after validation and presents exact 201 success', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const serialized = surface.toSerializedInput({
      params: { locationId: 'location-1' },
      query: {},
      headers: {},
      body: validBody,
      context: { actorId },
    });
    expect(publishSchedulerConfigContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        locationId: 'location-1',
        actorId,
        ...validBody,
      },
    });
    expect(surface.present({ kind: 'success', value: config })).toEqual({
      status: 201,
      body: { ok: true, data: config },
    });
  });

  it('maps semantic and idempotency failures to their exact AppErrors', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const outcomes = [
      {
        outcome: {
          kind: 'failure' as const,
          failure: {
            kind: 'validation' as const,
            classification: 'semantic' as const,
            code: 'scheduler_config_invalid' as const,
            message: 'Scheduler values must be positive.' as const,
            safeMessage: 'Scheduler values must be positive.' as const,
          },
        },
        expected: { code: 'scheduler_config_invalid', status: 422 },
      },
      {
        outcome: {
          kind: 'failure' as const,
          failure: {
            kind: 'conflict' as const,
            code: 'production_idempotency_conflict' as const,
            message:
              'The idempotency key belongs to a different production command.' as const,
            safeMessage:
              'The idempotency key belongs to a different production command.' as const,
          },
        },
        expected: { code: 'production_idempotency_conflict', status: 409 },
      },
    ];

    for (const { outcome, expected } of outcomes) {
      try {
        surface.present(outcome);
        expect.unreachable('Expected failure must throw an AppError.');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        expect(error).toMatchObject(expected);
      }
    }
  });
});
