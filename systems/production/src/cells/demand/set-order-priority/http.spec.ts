import { proveOperation } from '@pressly/testkit/operation-proof';
import { setOrderPriorityCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { setOrderPriorityHttpSurfaces } from './http.ts';

const surface = setOrderPriorityHttpSurfaces[0];

describe('set order priority HTTP input precedence', () => {
  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'rejects an invalid body before invalid params and authorization',
        proves: ['protocol'],
        run: () => {
          expect(surface).toBeDefined();
          if (surface === undefined) return;

          try {
            surface.toSerializedInput({
              params: {
                locationId: '',
                productionOrderId: 'not-an-id',
              },
              query: {},
              headers: {},
              body: { priority: 'yes' },
              context: { actorId: 'actor-1' },
            });
            expect.unreachable('Invalid input must throw.');
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

  it('reports params only after a valid body', () => {
    expect(surface).toBeDefined();
    if (surface === undefined) return;

    expect(() =>
      surface.toSerializedInput({
        params: {
          locationId: '',
          productionOrderId: 'not-an-id',
        },
        query: {},
        headers: {},
        body: {
          priority: true,
          expectedVersion: 2,
          idempotencyKey: 'priority-command-1',
        },
        context: { actorId: 'actor-1' },
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_params_type',
        status: 400,
        publicDetails: expect.objectContaining({ location: 'params' }),
      }),
    );
  });
});
