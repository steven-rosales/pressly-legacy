import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import type {
  CliInteractiveFrame,
  CliInteractiveKey,
  CliInteractiveSession,
} from '@pressly/cells';
import { validationError } from '@pressly/errors/factories';
import type { CliProcessEffectProviders } from './cli-host.js';

type InkTtyRuntime = NonNullable<CliProcessEffectProviders['tty']>;

type InkCliStreams = Readonly<{
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
}>;

type FrameState = Readonly<{
  frame: CliInteractiveFrame;
  revision: number;
}>;

const colorFor = (
  tone: 'default' | 'error' | 'info' | 'warning' | undefined,
): 'cyan' | 'yellow' | undefined =>
  tone === 'info' ? 'cyan' : tone === 'warning' ? 'yellow' : undefined;

const Frame = ({ frame }: { frame: CliInteractiveFrame }) => (
  <Box flexDirection="column">
    {frame.lines.map((line, index) => {
      const key = `${String(index)}-${line.text}`;
      const color = colorFor(line.tone);
      return color === undefined ? (
        <Text key={key}>{line.text}</Text>
      ) : (
        <Text key={key} color={color}>
          {line.text}
        </Text>
      );
    })}
  </Box>
);

type DriverProps = Readonly<{
  drive: (session: CliInteractiveSession) => Promise<number>;
  signal: AbortSignal;
  failed: (error: unknown) => void;
  scheduled: (rendered: () => void) => void;
}>;

const Driver = ({
  drive,
  signal,
  failed,
  scheduled,
}: DriverProps): ReactElement | null => {
  const app = useApp();
  const [frame, setFrame] = useState<FrameState | null>(null);
  const revision = useRef(0);
  const waiting = useRef<((key: CliInteractiveKey) => void) | undefined>(
    undefined,
  );
  const queued = useRef<CliInteractiveKey[]>([]);

  useInput((input, key) => {
    const value = Object.freeze({ input, escape: key.escape });
    const resolve = waiting.current;
    if (resolve === undefined) queued.current.push(value);
    else {
      waiting.current = undefined;
      resolve(value);
    }
  });

  useEffect(() => {
    let active = true;
    const session: CliInteractiveSession = Object.freeze({
      render: (next) =>
        new Promise<void>((resolve) => {
          revision.current += 1;
          scheduled(resolve);
          setFrame({ frame: next, revision: revision.current });
        }),
      readKey: ({ signal: readSignal }) => {
        const queuedKey = queued.current.shift();
        if (queuedKey !== undefined) return Promise.resolve(queuedKey);
        return new Promise<CliInteractiveKey>((resolve, reject) => {
          const abort = () => {
            waiting.current = undefined;
            reject(
              validationError({
                code: 'cli_interactive_aborted',
                message: 'The interactive CLI command was aborted.',
                safeMessage: 'The interactive CLI command was aborted.',
              }),
            );
          };
          if (readSignal.aborted) {
            abort();
            return;
          }
          waiting.current = (key) => {
            readSignal.removeEventListener('abort', abort);
            resolve(key);
          };
          readSignal.addEventListener('abort', abort, { once: true });
        });
      },
    });

    void drive(session).then(
      (exitCode) => {
        if (active) app.exit(exitCode);
      },
      (error: unknown) => {
        if (!active) return;
        failed(error);
        app.exit(1);
      },
    );
    return () => {
      active = false;
      waiting.current = undefined;
    };
  }, [app, drive, failed, scheduled, signal]);

  return frame === null ? null : (
    <Frame key={frame.revision} frame={frame.frame} />
  );
};

export const makeInkCliTty = (streams: InkCliStreams): InkTtyRuntime => ({
  isTTY: () => streams.stdout.isTTY === true,
  run: async ({ signal, drive }) => {
    let failure: unknown;
    const committed: (() => void)[] = [];
    const instance = render(
      <Driver
        drive={drive}
        signal={signal}
        scheduled={(rendered) => committed.push(rendered)}
        failed={(error) => {
          failure = error;
        }}
      />,
      {
        stdin: streams.stdin,
        stdout: streams.stdout,
        stderr: streams.stderr,
        patchConsole: false,
        exitOnCtrlC: false,
        onRender: () => committed.shift()?.(),
      },
    );
    const exitValue = await instance.waitUntilExit();
    if (failure !== undefined) throw failure;
    return typeof exitValue === 'number' ? exitValue : 0;
  },
});
