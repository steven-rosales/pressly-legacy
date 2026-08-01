import { chmod, readFile, rm } from 'node:fs/promises';
import {
  readSyntheticCredential,
  signIn,
  verifyProcessorWithTotp,
} from '../support/authentication';
import { test } from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test.setTimeout(90_000);

test('@smoke provision an isolated Processor owner session', async ({
  page,
  context,
  browserDiagnostics,
}) => {
  browserDiagnostics.allowResponse(
    (response) =>
      response.status() === 401 &&
      new URL(response.url()).pathname === '/api/processor/auth/session',
  );
  try {
    const credential = await readSyntheticCredential();
    const mfaSecret = (
      await readFile(browserEnvironment.mfaSecretFile, 'utf8')
    ).trim();
    await signIn(page, {
      origin: browserEnvironment.processorOrigin,
      title: 'Sign in to Processor',
      credential,
    });
    await verifyProcessorWithTotp(page, mfaSecret);
    await context.storageState({
      path: browserEnvironment.processorStorageState,
    });
    await chmod(browserEnvironment.processorStorageState, 0o600);
  } finally {
    await rm(browserEnvironment.credentialFile, { force: true });
    await rm(browserEnvironment.mfaSecretFile, { force: true });
  }
});
