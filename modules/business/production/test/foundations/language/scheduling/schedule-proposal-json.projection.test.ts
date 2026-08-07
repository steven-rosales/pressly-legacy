import { isJsonObject } from '@pressly/codec';
import { describe, expect, it } from 'vitest';
import { projectScheduleProposalJson } from '../../../../src/foundations/language/scheduling/schedule-proposal-json.projection.ts';
import { scheduleProposalFixture } from '../../../support/schedule.fixture.ts';

describe('schedule proposal JSON projection', () => {
  it('projects a closed JSON object and omits absent optional warning fields', () => {
    const proposal = {
      ...scheduleProposalFixture(),
      warnings: [
        {
          code: 'NO_ACTIVE_WASHERS' as const,
          message: 'No active washers are available.',
          blocking: true,
        },
      ],
    };

    const projected = projectScheduleProposalJson(proposal);

    expect(isJsonObject(projected)).toBe(true);
    expect(projected['warnings']).toEqual([
      {
        code: 'NO_ACTIVE_WASHERS',
        message: 'No active washers are available.',
        blocking: true,
      },
    ]);
  });
});
