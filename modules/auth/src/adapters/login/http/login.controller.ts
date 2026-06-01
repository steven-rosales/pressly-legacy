import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import type { LoginRequest } from '@pressly/contracts';
import type { Login } from '../../../features/login/login.usecase.ts';

export const makeLoginController = (login: Login): RequestHandler =>
  catchAsync(async (req, res) => {
    const body = req.body as LoginRequest;

    const result = await login({
      email: body.email,
      password: body.password,
      ...(req.ip ? { ipAddress: req.ip } : {}),
      ...(req.header('user-agent')
        ? { userAgent: req.header('user-agent')! }
        : {}),
    });

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
