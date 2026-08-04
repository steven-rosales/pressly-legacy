import { describe, expect, it } from 'vitest';
import {
  canonicalCustomerDisplayName,
  recentOperationalOrderAudit,
} from '../../../../src/foundations/language/operational-order/operational-order.policy.ts';

describe('operational order language', () => {
  it('prefers a normalized business name and otherwise joins personal names', () => {
    expect(
      canonicalCustomerDisplayName({
        businessName: '  Northwind   Hotel ',
        firstName: 'Ignored',
        lastName: 'Person',
      }),
    ).toBe('Northwind Hotel');
    expect(
      canonicalCustomerDisplayName({
        businessName: null,
        firstName: ' Ada ',
        lastName: ' Lovelace ',
      }),
    ).toBe('Ada Lovelace');
  });

  it('sorts newest-first with deterministic ties and bounds the projection', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      kind: 'order_command' as const,
      code: `ORDER_${index.toString().padStart(2, '0')}`,
      occurredAt: '2026-08-03T12:00:00.000Z',
      actor: 'manager-1',
      outcome: null,
    }));

    expect(
      recentOperationalOrderAudit(entries).map(({ code }) => code),
    ).toEqual(entries.slice(0, 8).map(({ code }) => code));
  });
});
