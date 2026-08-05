import { Router } from 'express';
import type { Login } from './login.usecase.ts';
import { makeLoginController } from './login.controller.ts';

export const makeLoginRoute = (login: Login): Router => {
  const router = Router();
  const controller = makeLoginController(login);

  router.post('/', controller.validate, controller.handle);

  return router;
};
