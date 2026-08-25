import { proveOperation } from '@pressly/testkit/operation-proof';
import { subscribeProductionChangesCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { subscribeProductionChangesContract } from './contract.ts';

describe('subscribe production changes contract', () => {
  proveOperation({
    operationId: 'production.subscribe-changes.v1',
    declaration: subscribeProductionChangesCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the versioned input and initial revision',
        proves: ['contract'],
        run: () => {
          const input = { locationId: 'east' };
          const ready = { revision: 8 };

          expect(
            subscribeProductionChangesContract.input.decode(
              subscribeProductionChangesContract.input.encode(input),
            ),
          ).toEqual({ kind: 'valid', value: input });
          expect(
            subscribeProductionChangesContract.output.decode(
              subscribeProductionChangesContract.output.encode(ready),
            ),
          ).toEqual({ kind: 'valid', value: ready });
        },
      },
    ],
  });

  it('rejects missing locations and invalid revisions', () => {
    expect(
      subscribeProductionChangesContract.input.decode({ locationId: '' }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      subscribeProductionChangesContract.output.decode({ revision: -1 }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      subscribeProductionChangesContract.output.decode({ revision: 1.5 }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('accepts only canonical change and reconnect-resync events', () => {
    expect(
      subscribeProductionChangesContract.event.decode({
        kind: 'change',
        revision: 9,
      }),
    ).toEqual({
      kind: 'valid',
      value: { kind: 'change', revision: 9 },
    });
    expect(
      subscribeProductionChangesContract.event.decode({
        kind: 'resync',
        reason: 'upstream_reconnected',
      }),
    ).toEqual({
      kind: 'valid',
      value: { kind: 'resync', reason: 'upstream_reconnected' },
    });
    expect(
      subscribeProductionChangesContract.event.decode({
        kind: 'resync',
        reason: 'arbitrary',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('round-trips the typed missing-location failure', () => {
    const failure = {
      kind: 'not_found' as const,
      code: 'production_location_not_found' as const,
      message: 'Production location east was not found.',
      safeMessage: 'The production location was not found.',
    };

    expect(
      subscribeProductionChangesContract.failure.decode(
        subscribeProductionChangesContract.failure.encode(failure),
      ),
    ).toEqual({ kind: 'valid', value: failure });
  });
});
