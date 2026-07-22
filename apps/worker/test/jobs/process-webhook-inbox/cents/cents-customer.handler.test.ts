import type { UsersApplication } from '@pressly/users';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import { describe, expect, it, vi } from 'vitest';
import { makeCentsCustomerHandler } from '../../../../src/jobs/process-webhook-inbox/cents/cents-customer.handler.ts';
import { makeCentsMarketingHandler } from '../../../../src/jobs/process-webhook-inbox/cents/cents-marketing.handler.ts';

const customer = {
  externalUserId: 'customer-1',
  centsCustomerId: '815',
  firstName: 'Fixture',
  lastName: 'Customer',
  phone: '+15550000000',
  businessName: null,
  email: null,
  isCommercial: false,
  isInvoicingEnabled: false,
  referralCode: null,
  sourceUpdatedAt: null,
  sourceSnapshot: { customerMetrics: { loyaltyPointsBalance: 10 } },
} as const;

const event = (
  overrides: Partial<ClaimedWebhookEvent> = {},
): ClaimedWebhookEvent => ({
  eventId: '00000000-0000-4000-8000-000000000001',
  workerId: 'worker-1',
  attempt: 1,
  source: 'cents',
  eventType: 'customer_updated',
  subjectType: 'customer',
  subjectId: 'customer-1',
  sourceLocationId: null,
  sourceOccurredAt: null,
  receivedAt: '2026-07-10T13:00:01.000Z',
  payloadHash: 'a'.repeat(64),
  recoveredLease: false,
  payload: customer,
  ...overrides,
});

const application = (input?: {
  observeSource?: ReturnType<typeof vi.fn>;
  recordConsent?: ReturnType<typeof vi.fn>;
}): UsersApplication =>
  ({
    observeSource:
      input?.observeSource ??
      vi.fn(async () => ({
        tag: 'ok' as const,
        value: { userId: 'user-1', version: 1, outcome: 'created' as const },
      })),
    recordConsent:
      input?.recordConsent ??
      vi.fn(async () => ({
        tag: 'ok' as const,
        value: { userId: 'user-1', replayed: false },
      })),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    followSourceField: vi.fn(),
    resolveSource: vi.fn(),
  }) as UsersApplication;

describe('Cents customer consumers', () => {
  it('uses immutable inbox receipt time when Cents omits a customer revision', async () => {
    const observeSource = vi.fn(async () => ({
      tag: 'ok' as const,
      value: { userId: 'user-1', version: 1, outcome: 'created' as const },
    }));
    const consumer = makeCentsCustomerHandler({
      users: application({ observeSource }),
    });

    await expect(consumer(event())).resolves.toEqual({ tag: 'ok' });
    expect(observeSource).toHaveBeenCalledWith(
      expect.objectContaining({
        externalUserId: 'customer-1',
        revision: expect.objectContaining({
          at: new Date('2026-07-10T13:00:01.000Z'),
        }),
      }),
    );
  });

  it('observes the exact customer before appending marketing consent', async () => {
    const observeSource = vi.fn(async () => ({
      tag: 'ok' as const,
      value: { userId: 'user-1', version: 1, outcome: 'created' as const },
    }));
    const recordConsent = vi.fn(async () => ({
      tag: 'ok' as const,
      value: { userId: 'user-1', replayed: false },
    }));
    const consumer = makeCentsMarketingHandler({
      users: application({ observeSource, recordConsent }),
    });

    await expect(
      consumer(
        event({
          eventType: 'customer_marketing_optin',
          subjectType: 'marketing',
          payload: { customer, granted: true, sourceSnapshot: {} },
        }),
      ),
    ).resolves.toEqual({ tag: 'ok' });
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        externalUserId: 'customer-1',
        kind: 'marketing',
        granted: true,
      }),
    );
    expect(observeSource.mock.invocationCallOrder[0]).toBeLessThan(
      recordConsent.mock.invocationCallOrder[0]!,
    );
  });
});
