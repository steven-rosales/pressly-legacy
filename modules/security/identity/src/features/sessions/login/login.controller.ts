import type { Request, Response } from 'express';
import {
  defineValidatedController,
  sendValidatedApiResult,
} from '@pressly/http/express';
import {
  loginContract,
  toLoginHttpError,
  toLoginResult,
} from './login.contract.mapper.ts';
import type { Login } from './login.usecase.ts';

const loginRequestMetadata = (request: Request, response: Response) => {
  const userAgent = request.header('user-agent');
  const requestId = response.locals?.['requestId'] as string | undefined;

  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(requestId === undefined ? {} : { requestId }),
  };
};

export const makeLoginController = (login: Login) =>
  defineValidatedController({
    request: { body: loginContract.request },
    handle: async ({ body }, { request, response }) => {
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
    },
  });
