import type { CliIO } from '../../src/shell/io.ts';

export type TestWriter = Readonly<{
  write: (chunk: string | Uint8Array) => boolean;
  text: () => string;
}>;

export type TestCliIO = CliIO &
  Readonly<{
    stdout: TestWriter;
    stderr: TestWriter;
  }>;

export const makeTestWriter = (): TestWriter => {
  let value = '';

  return {
    write: (chunk) => {
      value += chunk.toString();
      return true;
    },
    text: () => value,
  };
};

export const makeTestIo = (): TestCliIO => ({
  stdout: makeTestWriter(),
  stderr: makeTestWriter(),
});
