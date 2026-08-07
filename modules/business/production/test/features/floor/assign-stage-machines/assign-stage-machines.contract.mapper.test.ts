import { describe, expect, it } from 'vitest';
import { toAssignStageMachinesResult } from '../../../../src/features/floor/assign-stage-machines/assign-stage-machines.contract.mapper.ts';

describe('assign stage machines mapper', () => {
  it('maps the module mutation result into its serialized response', () => {
    expect(
      toAssignStageMachinesResult({
        entityId: '00000000-0000-4000-8000-000000000001',
        version: 3,
        replayed: true,
      }),
    ).toEqual({
      entityId: '00000000-0000-4000-8000-000000000001',
      version: 3,
      replayed: true,
    });
  });
});
