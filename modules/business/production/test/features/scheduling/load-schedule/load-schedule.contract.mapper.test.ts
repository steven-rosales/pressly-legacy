import { describe, expect, it } from 'vitest';
import {
  toLoadScheduleCommand,
  toLoadScheduleResult,
} from '../../../../src/features/scheduling/load-schedule/load-schedule.contract.mapper.ts';
import { scheduleProposalFixture } from '../../../support/schedule.fixture.ts';

describe('load schedule mapper', () => {
  it('maps route identity inward and copies the proposal outward', () => {
    const params = {
      locationId: 'location-1',
      scheduleRunId: '00000000-0000-4000-8000-000000000001',
    };
    const proposal = scheduleProposalFixture();
    const wire = toLoadScheduleResult(proposal);

    expect(toLoadScheduleCommand(params)).toEqual(params);
    expect(wire).toEqual(proposal);
    expect(wire.batches).not.toBe(proposal.batches);
    expect(wire.acknowledgedWarningCodes).not.toBe(
      proposal.acknowledgedWarningCodes,
    );
  });
});
