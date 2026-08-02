import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiSuccess } from '@pressly/http';
import type { PricingChangeRequest } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { PublishPricingChange } from './publish-pricing-change.usecase.ts';

type ReadPricingChangeAuthor = (
  res: Parameters<RequestHandler>[1],
) => Parameters<PublishPricingChange>[0]['requestedBy'];

export const makePublishPricingChangeController = (input: {
  publishPricingChange: PublishPricingChange;
  readAuthor: ReadPricingChangeAuthor;
}): RequestHandler =>
  catchAsync(async (req, res) => {
    const body = req.body as PricingChangeRequest;
    const requestedBy = input.readAuthor(res);
    const publishResult = await input.publishPricingChange({
      serviceSlug: body.serviceSlug,
      reason: body.reason,
      items: body.items,
      requestedBy,
    });

    if (result.isErr(publishResult)) throw publishResult.error;

    res.status(200).json(apiSuccess(publishResult.value));
  });
