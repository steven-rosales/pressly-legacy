import { result, type Result } from '@pressly/kernel';

import type {
  PricingChangeCommitFailure,
  PricingChangeReadFailure,
} from '../../src/foundations/language/pricing-change/pricing-change.failure.ts';
import type {
  CurrentPricing,
  PublishedPricingChange,
} from '../../src/foundations/language/pricing-change/pricing-change.model.ts';
import type {
  LoadCurrentPricingInput,
  CurrentPricingReader,
} from '../../src/foundations/ports/current-pricing-reader/current-pricing-reader.port.ts';
import type {
  CommitPricingChangeInput,
  PricingChangePublisher,
} from '../../src/features/pricebook/publish-pricing-change/publish-pricing-change.port.ts';
import {
  makeCurrentPricingItems,
  makeCurrentPricingSet,
} from './pricing-change.builder.ts';

type FakePricingChangeStoreInput = Partial<
  Readonly<{
    current: CurrentPricing;
    publishResult: PublishedPricingChange;
    loadResult: Result<CurrentPricing, PricingChangeReadFailure>;
    commitResult: Result<PublishedPricingChange, PricingChangeCommitFailure>;
  }>
>;

export const makeFakePricingChangeStore = (
  input: FakePricingChangeStoreInput = {},
) => {
  const calls = {
    load: [] as LoadCurrentPricingInput[],
    commit: [] as CommitPricingChangeInput[],
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

  const loadCurrentPricing: CurrentPricingReader = async (command) => {
    calls.load.push(command);
    return input.loadResult ?? result.ok(current);
  };

  const publishPricingChange: PricingChangePublisher = async (command) => {
    calls.commit.push(command);
    return input.commitResult ?? result.ok(publishResult);
  };

  return { loadCurrentPricing, publishPricingChange, calls };
};
