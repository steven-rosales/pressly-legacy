import { proveOperation } from '@pressly/testkit/operation-proof';
import { createShiftCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { decideCreateShift } from './decide.ts';
import type { CreateShiftCommand } from './types.ts';

const command = (overrides: Partial<CreateShiftCommand> = {}) => ({
  locationId: 'location-1',
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 4,
  idempotencyKey: 'create-shift-command-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  ...overrides,
});

describe('create shift decision', () => {
  proveOperation({
    operationId: 'production.create-shift.v1',
    declaration: createShiftCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'builds the exact initial shift facts without allocating identity',
        proves: ['decision'],
        run: () => {
          expect(
            decideCreateShift({ command: command(), policy: productionRules }),
          ).toEqual({
            kind: 'create',
            shift: {
              locationId: 'location-1',
              startsAt: '2026-08-22T13:00:00.000Z',
              endsAt: '2026-08-22T21:00:00.000Z',
              timezone: 'America/New_York',
              effectiveFolderCount: 4,
              status: 'open',
              version: 1,
            },
          });
        },
      },
    ],
  });

  it.each([
    ['equal', '2026-08-22T13:00:00.000Z'],
    ['earlier', '2026-08-22T12:59:59.999Z'],
    ['invalid', 'not-a-date'],
  ])('rejects an %s end instant as semantic validation', (_name, endsAt) => {
    expect(
      decideCreateShift({
        command: command({ endsAt }),
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'reject',
      failure: {
        kind: 'validation',
        classification: 'semantic',
        code: 'production_shift_window_invalid',
        message: 'Shift end must be after shift start.',
        safeMessage: 'Shift end must be after shift start.',
      },
    });
  });
});
