import { describe, expect, it } from 'vitest';
import { makeLoadOperationalOrderContexts } from '../../../../src/features/orders/load-operational-order-contexts/load-operational-order-contexts.usecase.ts';

describe('load operational order contexts', () => {
  it('combines canonical identity, latest source, and bounded cross-domain audit', async () => {
    const loadContexts = makeLoadOperationalOrderContexts({
      identities: {
        resolve: async (references) =>
          new Map(
            references.map((reference) => [
              reference.referenceId,
              {
                identity: {
                  displayNumber: 'ORDER-1',
                  customerDisplayName: 'Ada Lovelace',
                },
                canonical: {
                  canonicalOrderId: 'canonical-order-1',
                  canonicalFulfillmentId: 'fulfillment-1',
                  displayNumber: 'ORDER-1',
                  customer: {
                    resolution: 'resolved' as const,
                    userId: 'customer-1',
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    businessName: null,
                    phone: null,
                  },
                  commercialState: 'open' as const,
                  admissionState: 'released' as const,
                  versions: { order: 2, fulfillment: 3 },
                },
              },
            ]),
          ),
      },
      loadAudit: async () => ({
        sources: [
          {
            canonicalOrderId: 'canonical-order-1',
            name: 'cents',
            observedAt: new Date('2026-08-03T12:00:00.000Z'),
          },
        ],
        orderCommands: Array.from({ length: 8 }, (_, index) => ({
          canonicalOrderId: 'canonical-order-1',
          code: `ORDER_${index}`,
          actorId: 'manager-1',
          occurredAt: new Date(
            `2026-08-03T12:${(index + 1).toString().padStart(2, '0')}:00.000Z`,
          ),
        })),
        productionCommands: [
          {
            productionOrderId: 'production-order-1',
            code: 'PRODUCTION_LATEST',
            actorId: 'operator-1',
            occurredAt: new Date('2026-08-03T13:00:00.000Z'),
          },
        ],
      }),
    });

    const result = await loadContexts([
      {
        referenceId: 'production-order-1',
        productionOrderId: 'production-order-1',
        orderDemandId: null,
        fallbackDisplayNumber: 'legacy-order-1',
      },
    ]);

    const resolved = result.get('production-order-1');
    expect(resolved?.canonical?.source).toEqual({ name: 'cents' });
    expect(resolved?.canonical?.audit).toHaveLength(8);
    expect(resolved?.canonical?.audit[0]).toMatchObject({
      kind: 'production_command',
      code: 'PRODUCTION_LATEST',
    });
    expect(resolved?.canonical?.audit.at(-1)?.code).toBe('ORDER_1');
  });

  it('keeps unresolved legacy identity without inventing canonical context', async () => {
    const loadContexts = makeLoadOperationalOrderContexts({
      identities: {
        resolve: async (references) =>
          new Map(
            references.map((reference) => [
              reference.referenceId,
              {
                identity: {
                  displayNumber: reference.fallbackDisplayNumber,
                  customerDisplayName: null,
                },
                canonical: null,
              },
            ]),
          ),
      },
      loadAudit: async () => ({
        sources: [],
        orderCommands: [],
        productionCommands: [],
      }),
    });

    const result = await loadContexts([
      {
        referenceId: 'legacy-1',
        productionOrderId: null,
        orderDemandId: null,
        fallbackDisplayNumber: 'legacy-1',
      },
    ]);

    expect(result.get('legacy-1')).toEqual({
      identity: {
        displayNumber: 'legacy-1',
        customerDisplayName: null,
      },
      canonical: null,
    });
  });
});
