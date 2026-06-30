import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { LoginRequest } from '@pressly/contracts';
import type { Login } from '../../../features/login/login.usecase.ts';

export const makeLoginController = (login: Login): RequestHandler =>
  catchAsync(async (req, res) => {
    const body = req.body as LoginRequest;

    const loginResult = await login({
      email: body.email,
      password: body.password,
      ...(req.ip ? { ipAddress: req.ip } : {}),
      ...(req.header('user-agent')
        ? { userAgent: req.header('user-agent')! }
        : {}),
      ...((res.locals?.['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: res.locals?.['requestId'] as string }),
    });

    if (result.isErr(loginResult)) {
      res.status(loginResult.error.status).json(apiFailure(loginResult.error));
      return;
    }

    res.status(200).json(apiSuccess(loginResult.value));
  });
