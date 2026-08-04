import type { Response } from 'express';
import { sendValidatedApiResult } from '@pressly/http/express';
import { result, type Result } from '@pressly/kernel';
import type { ProductionFeatureFailure } from '../../language/failures/production-feature.failure.ts';
import { productionFailureToAppError } from './production-failure.adapter.ts';

type ResponseContract<Value, Output> = Parameters<
  typeof sendValidatedApiResult<Value, Output>
>[2];

/** Converts expected Production data into HTTP errors only at the controller edge. */
export const sendValidatedProductionResult = <Value, Output>(
  response: Response,
  outcome: Result<Value, ProductionFeatureFailure>,
  contract: ResponseContract<Value, Output>,
): void =>
  sendValidatedApiResult(
    response,
    result.mapError(productionFailureToAppError)(outcome),
    contract,
  );
