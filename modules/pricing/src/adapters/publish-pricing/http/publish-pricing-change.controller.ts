import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import type { PublishPricingChangeCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { PublishPricingChange } from '../../../features/publish-pricing/publish-pricing-change.usecase.ts';

export const makePublishPricingChangeController = (
  publishPricingChange: PublishPricingChange,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const command = req.body as PublishPricingChangeCommand;
    const result = await publishPricingChange(command);

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
