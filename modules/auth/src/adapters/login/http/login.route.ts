import { Router } from 'express';
import { loginRequestSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { Login } from '../../../features/login/login.usecase.ts';
import { makeLoginController } from './login.controller.ts';

export const makeLoginRoute = (login: Login): Router => {
  const router = Router();

  router.post(
    '/',
    validateRequest({ body: loginRequestSchema }),
    makeLoginController(login),
  );

  return router;
};
