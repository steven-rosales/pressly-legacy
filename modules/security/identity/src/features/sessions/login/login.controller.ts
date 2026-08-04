import type { Request, RequestHandler, Response } from 'express';
import {
  defineRequestBoundary,
  sendValidatedApiResult,
} from '@pressly/http/express';
import {
  loginContract,
  toLoginHttpError,
  toLoginResult,
} from './login.contract.mapper.ts';
import type { Login } from './login.usecase.ts';

export const loginBoundary = defineRequestBoundary({
  body: loginContract.request,
});

const loginRequestMetadata = (request: Request, response: Response) => {
  const userAgent = request.header('user-agent');
  const requestId = response.locals?.['requestId'] as string | undefined;

  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(requestId === undefined ? {} : { requestId }),
  };
};

export const makeLoginController = (login: Login): RequestHandler =>
  loginBoundary.handler(async ({ body }, { request, response }) => {
    const loginResult = await login({
      email: body.email,
      password: body.password,
      ...loginRequestMetadata(request, response),
    });

    sendValidatedApiResult(response, loginResult, {
      schema: loginContract.response,
      present: toLoginResult,
      mapFailure: toLoginHttpError,
    });
  });
