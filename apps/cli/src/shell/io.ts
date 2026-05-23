export type CliWriter = Readonly<{
  write: (chunk: string) => unknown;
}>;

export type CliIO = Readonly<{
  stdin?: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream | CliWriter;
  stderr: NodeJS.WriteStream | CliWriter;
}>;

export const isTty = (stream: unknown): stream is NodeJS.WriteStream =>
  typeof stream === 'object' &&
  stream !== null &&
  'isTTY' in stream &&
  (stream as NodeJS.WriteStream).isTTY === true;
