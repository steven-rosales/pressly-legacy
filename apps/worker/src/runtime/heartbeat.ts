import { writeFile } from 'node:fs/promises';

export type WorkerHeartbeat = Readonly<{ beat: () => Promise<void> }>;

export const makeFileHeartbeat = (input: {
  path: string;
  clock?: Readonly<{ now: () => Date }>;
  write?: (path: string, value: string) => Promise<void>;
}): WorkerHeartbeat => {
  const clock = input.clock ?? { now: () => new Date() };
  const write = input.write ?? writeFile;

  return {
    beat: () => write(input.path, `${clock.now().toISOString()}\n`),
  };
};
