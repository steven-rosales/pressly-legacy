import { dirname, resolve } from 'node:path';

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required by the disposable browser topology.`);
  }
  return value;
};

const localOrigin = (name: string, hostname: string): string => {
  const value = required(name);
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== hostname ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      `${name} must be the local https://${hostname}:<port> origin.`,
    );
  }
  return url.origin;
};

const runtimeDir = resolve(required('PRESSLY_BROWSER_E2E_RUNTIME_DIR'));
if (!runtimeDir.startsWith('/tmp/pressly-browser-e2e.')) {
  throw new Error(
    'Browser credentials and session state must remain in a disposable /tmp directory.',
  );
}

const runtimeFile = (name: string, fileName: string): string => {
  const file = resolve(required(name));
  if (dirname(file) !== runtimeDir || file !== resolve(runtimeDir, fileName)) {
    throw new Error(`${name} must be ${fileName} directly inside runtimeDir.`);
  }
  return file;
};

export const browserEnvironment = Object.freeze({
  controlOrigin: localOrigin(
    'PRESSLY_BROWSER_E2E_CONTROL_ORIGIN',
    'control.pressly.test',
  ),
  processorOrigin: localOrigin(
    'PRESSLY_BROWSER_E2E_PROCESSOR_ORIGIN',
    'processor.pressly.test',
  ),
  credentialFile: runtimeFile(
    'PRESSLY_BROWSER_E2E_CREDENTIAL_FILE',
    'owner.json',
  ),
  runtimeDir,
  artifactDir: resolve(required('PRESSLY_BROWSER_E2E_ARTIFACT_DIR')),
  controlStorageState: resolve(runtimeDir, 'control-storage-state.json'),
  processorStorageState: resolve(runtimeDir, 'processor-storage-state.json'),
  mfaSecretFile: resolve(runtimeDir, 'mfa-secret.txt'),
});

export const allowedBrowserHostnames = new Set([
  'control.pressly.test',
  'processor.pressly.test',
]);
