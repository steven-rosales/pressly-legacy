import { defineBoundaryContract, defineCellContract } from '@pressly/cells';
import {
  decodePricingChangeCommand,
  decodePublishPricingChangeFailure,
  decodePublishedPricingChange,
  encodePricingChangeCommand,
  encodePricingChangeFailure,
  encodePublishedPricingChange,
} from '../../../model/pricing-change-contract.ts';
import type {
  PricingChangeCommand,
  PublishedPricingChange,
} from '../../../model/pricing-change.ts';
import type { PublishPricingChangeExpectedFailure } from './types.ts';

export const publishPricingChangeContract = defineCellContract<
  PricingChangeCommand,
  PublishedPricingChange,
  PublishPricingChangeExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodePricingChangeCommand,
    encode: encodePricingChangeCommand,
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodePublishedPricingChange,
    encode: encodePublishedPricingChange,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodePublishPricingChangeFailure,
    encode: encodePricingChangeFailure,
  }),
});
