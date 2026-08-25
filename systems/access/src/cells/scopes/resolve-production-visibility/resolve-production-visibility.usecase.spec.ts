import {
  businessScope,
  globalScope,
  locationScope,
  type Role,
  type Scope,
} from '../../../model/authorization/public.ts';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { resolveProductionVisibilityCellDeclaration } from './cell.ts';
import { makeResolveProductionVisibility } from './resolve-production-visibility.usecase.ts';

const now = new Date('2026-08-03T12:00:00.000Z');
const assignment = (role: Role, scope: Scope) => ({
  role,
  scope,
  state: 'active' as const,
  version: 1,
});

describe('resolve Production visibility', () => {
  proveOperation({
    operationId: 'access.resolve-production-visibility.v1',
    declaration: resolveProductionVisibilityCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'unions active direct and business-derived locations deterministically',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            principalAttributes: {
              identityActive: true,
              assignments: [
                assignment('operator', locationScope('direct-location')),
                assignment('manager', businessScope('business-b')),
                assignment('owner', businessScope('business-a')),
              ],
            },
          };
          expect(
            resolveProductionVisibilityCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const listLocationIdsForBusinesses = vi.fn(async () => [
            'derived-location',
            'direct-location',
          ]);
          const resolve = makeResolveProductionVisibility({
            ancestry: { listLocationIdsForBusinesses },
            clock: { now: () => new Date(now) },
          });

          await expect(resolve(input)).resolves.toEqual([
            'derived-location',
            'direct-location',
          ]);
          expect(listLocationIdsForBusinesses).toHaveBeenCalledWith([
            'business-b',
            'business-a',
          ]);
        },
      },
    ],
  });

  it('does not treat a global scope as deploy-wide Production authority', async () => {
    const listLocationIdsForBusinesses = vi.fn(async () => ['unexpected']);
    const resolve = makeResolveProductionVisibility({
      ancestry: { listLocationIdsForBusinesses },
      clock: { now: () => new Date(now) },
    });

    await expect(
      resolve({
        principalAttributes: {
          identityActive: true,
          assignments: [assignment('owner', globalScope())],
        },
      }),
    ).resolves.toEqual([]);
    expect(listLocationIdsForBusinesses).not.toHaveBeenCalled();
  });

  it('ignores expired, revoked, and non-Production assignments', async () => {
    const listLocationIdsForBusinesses = vi.fn(async () => []);
    const resolve = makeResolveProductionVisibility({
      ancestry: { listLocationIdsForBusinesses },
      clock: { now: () => new Date(now) },
    });

    await expect(
      resolve({
        principalAttributes: {
          identityActive: true,
          assignments: [
            {
              ...assignment('operator', locationScope('expired')),
              endsAt: new Date(now.getTime() - 1),
            },
            {
              ...assignment('manager', businessScope('revoked')),
              state: 'revoked',
            },
          ],
        },
      }),
    ).resolves.toEqual([]);
    expect(listLocationIdsForBusinesses).not.toHaveBeenCalled();
  });
});
