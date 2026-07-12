import { describe, expect, it, vi } from 'vitest';
import { makeJsonLogger } from '../src/json-logger.js';

describe('makeJsonLogger', () => {
  it('emits structured context and redacts sensitive values', () => {
    const write = vi.fn();
    const logger = makeJsonLogger({
      service: 'worker',
      environment: 'test',
      clock: { now: () => new Date('2026-07-12T16:00:00.000Z') },
      write,
    }).child({ runtime: 'worker', databaseUrl: 'postgres://user:secret@db' });

    logger.warn('request used Bearer token-value', {
      jobId: 'job-1',
      authorization: 'Bearer token-value',
    });

    const [line, level] = write.mock.calls[0] as [string, string];
    expect(JSON.parse(line)).toEqual({
      service: 'worker',
      environment: 'test',
      runtime: 'worker',
      databaseUrl: '[REDACTED]',
      jobId: 'job-1',
      authorization: '[REDACTED]',
      timestamp: '2026-07-12T16:00:00.000Z',
      level: 'warn',
      message: 'request used Bearer [REDACTED]',
    });
    expect(level).toBe('warn');
  });
});
