import { writeFile } from 'node:fs/promises';
import { systemClock, type Clock } from '@pressly/time';

export type WorkerHeartbeat = Readonly<{ beat: () => Promise<void> }>;

export const makeFileHeartbeat = (input: {
  path: string;
  clock?: Clock;
  write?: (path: string, value: string) => Promise<void>;
}): WorkerHeartbeat => {
  const clock = input.clock ?? systemClock;
  const write = input.write ?? writeFile;

  return {
    beat: () => write(input.path, `${clock.now().toISOString()}\n`),
  };
};
