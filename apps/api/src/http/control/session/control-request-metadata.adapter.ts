import type { Request, Response } from 'express';

export const controlRequestId = (response: Response): string | undefined =>
  response.locals['requestId'] as string | undefined;

export const controlRequestMetadata = (
  request: Request,
  response: Response,
) => ({
  ...(request.ip ? { ipAddress: request.ip } : {}),
  ...(request.header('user-agent') === undefined
    ? {}
    : { userAgent: request.header('user-agent')! }),
  ...(controlRequestId(response) === undefined
    ? {}
    : { requestId: controlRequestId(response)! }),
});
