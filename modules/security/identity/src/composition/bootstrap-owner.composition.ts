import { makePasswordHasher } from '@pressly/auth/credentials';
import type { Database } from '@pressly/db/client';
import { makeBootstrapOwnerStore } from '../features/bootstrap/bootstrap-owner/bootstrap-owner.repo.ts';
import {
  makeBootstrapOwner,
  type BootstrapOwner,
} from '../features/bootstrap/bootstrap-owner/bootstrap-owner.usecase.ts';

export const makePostgresBootstrapOwner = (db: Database): BootstrapOwner =>
  makeBootstrapOwner({
    store: makeBootstrapOwnerStore(db),
    passwordHasher: makePasswordHasher(),
  });
