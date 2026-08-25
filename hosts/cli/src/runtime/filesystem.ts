import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type CliFileAccess = Readonly<{
  read: (path: string) => Promise<string | undefined>;
  writePrivate: (path: string, value: string) => Promise<void>;
  clear: (path: string) => Promise<void>;
  readText: (path: string) => Promise<string>;
}>;

const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

export const adminSessionPath = (): string =>
  join(homedir(), '.config', 'pressly', 'admin-session.json');

export const nodeCliFileAccess: CliFileAccess = Object.freeze({
  read: (path) =>
    readFile(path, 'utf8').catch((error: unknown) => {
      if (isMissingFile(error)) return undefined;
      throw error;
    }),
  writePrivate: async (path, value) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, value, { mode: 0o600 });
    await chmod(path, 0o600);
  },
  clear: (path) => rm(path, { force: true }),
  readText: (path) => readFile(path, { encoding: 'utf8' }),
});
