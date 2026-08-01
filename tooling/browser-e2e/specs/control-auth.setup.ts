import { chmod, writeFile } from 'node:fs/promises';
import {
  enableMfa,
  readSyntheticCredential,
  signIn,
} from '../support/authentication';
import { test } from '../support/browser-test';
import { browserEnvironment } from '../support/environment';

test('@smoke provision an MFA-verified Control owner session', async ({
  page,
  context,
  browserDiagnostics,
}) => {
  browserDiagnostics.allowResponse(
    (response) =>
      response.status() === 401 &&
      new URL(response.url()).pathname === '/api/control/auth/session',
  );
  const credential = await readSyntheticCredential();
  await signIn(page, {
    origin: browserEnvironment.controlOrigin,
    title: 'Sign in to Control',
    credential,
  });
  const { secret } = await enableMfa(page);
  await writeFile(browserEnvironment.mfaSecretFile, `${secret}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  await context.storageState({ path: browserEnvironment.controlStorageState });
  await chmod(browserEnvironment.controlStorageState, 0o600);
});
