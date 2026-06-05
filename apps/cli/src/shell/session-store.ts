import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { LoginResult } from '@pressly/contracts';
import {
  err,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';

export type CliSession = Readonly<LoginResult>;

export type SessionStore = Readonly<{
  read: () => Promise<Result<CliSession | undefined, AppError>>;
  write: (session: CliSession) => Promise<Result<void, AppError>>;
  clear: () => Promise<Result<void, AppError>>;
}>;

export const defaultSessionPath = (): string =>
  join(homedir(), '.config', 'pressly', 'admin-session.json');

export const missingCliSession = (): AppError =>
  makeAppError({
    kind: 'PermissionError',
    code: 'missing_cli_session',
    message: 'No CLI session token exists.',
    safeMessage: 'Run auth login before this command.',
    status: 401,
  });

const sessionStoreError = (cause: unknown): AppError =>
  makeAppError({
    kind: 'ConfigError',
    code: 'session_store_failed',
    message: 'Could not access CLI session storage.',
    safeMessage: 'Could not access CLI session storage.',
    status: 500,
    cause,
  });

export const makeSessionStore = (
  path = defaultSessionPath(),
): SessionStore => ({
  read: async () => {
    try {
      const raw = await readFile(path, 'utf8').catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return undefined;

        throw error;
      });

      if (raw === undefined) return ok(undefined);

      return ok(JSON.parse(raw) as CliSession);
    } catch (cause) {
      return err(sessionStoreError(cause));
    }
  },

  write: async (session) => {
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, `${JSON.stringify(session, null, 2)}\n`, {
        mode: 0o600,
      });
      await chmod(path, 0o600);

      return ok(undefined);
    } catch (cause) {
      return err(sessionStoreError(cause));
    }
  },

  clear: async () => {
    try {
      await rm(path, { force: true });

      return ok(undefined);
    } catch (cause) {
      return err(sessionStoreError(cause));
    }
  },
});
