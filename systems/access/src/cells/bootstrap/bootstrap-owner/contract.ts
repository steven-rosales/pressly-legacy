import { z } from 'zod';
import type { BootstrapOwner } from './bootstrap-owner.usecase.ts';
import {
  defineAccessCellContract,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const bootstrapOwnerContract = defineAccessCellContract<
  OperationInput<BootstrapOwner>,
  OperationOutput<BootstrapOwner>,
  OperationFailure<BootstrapOwner>
>({
  label: 'access.bootstrap-owner.v2',
  input: z
    .object({
      businessId: z.uuid(),
      businessSlug: z
        .string()
        .trim()
        .toLowerCase()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      businessDisplayName: z.string().trim().min(1).max(200),
      email: z.string(),
      password: z.string().max(4_096),
      confirmation: z.string(),
    })
    .strict(),
  output: z
    .object({
      identityId: z.uuid(),
      email: z.string(),
      role: z.literal('owner'),
      replayed: z.boolean(),
    })
    .strict(),
  failure: z.union([
    z
      .object({
        kind: z.literal('validation'),
        code: z.enum([
          'missing_bootstrap_owner_email',
          'invalid_bootstrap_owner_email',
          'invalid_bootstrap_owner_confirmation',
          'invalid_bootstrap_business_slug',
          'invalid_bootstrap_business_display_name',
          'bootstrap_owner_password_too_long',
        ]),
        message: z.string(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('validation'),
        code: z.literal('weak_bootstrap_owner_password'),
        message: z.string(),
        violations: z.array(
          z.enum([
            'password_too_short',
            'password_requires_lowercase',
            'password_requires_uppercase',
            'password_requires_number',
            'password_requires_symbol',
          ]),
        ),
      })
      .strict(),
    z
      .object({
        kind: z.literal('conflict'),
        code: z.enum([
          'owner_already_bootstrapped',
          'bootstrap_owner_identity_already_exists',
          'bootstrap_owner_business_conflict',
          'bootstrap_owner_credential_conflict',
        ]),
        message: z.string(),
      })
      .strict(),
  ]),
});
