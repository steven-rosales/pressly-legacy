import { proveOperation } from '@pressly/testkit/operation-proof';
import { createShiftCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { createShiftContract } from './contract.ts';
import { createShiftHttpSurfaces } from './http.ts';

const surface = createShiftHttpSurfaces[0];

const validBody = {
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 4,
  idempotencyKey: 'create-shift-command-1',
};

describe('create shift HTTP boundary', () => {
  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
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
              body: { ...validBody, endsAt: 'not-an-instant' },
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

  it('decodes actor only after a valid request and presents 201 success', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const serialized = surface.toSerializedInput({
      params: { locationId: 'location-1' },
      query: {},
      headers: {},
      body: validBody,
      context: {
        actorId: '10000000-0000-4000-8000-000000000001',
      },
    });
    expect(createShiftContract.input.decode(serialized)).toMatchObject({
      kind: 'valid',
      value: { locationId: 'location-1' },
    });

    expect(
      surface.present({
        kind: 'success',
        value: {
          id: '10000000-0000-4000-8000-000000000002',
          locationId: 'location-1',
          startsAt: validBody.startsAt,
          endsAt: validBody.endsAt,
          timezone: validBody.timezone,
          effectiveFolderCount: validBody.effectiveFolderCount,
          status: 'open',
          version: 1,
        },
      }),
    ).toEqual({
      status: 201,
      body: {
        ok: true,
        data: {
          id: '10000000-0000-4000-8000-000000000002',
          locationId: 'location-1',
          startsAt: validBody.startsAt,
          endsAt: validBody.endsAt,
          timezone: validBody.timezone,
          effectiveFolderCount: validBody.effectiveFolderCount,
          status: 'open',
          version: 1,
        },
      },
    });
  });
});
