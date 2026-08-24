import { makeBinarySecretBox } from '@pressly/auth-platform/secret-box';
import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';

export const CENTS_WEBHOOK_ADAPTER_VERSION = 'cents-webhook-v1';

const additionalAuthenticatedData = new TextEncoder().encode(
  'pressly:cents-webhook-quarantine:v1',
);

export type CentsWebhookPayloadCipher = Readonly<{
  encrypt: (rawBody: Uint8Array) => string;
  decrypt: (envelope: string) => Uint8Array;
}>;

const invalidKey = () =>
  configError({
    code: 'invalid_cents_webhook_quarantine_encryption_key',
    message:
      'CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    safeMessage: 'Cents webhook quarantine encryption is misconfigured.',
  });

export const makeCentsWebhookPayloadCipher = (
  base64Key: string,
): CentsWebhookPayloadCipher =>
  makeBinarySecretBox(
    base64Key,
    { additionalAuthenticatedData },
    {
      invalidKey,
      invalidEnvelope: () =>
        invariantViolationError({
          code: 'invalid_cents_webhook_quarantine_envelope',
          message: 'Stored Cents webhook quarantine envelope is invalid.',
        }),
    },
  );
