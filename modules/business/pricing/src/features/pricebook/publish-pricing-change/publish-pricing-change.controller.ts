import {
  defineValidatedController,
  sendValidatedApiResult,
} from '@pressly/http/express';
import { result } from '@pressly/kernel';
import type { RequestHandler } from 'express';
import { pricingChangeFailureToAppError } from '../../../foundations/adapters/http/pricing-change-failure/pricing-change-failure.adapter.ts';
import type { PricingChangeAuthor } from '../../../foundations/language/pricing-change/pricing-change.model.ts';
import {
  publishPricingChangeContract,
  toPublishPricingChangeCommand,
  toPublishPricingChangeResult,
} from './publish-pricing-change.contract.mapper.ts';
import type { PublishPricingChange } from './publish-pricing-change.usecase.ts';

export type ReadPricingChangeAuthor = (
  response: Parameters<RequestHandler>[1],
) => PricingChangeAuthor;

export const makePublishPricingChangeController = (input: {
  publishPricingChange: PublishPricingChange;
  readAuthor: ReadPricingChangeAuthor;
}) =>
  defineValidatedController({
    request: { body: publishPricingChangeContract.body },
    handle: async ({ body }, { response }) => {
      const published = await input.publishPricingChange(
        toPublishPricingChangeCommand(body, input.readAuthor(response)),
      );

      sendValidatedApiResult(
        response,
        result.mapError(pricingChangeFailureToAppError)(published),
        {
          schema: publishPricingChangeContract.response,
          present: toPublishPricingChangeResult,
        },
      );
    },
  });
