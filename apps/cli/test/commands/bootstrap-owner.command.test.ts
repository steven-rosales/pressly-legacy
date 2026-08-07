import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import type { BootstrapOwner } from '@pressly/identity';
import {
  executeBootstrapOwner,
  parseBootstrapOwnerArgs,
  requiredBootstrapOwnerEnvironmentValue,
  toBootstrapOwnerCommand,
} from '../../src/commands/bootstrap-owner.command.ts';

describe('owner bootstrap command', () => {
  it('accepts only an explicitly piped password', () => {
    expect(parseBootstrapOwnerArgs(['--password-stdin'], false)).toEqual({
      passwordFromStdin: true,
    });
    expect(() => parseBootstrapOwnerArgs([], false)).toThrowError(
      expect.objectContaining({ code: 'missing_password_stdin' }),
    );
    expect(() =>
      parseBootstrapOwnerArgs(['--password', 'secret'], false),
    ).toThrowError(
      expect.objectContaining({ code: 'unexpected_bootstrap_owner_arg' }),
    );
  });

  it('builds the application command without exposing process state', () => {
    expect(
      toBootstrapOwnerCommand(
        {
          PRESSLY_BOOTSTRAP_OWNER_EMAIL: 'owner@example.com',
          PRESSLY_BOOTSTRAP_OWNER_CONFIRM: 'bootstrap-first-owner',
        },
        'password from stdin',
      ),
    ).toEqual({
      businessId: '00000000-0000-4000-8000-000000000100',
      email: 'owner@example.com',
      password: 'password from stdin',
      confirmation: 'bootstrap-first-owner',
    });
  });

  it('reports missing executable configuration as a typed app error', () => {
    expect(() =>
      requiredBootstrapOwnerEnvironmentValue({}, 'DATABASE_URL'),
    ).toThrowError(
      expect.objectContaining({ code: 'missing_bootstrap_owner_env' }),
    );
  });

  it('maps expected application failures at the executable boundary', async () => {
    const bootstrapOwner: BootstrapOwner = async () =>
      result.err({
        kind: 'conflict',
        code: 'owner_already_bootstrapped',
        message: 'Owner bootstrap has already been completed.',
      });

    await expect(
      executeBootstrapOwner({
        bootstrapOwner,
        command: {
          businessId: 'business-1',
          email: 'owner@example.com',
          password: 'not logged',
          confirmation: 'bootstrap-first-owner',
        },
      }),
    ).rejects.toMatchObject({ code: 'owner_already_bootstrapped' });
  });
});
