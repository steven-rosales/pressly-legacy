import type { PublishPricingChangeResult } from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';

import type {
  CommitPricingChangePlanInput,
  CurrentPricingForPublish,
  LoadCurrentPricingForPublishInput,
  PricingChangeStore,
} from '../../src/publish-pricing/publish-pricing-change.port.ts';
import {
  makeCurrentPricingItems,
  makeCurrentPricingSet,
} from './pricing-change.builder.ts';

type FakePricingChangeStoreInput = Partial<
  Readonly<{
    current: CurrentPricingForPublish;
    publishResult: PublishPricingChangeResult;
    loadResult: Result<CurrentPricingForPublish, AppError>;
    commitResult: Result<PublishPricingChangeResult, AppError>;
  }>
>;

export const makeFakePricingChangeStore = (
  input: FakePricingChangeStoreInput = {},
) => {
  const calls = {
    load: [] as LoadCurrentPricingForPublishInput[],
    commit: [] as CommitPricingChangePlanInput[],
  };

  const current = input.current ?? {
    currentSet: makeCurrentPricingSet(),
    currentItems: makeCurrentPricingItems(),
  };

  const publishResult = input.publishResult ?? {
    oldPricingSetId: 'set_1',
    newPricingSetId: 'set_2',
    auditEventId: 'event_1',
    changeItemCount: 1,
  };

  const store: PricingChangeStore = {
    loadCurrentPricingForPublish: async (command) => {
      calls.load.push(command);
      return input.loadResult ?? result.ok(current);
    },

    commitPricingChangePlan: async (command) => {
      calls.commit.push(command);
      return input.commitResult ?? result.ok(publishResult);
    },
  };

  return { store, calls };
};
