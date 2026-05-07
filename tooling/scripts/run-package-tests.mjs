import { spawn } from 'node:child_process';

const run = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', () => resolve(1));
    child.on('close', resolve);
  });

const exitCode = await run('pnpm', [
  '--recursive',
  '--if-present',
  '--filter',
  './apps/*',
  '--filter',
  './packages/*',
  'test',
]);

process.exitCode = typeof exitCode === 'number' ? exitCode : 1;
