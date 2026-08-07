import { describe, expect, it } from 'vitest';
import {
  toCreateScheduleCommand,
  toCreateScheduleResult,
} from '../../../../src/features/scheduling/create-schedule/create-schedule.contract.mapper.ts';
import { scheduleProposalFixture } from '../../../support/schedule.fixture.ts';

describe('create schedule mapper', () => {
  it('maps the trusted HTTP request into the application command', () => {
    expect(
      toCreateScheduleCommand(
        { locationId: 'location-1', actorId: 'actor-1' },
        {
          productionShiftId: '00000000-0000-4000-8000-000000000002',
          schedulerConfigId: '00000000-0000-4000-8000-000000000003',
          idempotencyKey: 'schedule-create-1',
        },
      ),
    ).toEqual({
      locationId: 'location-1',
      productionShiftId: '00000000-0000-4000-8000-000000000002',
      schedulerConfigId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'schedule-create-1',
      actorId: 'actor-1',
    });
  });

  it('copies the immutable proposal into the serialized result', () => {
    const proposal = scheduleProposalFixture();
    const wire = toCreateScheduleResult(proposal);

    expect(wire).toEqual(proposal);
    expect(wire.batches).not.toBe(proposal.batches);
    expect(wire.batches[0]?.stages).not.toBe(proposal.batches[0]?.stages);
    expect(wire.warnings).not.toBe(proposal.warnings);
  });
});
