import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import type {
  PricingChangeAuthor,
  PricingChangeRequest,
} from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { PublishPricingChange } from '../../../features/publish-pricing/publish-pricing-change.usecase.ts';

type ReadPricingChangeAuthor = (
  res: Parameters<RequestHandler>[1],
) => PricingChangeAuthor;

export const makePublishPricingChangeController = (input: {
  publishPricingChange: PublishPricingChange;
  readAuthor: ReadPricingChangeAuthor;
}): RequestHandler =>
  catchAsync(async (req, res) => {
    const body = req.body as PricingChangeRequest;
    const requestedBy = input.readAuthor(res);
    const result = await input.publishPricingChange({
      ...body,
      requestedBy,
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
