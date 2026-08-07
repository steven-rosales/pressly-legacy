import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { result } from '@pressly/kernel';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import { makeSessionStore } from '../../src/shell/session-store.ts';

const directories: string[] = [];

const sessionPath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'pressly-cli-session-'));
  directories.push(directory);
  return join(directory, 'session.json');
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('CLI session store', () => {
  it('validates stored sessions before returning them', async () => {
    const path = await sessionPath();
    await writeFile(
      path,
      JSON.stringify({
        accessToken: 'token_12345678901234567890123456789012',
        expiresAt: '2026-08-02T12:00:00.000Z',
        principal: {
          identityId: '00000000-0000-4000-8000-000000000001',
          displayName: 'Steven',
          roles: ['owner'],
        },
      }),
      'utf8',
    );

    const response = await makeSessionStore(path).read();

    expect(result.isOk(response)).toBe(true);
    if (result.isErr(response)) return;
    expect(response.value?.principal.displayName).toBe('Steven');
  });

  it('rejects structurally invalid session JSON', async () => {
    const path = await sessionPath();
    await writeFile(
      path,
      JSON.stringify({ accessToken: 'short', expiresAt: 'not-a-date' }),
      'utf8',
    );

    const response = await makeSessionStore(path).read();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error.code).toBe('session_store_failed');
    expect(response.error.cause).toBeInstanceOf(z.ZodError);
  });

  it('retains invalid JSON as the private session-store cause', async () => {
    const path = await sessionPath();
    await writeFile(path, '{not-json', 'utf8');

    const response = await makeSessionStore(path).read();

    expect(result.isErr(response)).toBe(true);
    if (result.isOk(response)) return;
    expect(response.error.code).toBe('session_store_failed');
    expect(response.error.cause).toBeInstanceOf(SyntaxError);
  });
});
