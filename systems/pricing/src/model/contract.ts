import type { ContractIssue } from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';

export const pricingContractIssues = (
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === 'string' || typeof segment === 'number'
        ? segment
        : String(segment),
    ),
    message: issue.message,
  }));

export const invalidPricingContractOutput = (
  code: string,
  message: string,
  cause: unknown,
): never => {
  throw invariantViolationError({
    code,
    message,
    safeMessage: 'The request could not be completed.',
    cause,
  });
};
