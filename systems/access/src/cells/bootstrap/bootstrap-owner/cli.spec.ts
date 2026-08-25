import type { CliInvocation } from '@pressly/cells';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { bootstrapOwnerCellDeclaration } from './cell.ts';
import {
  bootstrapOwnerCliSurface,
  type BootstrapOwnerCliEnvironment,
} from './cli.ts';

const environment: BootstrapOwnerCliEnvironment = {
  businessId: '00000000-0000-4000-8000-000000000100',
  businessSlug: 'pressly-one',
  businessDisplayName: 'Pressly One',
  email: 'owner@example.com',
  confirmation: 'bootstrap-first-owner',
};

const invocation = (stdin: string): CliInvocation => ({
  command: {
    id: bootstrapOwnerCliSurface.id,
    name: bootstrapOwnerCliSurface.name,
  },
  arguments: {},
  options: { 'password-stdin': true },
  stdin,
  context: { 'bootstrap-owner-environment': environment },
  prompt: null,
  signal: new AbortController().signal,
});

describe('bootstrap-owner CLI surface', () => {
  proveOperation({
    operationId: 'access.bootstrap-owner.v2',
    declaration: bootstrapOwnerCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'maps redirected stdin and host environment into the declared command',
        proves: ['protocol'],
        run: async () => {
          expect(bootstrapOwnerCliSurface.stdin).toEqual({
            mode: 'required',
            encoding: 'utf8',
            maxBytes: 4_096,
            tty: 'forbid',
          });
          expect(bootstrapOwnerCliSurface.contextRequirements).toEqual([
            'bootstrap-owner-environment',
          ]);
          const serialized = await bootstrapOwnerCliSurface.toSerializedInput(
            invocation('Password-123!\r\n\n'),
          );
          expect(serialized).toEqual({
            ...environment,
            password: 'Password-123!\r\n',
          });
          expect(
            bootstrapOwnerCellDeclaration.contract.input.decode(serialized),
          ).toEqual({
            kind: 'valid',
            value: { ...environment, password: 'Password-123!\r\n' },
          });
        },
      },
    ],
  });

  it('preserves exact success, expected-failure, and password-argument bytes', () => {
    expect(
      bootstrapOwnerCliSurface.present(
        {
          kind: 'success',
          value: {
            identityId: '00000000-0000-4000-8000-000000000001',
            email: 'owner@example.com',
            role: 'owner',
            replayed: false,
          },
        },
        invocation('Password-123!\n'),
      ),
    ).toEqual({
      stdout:
        '{"identityId":"00000000-0000-4000-8000-000000000001","email":"owner@example.com","role":"owner","replayed":false}\n',
      exitCode: 0,
    });
    expect(
      bootstrapOwnerCliSurface.present(
        {
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'owner_already_bootstrapped',
            message: 'Owner bootstrap has already been completed.',
          },
        },
        invocation('Password-123!\n'),
      ),
    ).toEqual({
      stderr: 'Owner bootstrap has already been completed.\n',
      exitCode: 1,
    });
    expect(
      bootstrapOwnerCliSurface.presentInvalidInvocation({
        code: 'option_unknown',
        message: 'Unknown option.',
        details: { option: '--password' },
      }),
    ).toEqual({
      stderr:
        'Do not pass the owner password as an argument. Pipe it with --password-stdin.\n',
      exitCode: 1,
    });
    expect(
      bootstrapOwnerCliSurface.presentInvalidInvocation({
        code: 'stdin_tty_forbidden',
        message: 'TTY forbidden.',
      }),
    ).toEqual({
      stderr: 'Pipe the owner password with --password-stdin.\n',
      exitCode: 1,
    });
  });
});
