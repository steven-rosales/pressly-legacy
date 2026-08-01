import { readFile } from 'node:fs/promises';
import { Secret, TOTP } from 'otpauth';
import type { Page } from '@playwright/test';
import { browserEnvironment } from './environment';

type SyntheticCredential = Readonly<{ email: string; password: string }>;

const currentTotp = (secret: string): string =>
  new TOTP({
    issuer: 'Pressly Browser E2E',
    label: 'synthetic-owner',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();

const nextUnusedTotp = async (page: Page, secret: string): Promise<string> => {
  const periodMs = 30_000;
  const waitMs = periodMs - (Date.now() % periodMs) + 1_000;
  await page.waitForTimeout(waitMs);
  return currentTotp(secret);
};

export const readSyntheticCredential = async () => {
  const raw = await readFile(browserEnvironment.credentialFile, 'utf8');
  const credential = JSON.parse(raw) as SyntheticCredential;
  if (
    typeof credential.email !== 'string' ||
    typeof credential.password !== 'string'
  ) {
    throw new Error('The synthetic credential file is malformed.');
  }
  return credential;
};

export const signIn = async (
  page: Page,
  input: { origin: string; title: string; credential: SyntheticCredential },
) => {
  await page.goto(input.origin);
  await page.getByRole('heading', { name: input.title }).waitFor();
  await page.getByLabel('Email').fill(input.credential.email);
  await page.getByLabel('Password').fill(input.credential.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

export const enableMfa = async (
  page: Page,
): Promise<Readonly<{ secret: string; recoveryCode: string }>> => {
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  await page.goto(`${browserEnvironment.controlOrigin}/security`);
  await page.getByRole('heading', { name: 'Security', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Set up MFA' }).click();
  await page.getByRole('button', { name: 'Show setup key' }).click();
  const secret = await page
    .getByRole('textbox', { name: 'Setup key', exact: true })
    .inputValue();
  if (!/^[A-Z2-7]+=*$/.test(secret)) {
    throw new Error('Control returned an invalid synthetic MFA setup key.');
  }
  await page.getByLabel('Six-digit code').fill(currentTotp(secret));
  await page.getByRole('button', { name: 'Verify and enable' }).click();
  await page
    .getByRole('heading', { name: 'Save your recovery codes now' })
    .waitFor();
  const recoveryCode = (
    await page
      .getByLabel('Recovery codes')
      .locator('code')
      .first()
      .textContent()
  )?.trim();
  if (recoveryCode === undefined || recoveryCode.length < 16) {
    throw new Error('Control did not return a usable synthetic recovery code.');
  }
  await page.getByRole('button', { name: 'I saved these codes' }).click();
  await page.getByText('Your current session is MFA verified.').waitFor();
  return { secret, recoveryCode };
};

export const verifyProcessorWithTotp = async (page: Page, secret: string) => {
  await page.getByRole('heading', { name: 'Verify your identity' }).waitFor();
  await page
    .getByLabel('Six-digit code')
    .fill(await nextUnusedTotp(page, secret));
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
};
