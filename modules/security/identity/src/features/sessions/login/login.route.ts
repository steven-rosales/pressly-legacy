import { Router } from 'express';
import type { Login } from './login.usecase.ts';
import { loginBoundary, makeLoginController } from './login.controller.ts';

export const makeLoginRoute = (login: Login): Router => {
  const router = Router();

  router.post('/', loginBoundary.validate, makeLoginController(login));

  return router;
};
