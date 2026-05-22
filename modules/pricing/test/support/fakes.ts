import { ok, type AppError, type Result } from '@pressly/errors';
import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type { EffectivePricingCatalogFinder } from '../../src/features/load-pricing-catalog/load-pricing-catalog.port.ts';
import type {
  CommitPricingChangePlanInput,
  CurrentPricingForPublish,
  LoadCurrentPricingForPublishInput,
  PricingChangeStore,
} from '../../src/features/publish-pricing/publish-pricing-change.port.ts';
import { makeCurrentPricingItems, makeCurrentPricingSet } from './builders.ts';

type FakeEffectivePricingCatalogFinderInput = Partial<
  Readonly<{
    result: Result<LoadPricingCatalogResult, AppError>;
  }>
>;

export const makeFakeEffectivePricingCatalogFinder = (
  input: FakeEffectivePricingCatalogFinderInput = {},
) => {
  const calls = {
    find: [] as LoadPricingCatalogCommand[],
  };

  const result =
    input.result ??
    ok({
      serviceSlug: 'wash-fold',
      currency: 'USD',
      updatedAt: '2026-05-21T12:00:00.000Z',
      items: [
        {
          service: 'wash_fold',
          unit: 'order',
          category: 'Fee',
          name: 'Delivery Fee',
          priceCents: 495,
          sortOrder: 30,
          metadata: {},
        },
      ],
    });

  const finder: EffectivePricingCatalogFinder = {
    findEffectivePricingCatalog: async (command) => {
      calls.find.push(command);

      return result;
    },
  };

  return { finder, calls };
};

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
      return input.loadResult ?? ok(current);
    },

    commitPricingChangePlan: async (command) => {
      calls.commit.push(command);

      return input.commitResult ?? ok(publishResult);
    },
  };

  return { store, calls };
};
