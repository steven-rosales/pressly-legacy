import {
  mfaMutationResultSchema,
  type MfaMutationResult,
} from '@pressly/contracts/auth';
import type { MfaMutation } from './remove-mfa.model.ts';

export const removeMfaContract = Object.freeze({
  response: mfaMutationResultSchema,
});

export const toMfaMutationResult = (
  mutation: MfaMutation,
): MfaMutationResult => ({ updated: mutation.updated });
