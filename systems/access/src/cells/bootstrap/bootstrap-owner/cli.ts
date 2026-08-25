import {
  cli,
  type CliInvocation,
  type CliInvocationFailure,
} from '@pressly/cells';
import type { BootstrapOwnerFailure } from './bootstrap-owner.failure.ts';
import type { BootstrapOwnerResult } from './bootstrap-owner.usecase.ts';

export type BootstrapOwnerCliEnvironment = Readonly<{
  businessId: string;
  businessSlug: string;
  businessDisplayName: string;
  confirmation: string;
  email: string;
}>;

const presentation = Object.freeze({
  success: Object.freeze({ stream: 'stdout' as const, exitCodes: [0] }),
  failure: Object.freeze({ stream: 'stderr' as const, exitCodes: [1] }),
  invalidInvocation: Object.freeze({
    stream: 'stderr' as const,
    exitCode: 1,
  }),
});

const environmentFrom = (
  invocation: CliInvocation,
): BootstrapOwnerCliEnvironment =>
  invocation.context[
    'bootstrap-owner-environment'
  ] as BootstrapOwnerCliEnvironment;

const invalidMessage = (failure: CliInvocationFailure): string => {
  if (
    failure.code === 'option_missing' ||
    failure.code === 'stdin_required' ||
    failure.code === 'stdin_tty_forbidden'
  )
    return 'Pipe the owner password with --password-stdin.';
  if (
    failure.code === 'option_unknown' ||
    failure.code === 'argument_unexpected'
  )
    return 'Do not pass the owner password as an argument. Pipe it with --password-stdin.';
  return failure.message;
};

export const bootstrapOwnerCliSurface = cli.command<
  BootstrapOwnerResult,
  BootstrapOwnerFailure
>({
  id: 'access.bootstrap-owner-command.v2',
  name: ['bootstrap', 'owner'],
  options: [
    {
      name: 'password-stdin',
      short: null,
      value: 'boolean',
      required: true,
      repeatable: true,
    },
  ],
  stdin: {
    mode: 'required',
    encoding: 'utf8',
    maxBytes: 4_096,
    tty: 'forbid',
  },
  contextRequirements: ['bootstrap-owner-environment'],
  presentation,
  toSerializedInput: (invocation) => {
    const environment = environmentFrom(invocation);
    return {
      businessId: environment.businessId,
      businessSlug: environment.businessSlug,
      businessDisplayName: environment.businessDisplayName,
      email: environment.email,
      password: (invocation.stdin ?? '').replace(/\r?\n$/, ''),
      confirmation: environment.confirmation,
    };
  },
  present: (outcome) =>
    outcome.kind === 'success'
      ? {
          stdout: `${JSON.stringify(outcome.value)}\n`,
          exitCode: 0,
        }
      : { stderr: `${outcome.failure.message}\n`, exitCode: 1 },
  presentInvalidInvocation: (failure) => ({
    stderr: `${invalidMessage(failure)}\n`,
    exitCode: 1,
  }),
});
