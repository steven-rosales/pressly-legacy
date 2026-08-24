import { publishSchedulerConfigRequestSchema } from '@pressly/production-system/contracts/scheduling/publish-scheduler-config';
import { publishSchedulerConfigContract } from '@pressly/production-system/operations/scheduling/publish-scheduler-config/contract';
import { describe, expect, it } from 'vitest';
import {
  makePublishSchedulerConfigConformanceCommand,
  publishSchedulerConfigConformanceIds as ids,
  publishSchedulerConfigConformanceLocationId as locationId,
} from '../src/public.ts';

const body = Object.freeze({
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  stageFitAssertion: Object.freeze({
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  }),
  idempotencyKey: 'publish-scheduler-config-conformance-1',
});

describe('publish scheduler config boundary conformance', () => {
  it('uses the exact deployed request shape at the public target contract', () => {
    expect(publishSchedulerConfigRequestSchema.parse(body)).toEqual(body);
    const decoded = publishSchedulerConfigContract.input.decode({
      params: { locationId },
      body,
      actorId: ids.actor,
    });
    expect(decoded).toEqual({
      kind: 'valid',
      value: makePublishSchedulerConfigConformanceCommand(),
    });
    if (decoded.kind === 'valid')
      expect(
        publishSchedulerConfigContract.input.encode(decoded.value),
      ).toEqual({
        params: { locationId },
        body,
        actorId: ids.actor,
      });
  });

  it.each(['sortingFits', 'washingFits', 'dryingFits'] as const)(
    'requires %s to remain literally true',
    (field) => {
      const invalidBody = {
        ...body,
        stageFitAssertion: { ...body.stageFitAssertion, [field]: false },
      };
      expect(
        publishSchedulerConfigRequestSchema.safeParse(invalidBody).success,
      ).toBe(false);
      expect(
        publishSchedulerConfigContract.input.decode({
          params: { locationId },
          body: invalidBody,
          actorId: ids.actor,
        }).kind,
      ).toBe('invalid');
    },
  );
});
